'use strict';

const assert = require('assert'),
    superagent = require('superagent');

module.exports = exports = {
    getReleases
};

const MAX_VERSIONS = 50;

async function getReleases(token, project) {
    assert.strictEqual(typeof project, 'object');

    const headers = {};
    if (process.env.NPM_TOKEN || token) {
        headers.Authorization = `Bearer ${process.env.NPM_TOKEN || token}`;
    }

    let result;
    try {
        result = await superagent.get(`https://registry.npmjs.org/${encodeURIComponent(project.name)}`).set(headers);
    } catch (error) {
        if (error && error.status === 404) return [];
        throw error;
    }

    const body = result.body;
    if (!body.time) return [];

    const versions = Object.keys(body.time)
        .filter(v => v !== 'created' && v !== 'modified')
        .map(v => ({
            projectId: project.id,
            version: v,
            createdAt: body.time[v] ? new Date(body.time[v]).getTime() : 0,
            body: '',
            prerelease: false
        }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return versions.slice(0, MAX_VERSIONS);
}