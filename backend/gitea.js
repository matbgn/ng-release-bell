'use strict';

const assert = require('assert'),
    superagent = require('superagent');

module.exports = exports = {
    getReleases,
    getRelease,
    getCommit
};

const MAX_TAGS = 50;

async function getReleases(token, project) {
    assert.strictEqual(typeof project, 'object');

    const [ owner, repo ] = project.name.split('/');

    let result;
    try {
        result = await superagent.get(`${project.origin}/api/v1/repos/${owner}/${repo}/tags?limit=${MAX_TAGS}`);
    } catch (error) {
        if (error && error.status === 404) return [];
        throw error;
    }

    return result.body.map(function (r) {
        return {
            projectId: project.id,
            version: r.name,
            sha: r.commit ? r.commit.sha : '',
            body: '',
            prerelease: false
        };
    });
}

function getRelease(token, project, version) {
    assert.strictEqual(typeof project, 'object');
    assert.strictEqual(typeof version, 'string');

    return { body: '', prerelease: false };
}

async function getCommit(token, project, sha) {
    assert.strictEqual(typeof project, 'object');
    assert.strictEqual(typeof sha, 'string');

    const [ owner, repo ] = project.name.split('/');

    const result = await superagent.get(`${project.origin}/api/v1/repos/${owner}/${repo}/git/commits/${sha}`);

    return {
        createdAt: result.body.created || (result.body.commit && result.body.commit.committer && result.body.commit.committer.date),
        message: result.body.commit ? result.body.commit.message : (result.body.message || '')
    };
}