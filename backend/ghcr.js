'use strict';

const assert = require('assert'),
    superagent = require('superagent');

module.exports = exports = {
    getReleases
};

const MAX_VERSIONS = 50;
const GITHUB_API = 'https://api.github.com';

async function getReleases(token, project) {
    assert.strictEqual(typeof project, 'object');

    const githubToken = process.env.GITHUB_TOKEN || token;
    if (!githubToken) {
        console.warn('GHCR: no GitHub token available (required for GitHub Packages API)');
        return [];
    }

    const [owner, packageName] = project.name.split('/');
    if (!owner || !packageName) {
        console.error('GHCR: invalid project name, expected owner/package');
        return [];
    }

    const headers = {
        Authorization: `Bearer ${githubToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'NGReleaseBell'
    };

    let versions = await fetchPackageVersions('orgs', owner, packageName, headers, project.id);
    if (versions.length === 0) {
        versions = await fetchPackageVersions('users', owner, packageName, headers, project.id);
    }

    const semverVersions = versions.filter(v => /^\d+\.\d+/.test(v.version));
    const result = (semverVersions.length > 0 ? semverVersions : versions)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, MAX_VERSIONS);

    return result;
}

async function fetchPackageVersions(scope, owner, packageName, headers, projectId) {
    const releases = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && releases.length < 500) {
        let result;
        try {
            result = await superagent
                .get(`${GITHUB_API}/${scope}/${owner}/packages/container/${encodeURIComponent(packageName)}/versions`)
                .query({ per_page: 100, page, state: 'active' })
                .set(headers)
                .ok(res => res.status < 400);
        } catch (error) {
            if (error && error.status === 404) return [];
            console.error(`GHCR: failed to fetch package versions (${scope}/${owner}):`, error.message);
            return [];
        }

        if (!result.body || !Array.isArray(result.body) || result.body.length === 0) {
            hasMore = false;
            break;
        }

        for (const version of result.body) {
            const tags = version.metadata && version.metadata.container && version.metadata.container.tags
                ? version.metadata.container.tags
                : [];

            const createdAt = version.created_at ? new Date(version.created_at).getTime() : 0;

            for (const tag of tags) {
                releases.push({
                    projectId,
                    version: tag,
                    createdAt,
                    body: '',
                    prerelease: false
                });
            }
        }

        page++;
        hasMore = result.body.length === 100;
    }

    return releases;
}