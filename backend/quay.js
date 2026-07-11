'use strict';

const assert = require('assert'),
    superagent = require('superagent');

module.exports = exports = {
    getReleases
};

const MAX_TAGS = 50;

async function getReleases(token, project) {
    assert.strictEqual(typeof project, 'object');

    const quayToken = process.env.QUAY_TOKEN || token;
    if (!quayToken) {
        console.warn('Quay provider: no token available (set QUAY_TOKEN env or user quayToken)');
        return [];
    }

    let result;
    try {
        result = await superagent
            .get(`https://quay.io/api/v1/repository/${project.name}/tag/?limit=${MAX_TAGS}&only_active_tags=true`)
            .set('Authorization', `Bearer ${quayToken}`);
    } catch (error) {
        if (error && error.status === 404) return [];
        throw error;
    }

    if (!result.body.tags) return [];

    return result.body.tags.map(function (tag) {
        return {
            projectId: project.id,
            version: tag.name,
            createdAt: tag.last_modified ? new Date(tag.last_modified).getTime() : 0,
            body: '',
            prerelease: false
        };
    });
}