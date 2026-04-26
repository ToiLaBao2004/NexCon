import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
];

function randomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getMeta($, key, attr = 'property') {
    return $(`meta[${attr}="${key}"]`).attr('content')?.trim() || '';
}

function safeHostname(url) {
    try { return new URL(url).hostname; }
    catch { return ''; }
}

async function fetchYouTubePreview(url) {
    const { data } = await axios.get(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
        { timeout: 5000 }
    );
    const videoId = url.match(/(?:watch\?v=|embed\/|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
    return {
        url,
        title: data.title || '',
        description: '',
        image: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '',
        siteName: 'YouTube',
        hostname: 'www.youtube.com',
    };
}

async function fetchGenericPreview(url, hostname) {
    const { data: html } = await axios.get(url, {
        timeout: 8000,
        maxRedirects: 5,
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

    return {
        url,
        title:
            getMeta($, 'og:title') ||
            getMeta($, 'twitter:title', 'name') ||
            $('title').first().text().trim() ||
            '',
        description:
            getMeta($, 'og:description') ||
            getMeta($, 'twitter:description', 'name') ||
            getMeta($, 'description', 'name') ||
            '',
        image:
            getMeta($, 'og:image') ||
            getMeta($, 'twitter:image', 'name') ||
            '',
        siteName: getMeta($, 'og:site_name') || '',
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
            console.error('Scrape error:', scrapeErr.message, 'for', url);
            return { url, hostname };
        }

    } catch {
        return { url, hostname: safeHostname(url) };
    }
}