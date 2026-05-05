import axios from 'axios';
import * as cheerio from 'cheerio';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

const MAX_REDIRECTS = 5;
const MAX_PREVIEW_BYTES = 1024 * 1024;
const BROWSER_HEADERS = {
    'User-Agent': USER_AGENTS[0],
    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
};
const JSON_HEADERS = {
    ...BROWSER_HEADERS,
    Accept: 'application/json,text/plain,*/*',
};

function randomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getMeta($, key, attr = 'property') {
    return $(`meta[${attr}="${key}"]`).attr('content')?.trim() || '';
}

function getMetaAny($, key) {
    return firstNonEmpty(
        getMeta($, key, 'property'),
        getMeta($, key, 'name'),
        getMeta($, key, 'itemprop')
    );
}

function firstNonEmpty(...values) {
    return values.find((value) => typeof value === 'string' && value.trim())?.trim() || '';
}

function safeHostname(url) {
    try { return new URL(url).hostname; }
    catch { return ''; }
}

function toAbsoluteUrl(value, baseUrl) {
    if (!value) return '';

    try {
        return new URL(value, baseUrl).toString();
    } catch {
        return value;
    }
}

function collectJsonLdObjects(value, output = []) {
    if (!value || typeof value !== 'object') return output;

    if (Array.isArray(value)) {
        value.forEach((item) => collectJsonLdObjects(item, output));
        return output;
    }

    output.push(value);

    if (value['@graph']) {
        collectJsonLdObjects(value['@graph'], output);
    }

    return output;
}

function extractJsonLdPreview($) {
    const scripts = $('script[type="application/ld+json"]').toArray();
    const objects = [];

    for (const script of scripts) {
        const raw = $(script).contents().text().trim();
        if (!raw) continue;

        try {
            collectJsonLdObjects(JSON.parse(raw), objects);
        } catch {
            continue;
        }
    }

    const candidate = objects.find((item) => item.name || item.headline || item.description || item.image) || {};
    const rawImage = Array.isArray(candidate.image) ? candidate.image[0] : candidate.image;
    const image = typeof rawImage === 'object' ? rawImage?.url : rawImage;

    return {
        title: firstNonEmpty(candidate.name, candidate.headline),
        description: firstNonEmpty(candidate.description),
        image: firstNonEmpty(image),
    };
}

function createPreviewSecurityError(message) {
    const error = new Error(message);
    error.code = 'UNSAFE_PREVIEW_URL';
    return error;
}

function normalizeHostname(hostname = '') {
    return hostname
        .trim()
        .toLowerCase()
        .replace(/^\[(.*)\]$/, '$1')
        .replace(/\.$/, '');
}

function ipv4ToNumber(address) {
    const parts = address.split('.').map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
        return null;
    }

    return parts.reduce((acc, part) => (acc << 8) + part, 0) >>> 0;
}

function isIpv4InCidr(addressNumber, cidrBase, prefixLength) {
    const baseNumber = ipv4ToNumber(cidrBase);
    if (baseNumber == null) return false;

    const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
    return (addressNumber & mask) === (baseNumber & mask);
}

function isBlockedIpv4(address) {
    const addressNumber = ipv4ToNumber(address);
    if (addressNumber == null) return true;

    return [
        ['0.0.0.0', 8],
        ['10.0.0.0', 8],
        ['100.64.0.0', 10],
        ['127.0.0.0', 8],
        ['169.254.0.0', 16],
        ['172.16.0.0', 12],
        ['192.0.0.0', 24],
        ['192.0.2.0', 24],
        ['192.168.0.0', 16],
        ['198.18.0.0', 15],
        ['198.51.100.0', 24],
        ['203.0.113.0', 24],
        ['224.0.0.0', 4],
        ['240.0.0.0', 4],
    ].some(([base, prefix]) => isIpv4InCidr(addressNumber, base, prefix));
}

function expandEmbeddedIpv4(address) {
    if (!address.includes('.')) return address;

    const lastColonIndex = address.lastIndexOf(':');
    if (lastColonIndex === -1) return address;

    const ipv4 = address.slice(lastColonIndex + 1);
    const ipv4Number = ipv4ToNumber(ipv4);
    if (ipv4Number == null) return address;

    const high = ((ipv4Number >>> 16) & 0xffff).toString(16);
    const low = (ipv4Number & 0xffff).toString(16);

    return `${address.slice(0, lastColonIndex)}:${high}:${low}`;
}

