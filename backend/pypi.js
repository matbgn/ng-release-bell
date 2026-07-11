'use strict';

const assert = require('assert'),
    superagent = require('superagent');

module.exports = exports = {
    getReleases
};

const MAX_VERSIONS = 50;

async function getReleases(token, project) {
    assert.strictEqual(typeof project, 'object');

    let result;
    try {
        result = await superagent.get(`https://pypi.org/pypi/${encodeURIComponent(project.name)}/json`);
    } catch (error) {
        if (error && error.status === 404) return [];
        throw error;
    }

    const body = result.body;
    if (!body.releases) return [];

    const versions = [];
    for (const [version, files] of Object.entries(body.releases)) {
        if (!files || files.length === 0) continue;
        const uploadTime = files[0].upload_time_iso_8601 || files[0].upload_time;
        versions.push({
            projectId: project.id,
            version: version,
            createdAt: uploadTime ? new Date(uploadTime).getTime() : 0,
            body: '',
            prerelease: false
        });
    }

    versions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return versions.slice(0, MAX_VERSIONS);
}