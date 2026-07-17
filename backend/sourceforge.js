'use strict';

const assert = require('assert'),
    superagent = require('superagent'),
    { withTimeout } = require('./http-common.js');

module.exports = exports = {
    getReleases
};

const MAX_ITEMS = 50;

function stripTags(html) {
    return html.replace(/<[^>]*>/g, '').trim();
}

function extractVersion(title) {
    let cleaned = title.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    const basename = cleaned.split('/').pop();
    const stripped = basename.replace(/\.(tar\.(gz|xz|bz2)|zip|tgz|dmg|pkg|exe|deb|rpm|AppImage)$/, '');
    const match = stripped.match(/(\d+\.\d+(?:\.\d+)?(?:[-._]\w+)*)/);
    if (match) return match[1];
    return stripped;
}

function parseRSS(xml) {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let itemMatch;

    while ((itemMatch = itemRegex.exec(xml)) !== null && items.length < MAX_ITEMS) {
        const itemXml = itemMatch[1];

        const titleMatch = itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/i);
        const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
        const descMatch = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/i);

        const title = titleMatch ? (titleMatch[1] || titleMatch[2] || '').trim() : '';
        const pubDate = pubDateMatch ? pubDateMatch[1].trim() : '';
        const description = descMatch ? stripTags(descMatch[1] || descMatch[2] || '') : '';

        items.push({
            version: extractVersion(title),
            createdAt: pubDate ? new Date(pubDate).getTime() : 0,
            body: description,
            prerelease: false
        });
    }

    return items;
}

async function getReleases(token, project) {
    assert.strictEqual(typeof project, 'object');

    let result;
    try {
        result = await withTimeout(superagent
            .get(`https://sourceforge.net/projects/${encodeURIComponent(project.name)}/rss`)
            .buffer(true)
            .parse((res, cb) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => cb(null, data));
            }));
    } catch (error) {
        if (error && error.status === 404) return [];
        console.error('SourceForge: failed to fetch RSS', error.message);
        return [];
    }

    try {
        const xml = typeof result.body === 'string' ? result.body : (result.text || '');
        const items = parseRSS(xml);
        return items.map(function (item) {
            return {
                projectId: project.id,
                version: item.version,
                createdAt: item.createdAt,
                body: item.body,
                prerelease: false
            };
        });
    } catch (error) {
        console.error('SourceForge: failed to parse RSS', error.message);
        return [];
    }
}