function ipv6ToBigInt(address) {
    const normalized = expandEmbeddedIpv4(address.split('%')[0].toLowerCase());
    const sections = normalized.split('::');
    if (sections.length > 2) return null;

    const left = sections[0] ? sections[0].split(':').filter(Boolean) : [];
    const right = sections[1] ? sections[1].split(':').filter(Boolean) : [];
    const missing = 8 - left.length - right.length;

    if (missing < 0 || (sections.length === 1 && missing !== 0)) {
        return null;
    }

    const groups = [
        ...left,
        ...Array(missing).fill('0'),
        ...right,
    ];

    if (groups.length !== 8) return null;

    let result = 0n;
    for (const group of groups) {
        if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
        result = (result << 16n) + BigInt(parseInt(group, 16));
    }

    return result;
}

function isIpv6InCidr(addressBigInt, cidrBase, prefixLength) {
    const baseBigInt = ipv6ToBigInt(cidrBase);
    if (baseBigInt == null) return false;
    if (prefixLength === 0) return true;

    const shift = BigInt(128 - prefixLength);
    return (addressBigInt >> shift) === (baseBigInt >> shift);
}

function isBlockedIpv6(address) {
    const addressBigInt = ipv6ToBigInt(address);
    if (addressBigInt == null) return true;

    return [
        ['::', 128],
        ['::1', 128],
        ['::ffff:0:0', 96],
        ['64:ff9b::', 96],
        ['100::', 64],
        ['2001::', 32],
        ['2001:2::', 48],
        ['2001:db8::', 32],
        ['2002::', 16],
        ['fc00::', 7],
        ['fe80::', 10],
        ['ff00::', 8],
    ].some(([base, prefix]) => isIpv6InCidr(addressBigInt, base, prefix));
}

function isBlockedHostname(hostname) {
    return (
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal') ||
        hostname.endsWith('.home.arpa')
    );
}

function assertPublicIp(address) {
    const ipVersion = net.isIP(address);
    if (ipVersion === 4 && isBlockedIpv4(address)) {
        throw createPreviewSecurityError(`Blocked private or reserved IPv4 address: ${address}`);
    }

    if (ipVersion === 6 && isBlockedIpv6(address)) {
        throw createPreviewSecurityError(`Blocked private or reserved IPv6 address: ${address}`);
    }

    if (!ipVersion) {
        throw createPreviewSecurityError(`Invalid IP address: ${address}`);
    }
}

async function resolvePublicHostname(hostname) {
    const safeHost = normalizeHostname(hostname);
    if (!safeHost) {
        throw createPreviewSecurityError('URL hostname is empty.');
    }

    if (isBlockedHostname(safeHost)) {
        throw createPreviewSecurityError(`Blocked local hostname: ${safeHost}`);
    }

    const ipVersion = net.isIP(safeHost);
    if (ipVersion) {
        assertPublicIp(safeHost);
        return [{ address: safeHost, family: ipVersion }];
    }

    const records = await dns.lookup(safeHost, { all: true, verbatim: true });
    if (!records.length) {
        throw createPreviewSecurityError(`Hostname has no DNS records: ${safeHost}`);
    }

    records.forEach((record) => assertPublicIp(record.address));
    return records;
}

async function assertSafePreviewUrl(url) {
    const parsed = url instanceof URL ? url : new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw createPreviewSecurityError(`Blocked unsupported protocol: ${parsed.protocol}`);
    }

    await resolvePublicHostname(parsed.hostname);
    return parsed;
}

function createSafeLookup() {
    return async (hostname, options, callback) => {
        const cb = typeof options === 'function' ? options : callback;
        try {
            const records = await resolvePublicHostname(hostname);
            const lookupOptions = typeof options === 'object' ? options : {};
            const family = lookupOptions.family || 0;

            if (lookupOptions.all) {
                const selectedRecords = records.filter((record) => !family || record.family === family);
                cb(null, selectedRecords.length ? selectedRecords : records);
                return;
            }

            const selectedRecord = records.find((record) => !family || record.family === family) || records[0];

            cb(null, selectedRecord.address, selectedRecord.family);
        } catch (error) {
            cb(error);
        }
    };
}

