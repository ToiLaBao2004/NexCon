import axios from 'axios';
import * as cheerio from 'cheerio';

function getMeta($, key, attr = 'property') {
    return $(`meta[${attr}="${key}"]`).attr('content')?.trim() || '';
}

export async function fetchLinkPreview(url) {
    try {
        const { data: html } = await axios.get(url, {
            timeout: 8000,
            maxRedirects: 5,
            headers: {
                'User-Agent': 'Mozilla/5.0',
            },
        });

        const $ = cheerio.load(html);

        const title =
            getMeta($, 'og:title') ||
            $('title').first().text().trim() ||
            '';

        const description =
            getMeta($, 'og:description') ||
            getMeta($, 'description', 'name') ||
            '';

        const image = getMeta($, 'og:image') || '';
        const siteName = getMeta($, 'og:site_name') || '';

        const hostname = new URL(url).hostname;

        return {
            url,
            title,
            description,
            image,
            siteName,
            hostname,
        };
    } catch (error) {
        return {
            url,
            hostname: new URL(url).hostname,
        };
    }
}