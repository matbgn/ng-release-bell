'use strict';

const assert = require('assert'),
    superagent = require('superagent'),
    { withTimeout } = require('./http-common.js');

module.exports = exports = {
    getReleases
};

const MAX_TAGS = 50;

async function getReleases(token, project) {
    assert.strictEqual(typeof project, 'object');

    let allTags = [];
    let url = `https://hub.docker.com/v2/repositories/${project.name}/tags?page_size=100&ordering=last_updated`;

    while (url && allTags.length < MAX_TAGS) {
        let result;
        try {
            result = await withTimeout(superagent.get(url));
        } catch (error) {
            if (error && error.status === 404) return [];
            throw error;
        }

        for (const tag of result.body.results) {
            allTags.push({
                projectId: project.id,
                version: tag.name,
                createdAt: tag.tag_last_pushed ? new Date(tag.tag_last_pushed).getTime() : 0,
                body: '',
                prerelease: false
            });
            if (allTags.length >= MAX_TAGS) break;
        }

        url = result.body.next;
    }

    return allTags;
}