async function safeAxiosGet(url, config = {}) {
    let currentUrl = await assertSafePreviewUrl(url);
    const safeLookup = createSafeLookup();
    const {
        maxContentLength = MAX_PREVIEW_BYTES,
        ...safeConfig
    } = config;
    const requestConfig = {
        ...safeConfig,
        maxContentLength,
        maxRedirects: 0,
        proxy: false,
        httpAgent: new http.Agent({ lookup: safeLookup }),
        httpsAgent: new https.Agent({ lookup: safeLookup }),
        validateStatus: (status) => (status >= 200 && status < 400),
    };

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
        const response = await axios.get(currentUrl.toString(), requestConfig);

        if (response.status < 300 || response.status >= 400) {
            return response;
        }

        const redirectLocation = response.headers?.location;
        if (!redirectLocation) {
            return response;
        }

        currentUrl = await assertSafePreviewUrl(new URL(redirectLocation, currentUrl));
    }

    throw createPreviewSecurityError('Too many redirects while fetching link preview.');
}

function isAllowedTrustedPreviewHost(hostname, allowedHosts) {
    const host = normalizeHostname(hostname);
    return allowedHosts.some((allowedHost) => {
        const safeAllowedHost = normalizeHostname(allowedHost);
        return host === safeAllowedHost || host.endsWith(`.${safeAllowedHost}`);
    });
}

async function trustedHostAxiosGet(url, allowedHosts, config = {}) {
    let currentUrl = new URL(url);
    const {
        maxContentLength = MAX_PREVIEW_BYTES,
        ...trustedConfig
    } = config;

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
        if (!['http:', 'https:'].includes(currentUrl.protocol)) {
            throw createPreviewSecurityError(`Blocked unsupported protocol: ${currentUrl.protocol}`);
        }

        if (!isAllowedTrustedPreviewHost(currentUrl.hostname, allowedHosts)) {
            throw createPreviewSecurityError(`Blocked redirect to untrusted preview host: ${currentUrl.hostname}`);
        }

        const response = await axios.get(currentUrl.toString(), {
            ...trustedConfig,
            maxContentLength,
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400,
        });

        if (response.status < 300 || response.status >= 400) {
            return response;
        }

        const redirectLocation = response.headers?.location;
        if (!redirectLocation) {
            return response;
        }

        currentUrl = new URL(redirectLocation, currentUrl);
    }

    throw createPreviewSecurityError('Too many redirects while fetching trusted link preview.');
}

function extractYouTubeVideoId(url) {
    try {
        const parsed = new URL(url);
        const hostname = normalizeHostname(parsed.hostname);

        if (hostname === 'youtu.be') {
            return parsed.pathname.split('/').filter(Boolean)[0] || '';
        }

        if (hostname.endsWith('youtube.com')) {
            if (parsed.pathname === '/watch') {
                return parsed.searchParams.get('v') || '';
            }

            const match = parsed.pathname.match(/^\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})/);
            return match?.[1] || '';
        }
    } catch {
        return '';
    }

    return '';
}

function parseYouTubePlayerDetails(html = '') {
    const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var\s+meta|<\/script>)/s);
    if (!match?.[1]) {
        return {};
    }

    try {
        const parsed = JSON.parse(match[1]);
        const details = parsed?.videoDetails || {};
        return {
            title: typeof details.title === 'string' ? details.title : '',
            description: typeof details.shortDescription === 'string' ? details.shortDescription : '',
        };
    } catch {
        return {};
    }
}

async function fetchYouTubePage(url) {
    return trustedHostAxiosGet(url, ['youtube.com', 'googlevideo.com'], {
        timeout: 8000,
        maxContentLength: 5 * 1024 * 1024,
        headers: {
            ...BROWSER_HEADERS,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Cache-Control': 'no-cache',
        },
    });
}

function logSettledFailure(label, result) {
    if (result.status === 'fulfilled') return;

    const error = result.reason;
    console.error(
        `${label} error:`,
        error?.response?.status || error?.code || error?.message || error
    );
}

function getPreviewErrorSummary(error) {
    if (!error) return 'Unknown error';
    if (error.response?.status) return `HTTP ${error.response.status}`;
    if (error.code) return error.code;
    if (error.message) return error.message;
    if (Array.isArray(error.errors) && error.errors.length > 0) {
        return error.errors
            .map((item) => item?.code || item?.message)
            .filter(Boolean)
            .join(', ') || 'Aggregate request error';
    }
    return String(error);
}

