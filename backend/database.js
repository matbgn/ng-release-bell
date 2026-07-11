'use strict';

const assert = require('assert'),
    uuid = require('uuid'),
    mysql = require('mysql2');

module.exports = exports = {
    init: init,

    PROJECT_TYPE_GITHUB: 'github',
    PROJECT_TYPE_GITHUB_MANUAL: 'github_manual',
    PROJECT_TYPE_GITLAB: 'gitlab',
    PROJECT_TYPE_WEBSITE: 'website',
    PROJECT_TYPE_GITEA: 'gitea',
    PROJECT_TYPE_NPM: 'npm',
    PROJECT_TYPE_PYPI: 'pypi',
    PROJECT_TYPE_DOCKERHUB: 'dockerhub',
    PROJECT_TYPE_QUAY: 'quay',
    PROJECT_TYPE_GHCR: 'ghcr',
    PROJECT_TYPE_SOURCEFORGE: 'sourceforge',

    users: {
        list: usersList,
        add: usersAdd,
        get: usersGet,
        update: usersUpdate
    },

    projects: {
        list: projectsList,
        listByType: projectsListByType,
        listAllWithPendingReleases: projectsListAllWithPendingReleases,
        add: projectsAdd,
        get: projectsGet,
        update: projectsUpdate,
        remove: projectsRemove
    },

    releases: {
        list: releasesList,
        listAllPending: releasesListAllPending,
        listPendingForProject: releasesListPendingForProject,
        add: releasesAdd,
        update: releasesUpdate
    }
};

var db = null;

function init() {
    const config = require('../database.json');

    if (!config.defaultEnv) {
        console.error('defaultEnv missing from database.json');
        process.exit(1);
    }

    db = mysql.createPool({
        connectionLimit: 10,
        waitForConnections: true,
        host: config[config.defaultEnv].host,
        port: config[config.defaultEnv].port,
        user: config[config.defaultEnv].user,
        password: config[config.defaultEnv].password,
        database: config[config.defaultEnv].database
    }).promise();
}

function projectPostprocess(p) {
    if (p.lastSuccessfulSyncAt === '0000-00-00 00:00:00') p.lastSuccessfulSyncAt = 0;
    p.enabled = !!p.enabled;
    return p;
}

async function projectsList(userId) {
    assert.strictEqual(typeof userId, 'string');

    // we order by lastSuccessfulSyncAt so that if we hit API rate limits, each project gets a chance eventually
    const [result] = await db.query('SELECT projects.*,releases.version,releases.createdAt FROM projects LEFT JOIN releases on releases.id = (SELECT releases.id FROM releases WHERE projectId=projects.id ORDER BY createdAt DESC LIMIT 1) WHERE userId=? ORDER BY lastSuccessfulSyncAt ASC', [ userId ]);

    result.forEach(projectPostprocess);

    // apply version filters to find the latest release that passes the filter for each project
    const { passesVersionFilters } = require('./regex-validator.js');
    const NON_SEMVER_TAGS = ['latest', 'stable', 'develop', 'main', 'master', 'edge', 'nightly'];
    for (const project of result) {
        const [releases] = await db.query('SELECT version, createdAt, prerelease FROM releases WHERE projectId=? ORDER BY createdAt DESC', [ project.id ]);

        const filtered = releases.filter(r => {
            if (NON_SEMVER_TAGS.includes(r.version.toLowerCase())) return false;
            if (!passesVersionFilters(r.version, project.versionFilters)) return false;
            if (project.excludePrereleases && r.prerelease) return false;
            return true;
        });

        if (filtered.length > 0) {
            project.version = filtered[0].version;
            project.createdAt = filtered[0].createdAt;
        } else if (project.version) {
            // no filtered releases but we have a raw version from the JOIN — check if it's semver
            if (NON_SEMVER_TAGS.includes(project.version.toLowerCase())) {
                project.version = null;
                project.createdAt = null;
            }
        }
    }

    return result;
}

async function projectsListByType(userId, type) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof type, 'string');

    const [result] = await db.query('SELECT projects.*,releases.version,releases.createdAt FROM projects LEFT JOIN releases on releases.id = (SELECT releases.id FROM releases WHERE projectId=projects.id ORDER BY createdAt DESC LIMIT 1) WHERE userId=? AND type=?', [ userId, type ]);

    result.forEach(projectPostprocess);

    return result;
}

async function projectsAdd(project) {
    assert.strictEqual(typeof project, 'object');

    project.id = uuid.v4();
    project.enabled = true;
    project.lastSuccessfulSyncAt = 0;
    project.origin = project.origin || '';
    project.emailFrequency = project.emailFrequency || 'instant';
    project.excludePrereleases = project.excludePrereleases || false;
    project.excludeUpdated = project.excludeUpdated || false;
    project.versionFilters = project.versionFilters || null;
    project.lastNotifiedAt = 0;

    db.query('INSERT INTO projects (id, userId, name, origin, enabled, lastSuccessfulSyncAt, type, emailFrequency, excludePrereleases, excludeUpdated, versionFilters, lastNotifiedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
        [ project.id, project.userId, project.name, project.origin, project.enabled, project.lastSuccessfulSyncAt, project.type, project.emailFrequency, project.excludePrereleases, project.excludeUpdated, project.versionFilters, project.lastNotifiedAt ]);

    return projectPostprocess(project);
}