async function fetchYouTubePreview(url) {
    const videoId = extractYouTubeVideoId(url);
    const canonicalUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;
    const metadataUrl = videoId
        ? `https://www.youtube.com/watch?v=${videoId}&hl=vi&gl=VN&bpctr=9999999999&has_verified=1`
        : canonicalUrl;

    const [oembedRes, pageRes, noembedRes] = await Promise.allSettled([
        trustedHostAxiosGet(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`,
            ['youtube.com'],
            { timeout: 5000, headers: JSON_HEADERS }
        ),
        fetchYouTubePage(metadataUrl),
        trustedHostAxiosGet(
            `https://noembed.com/embed?url=${encodeURIComponent(canonicalUrl)}`,
            ['noembed.com'],
            { timeout: 5000, headers: JSON_HEADERS }
        ),
    ]);

    logSettledFailure('YouTube oEmbed', oembedRes);
    logSettledFailure('YouTube page preview', pageRes);
    logSettledFailure('YouTube noembed', noembedRes);

    const oembedData = oembedRes.status === 'fulfilled' ? oembedRes.value.data : {};
    const noembedData = noembedRes.status === 'fulfilled' ? noembedRes.value.data : {};

    let pageTitle = '';
    let description = '';
    let playerDetails = {};
    if (pageRes.status === 'fulfilled') {
        const $ = cheerio.load(pageRes.value.data);
        playerDetails = parseYouTubePlayerDetails(pageRes.value.data);
        pageTitle = firstNonEmpty(
            getMeta($, 'og:title'),
            getMeta($, 'twitter:title', 'name'),
            getMeta($, 'title', 'name'),
            $('title').first().text().replace(/\s*-\s*YouTube\s*$/i, '')
        );
        description = firstNonEmpty(
            getMeta($, 'og:description'),
            getMeta($, 'twitter:description', 'name'),
            getMeta($, 'description', 'name'),
            playerDetails.description
        );
    }

    return {
        url,
        title: firstNonEmpty(
            oembedData.title,
            noembedData.title,
            playerDetails.title,
            pageTitle
        ),
        description: firstNonEmpty(description, noembedData.description),
        image: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '',
        siteName: 'YouTube',
        hostname: 'www.youtube.com',
    };
}

async function fetchGenericPreview(url, hostname) {
    const { data: html } = await safeAxiosGet(url, {
        timeout: 8000,
        headers: {
            'User-Agent': randomUA(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
        },
    });

    const $ = cheerio.load(html);
    const jsonLdPreview = extractJsonLdPreview($);
    const rawImage = firstNonEmpty(
        getMetaAny($, 'og:image:secure_url'),
        getMetaAny($, 'og:image'),
        getMetaAny($, 'twitter:image'),
        getMetaAny($, 'image'),
        jsonLdPreview.image
    );

    return {
        url,
        title: firstNonEmpty(
            getMetaAny($, 'og:title'),
            getMetaAny($, 'twitter:title'),
            getMetaAny($, 'title'),
            jsonLdPreview.title,
            $('h1').first().text(),
            $('title').first().text()
        ),
        description: firstNonEmpty(
            getMetaAny($, 'og:description'),
            getMetaAny($, 'twitter:description'),
            getMetaAny($, 'description'),
            jsonLdPreview.description,
            $('p').first().text()
        ),
        image: toAbsoluteUrl(rawImage, url),
        siteName: firstNonEmpty(getMetaAny($, 'og:site_name'), hostname),
        hostname,
    };
}

export async function fetchLinkPreview(url) {
    try {
        const hostname = new URL(url).hostname.replace('www.', '');

        // YouTube — dùng oEmbed chính thức
        if (hostname === 'youtube.com' || hostname === 'youtu.be') {
            try {
                return await fetchYouTubePreview(url);
            } catch (ytErr) {
                console.error('YouTube oEmbed error:', ytErr.message);
                return { url, hostname };
            }
        }

        // Mọi site còn lại — scrape với browser headers
        try {
            return await fetchGenericPreview(url, hostname);
        } catch (scrapeErr) {
            console.error('Scrape error:', getPreviewErrorSummary(scrapeErr), 'for', url);
            return { url, hostname };
        }

    } catch {
        return { url, hostname: safeHostname(url) };
    }
}