async function projectsGet(projectId) {
    assert.strictEqual(typeof projectId, 'string');

    const [result] = await db.query('SELECT * FROM projects WHERE id=?', [ projectId ]);
    if (!result.length) throw new Error('not found');

    return projectPostprocess(result[0]);
}

async function projectsUpdate(projectId, data) {
    assert.strictEqual(typeof projectId, 'string');
    assert.strictEqual(typeof data, 'object');

    const allowed = {};
    if (data.enabled !== undefined) allowed.enabled = data.enabled;
    if (data.name !== undefined) allowed.name = data.name;
    if (data.type !== undefined) allowed.type = data.type;
    if (data.origin !== undefined) allowed.origin = data.origin;
    if (data.lastSuccessfulSyncAt !== undefined) allowed.lastSuccessfulSyncAt = data.lastSuccessfulSyncAt;
    if (data.emailFrequency !== undefined) allowed.emailFrequency = data.emailFrequency;
    if (data.excludePrereleases !== undefined) allowed.excludePrereleases = data.excludePrereleases;
    if (data.excludeUpdated !== undefined) allowed.excludeUpdated = data.excludeUpdated;
    if (data.versionFilters !== undefined) allowed.versionFilters = data.versionFilters;
    if (data.lastNotifiedAt !== undefined) allowed.lastNotifiedAt = data.lastNotifiedAt;

    if (Object.keys(allowed).length === 0) return;

    await db.query('UPDATE projects SET ? WHERE id=?', [ allowed, projectId ]);
}

async function projectsRemove(projectId) {
    assert.strictEqual(typeof projectId, 'string');

    await db.query('DELETE FROM releases WHERE projectId=?', [ projectId ]);
    await db.query('DELETE FROM projects WHERE id=?', [ projectId ]);
}

async function projectsListAllWithPendingReleases() {
    const [result] = await db.query('SELECT DISTINCT p.* FROM projects p INNER JOIN releases r ON r.projectId = p.id WHERE r.notified=FALSE', []);
    result.forEach(projectPostprocess);
    return result;
}

async function usersList() {
    const [result] = await db.query('SELECT * FROM users', []);
    return result;
}

async function usersAdd(user) {
    assert.strictEqual(typeof user, 'object');

    await db.query('INSERT INTO users (id, email, githubToken) VALUES (?, ?, ?)',
        [ user.id, user.email, user.githubToken ]);

    return user;
}

async function usersGet(userId) {
    assert.strictEqual(typeof userId, 'string');

    const [result] = await db.query('SELECT * FROM users WHERE id=?', [ userId ]);
    if (!result.length) throw new Error('no such user');

    return result[0];
}

async function usersUpdate(userId, githubToken, email, quayToken, githubAutoImport) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof githubToken, 'string');
    assert.strictEqual(typeof email, 'string');

    const fields = [];
    const args = [];

    fields.push('githubToken=?'); args.push(githubToken);
    fields.push('email=?'); args.push(email);

    if (quayToken !== undefined) { fields.push('quayToken=?'); args.push(quayToken); }
    if (githubAutoImport !== undefined) { fields.push('githubAutoImport=?'); args.push(githubAutoImport); }

    args.push(userId);

    await db.query('UPDATE users SET ' + fields.join(',') + ' WHERE id=?', args);
}

async function releasesList(projectId) {
    assert.strictEqual(typeof projectId, 'string');

    const [result] = await db.query('SELECT * FROM releases WHERE projectId=?', [ projectId ]);

    return result;
}

async function releasesAdd(release) {
    assert.strictEqual(typeof release, 'object');

    release.id = uuid.v4();
    release.createdAt = release.createdAt || 0;
    release.sha = release.sha || '';

    await db.query('INSERT INTO releases (id, projectId, version, body, notified, prerelease, createdAt, sha) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [ release.id, release.projectId, release.version, release.body, release.notified, release.prerelease, release.createdAt, release.sha ]);

    return release;
}

async function releasesUpdate(releaseId, data) {
    assert.strictEqual(typeof releaseId, 'string');
    assert.strictEqual(typeof data, 'object');

    const allowed = {};
    if (data.notified !== undefined) allowed.notified = data.notified;
    if (data.sha !== undefined) allowed.sha = data.sha;

    if (Object.keys(allowed).length === 0) return;

    await db.query('UPDATE releases SET ? WHERE id=?', [ allowed, releaseId ]);
}

async function releasesListAllPending() {
    const [result] = await db.query('SELECT * FROM releases WHERE notified=FALSE', []);
    return result;
}

async function releasesListPendingForProject(projectId) {
    assert.strictEqual(typeof projectId, 'string');

    const [result] = await db.query('SELECT * FROM releases WHERE projectId=? AND notified=FALSE', [ projectId ]);
    return result;
}
