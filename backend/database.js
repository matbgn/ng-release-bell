'use strict';

const assert = require('assert'),
    uuid = require('uuid'),
    { DatabaseSync } = require('node:sqlite'),
    fs = require('fs'),
    path = require('path'),
    { runMigrations } = require('./migrator.js');

module.exports = exports = {
    init: init,
    testConnection: testConnection,

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

let db = null;

function init() {
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/ng-release-bell.db');
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');

    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    db.exec(schema);

    runMigrations(db);

    console.log('Database initialized at', dbPath);
}

function testConnection() {
    db.prepare('SELECT 1').get();
    return true;
}

function projectPostprocess(p) {
    if (p.lastSuccessfulSyncAt === '0000-00-00 00:00:00') p.lastSuccessfulSyncAt = 0;
    if (p.enabled !== undefined) p.enabled = !!p.enabled;
    if (p.excludePrereleases !== undefined) p.excludePrereleases = !!p.excludePrereleases;
    if (p.excludeUpdated !== undefined) p.excludeUpdated = !!p.excludeUpdated;
    if (p.githubAutoImport !== undefined) p.githubAutoImport = !!p.githubAutoImport;
    return p;
}

function buildSetClause(data, allowedFields) {
    const sets = [];
    const args = [];
    for (const [field, value] of Object.entries(data)) {
        if (allowedFields.has(field) && value !== undefined) {
            sets.push(`${field}=?`);
            if (typeof value === 'boolean') args.push(value ? 1 : 0);
            else args.push(value);
        }
    }
    return { sets, args };
}

function projectsList(userId) {
    assert.strictEqual(typeof userId, 'string');

    const result = db.prepare(`
        SELECT projects.*, releases.version, releases.createdAt
        FROM projects
        LEFT JOIN releases ON releases.id = (
            SELECT releases.id FROM releases WHERE projectId=projects.id ORDER BY createdAt DESC LIMIT 1
        )
        WHERE userId=? ORDER BY lastSuccessfulSyncAt ASC
    `).all(userId);

    result.forEach(projectPostprocess);

    const { releasePassesDisplayFilters } = require('./regex-validator.js');
    for (const project of result) {
        const releases = db.prepare('SELECT version, createdAt, prerelease FROM releases WHERE projectId=? ORDER BY createdAt DESC').all(project.id);

        const filtered = releases.filter(r => releasePassesDisplayFilters(r, project));

        project.version = filtered.length > 0 ? filtered[0].version : null;
        project.createdAt = filtered.length > 0 ? filtered[0].createdAt : null;
    }

    return result;
}

function projectsListByType(userId, type) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof type, 'string');

    const result = db.prepare(`
        SELECT projects.*, releases.version, releases.createdAt
        FROM projects
        LEFT JOIN releases ON releases.id = (
            SELECT releases.id FROM releases WHERE projectId=projects.id ORDER BY createdAt DESC LIMIT 1
        )
        WHERE userId=? AND type=?
    `).all(userId, type);

    result.forEach(projectPostprocess);

    const { releasePassesDisplayFilters } = require('./regex-validator.js');
    for (const project of result) {
        const releases = db.prepare('SELECT version, createdAt, prerelease FROM releases WHERE projectId=? ORDER BY createdAt DESC').all(project.id);

        const filtered = releases.filter(r => releasePassesDisplayFilters(r, project));

        project.version = filtered.length > 0 ? filtered[0].version : null;
        project.createdAt = filtered.length > 0 ? filtered[0].createdAt : null;
    }

    return result;
}

function projectsAdd(project) {
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

    db.prepare('INSERT INTO projects (id, userId, name, origin, enabled, lastSuccessfulSyncAt, type, emailFrequency, excludePrereleases, excludeUpdated, versionFilters, lastNotifiedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(project.id, project.userId, project.name, project.origin, project.enabled ? 1 : 0, project.lastSuccessfulSyncAt, project.type, project.emailFrequency, project.excludePrereleases ? 1 : 0, project.excludeUpdated ? 1 : 0, project.versionFilters, project.lastNotifiedAt);

    return projectPostprocess(project);
}

function projectsGet(projectId) {
    assert.strictEqual(typeof projectId, 'string');

    const result = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId);
    if (!result) throw new Error('not found');

    return projectPostprocess(result);
}

function projectsUpdate(projectId, data) {
    assert.strictEqual(typeof projectId, 'string');
    assert.strictEqual(typeof data, 'object');

    const allowedFields = new Set(['enabled', 'name', 'type', 'origin', 'lastSuccessfulSyncAt', 'emailFrequency', 'excludePrereleases', 'excludeUpdated', 'versionFilters', 'lastNotifiedAt']);
    const { sets, args } = buildSetClause(data, allowedFields);

    if (sets.length === 0) return;

    args.push(projectId);
    db.prepare(`UPDATE projects SET ${sets.join(',')} WHERE id=?`).run(...args);
}

function projectsRemove(projectId) {
    assert.strictEqual(typeof projectId, 'string');

    db.prepare('DELETE FROM releases WHERE projectId=?').run(projectId);
    db.prepare('DELETE FROM projects WHERE id=?').run(projectId);
}

function projectsListAllWithPendingReleases() {
    const result = db.prepare('SELECT DISTINCT p.* FROM projects p INNER JOIN releases r ON r.projectId = p.id WHERE r.notified=0').all();
    result.forEach(projectPostprocess);
    return result;
}

function usersList() {
    return db.prepare('SELECT * FROM users').all();
}

function usersAdd(user) {
    assert.strictEqual(typeof user, 'object');

    const passwordHash = user.passwordHash || '';
    db.prepare('INSERT INTO users (id, email, githubToken, passwordHash) VALUES (?, ?, ?, ?)').run(user.id, user.email, user.githubToken, passwordHash);
    return user;
}

function usersGet(userId) {
    assert.strictEqual(typeof userId, 'string');

    const result = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
    if (!result) throw new Error('no such user');

    return result;
}

function usersUpdate(userId, githubToken, email, quayToken, githubAutoImport, passwordHash) {
    assert.strictEqual(typeof userId, 'string');
    assert.strictEqual(typeof githubToken, 'string');
    assert.strictEqual(typeof email, 'string');

    const fields = ['githubToken=?', 'email=?'];
    const args = [githubToken, email];

    if (quayToken !== undefined) { fields.push('quayToken=?'); args.push(quayToken); }
    if (githubAutoImport !== undefined) { fields.push('githubAutoImport=?'); args.push(githubAutoImport ? 1 : 0); }
    if (passwordHash !== undefined) { fields.push('passwordHash=?'); args.push(passwordHash); }

    args.push(userId);
    db.prepare(`UPDATE users SET ${fields.join(',')} WHERE id=?`).run(...args);
}

function releasesList(projectId) {
    assert.strictEqual(typeof projectId, 'string');

    return db.prepare('SELECT * FROM releases WHERE projectId=?').all(projectId);
}

function releasesAdd(release) {
    assert.strictEqual(typeof release, 'object');

    release.id = uuid.v4();
    release.createdAt = release.createdAt || 0;
    release.sha = release.sha || '';

    db.prepare('INSERT OR IGNORE INTO releases (id, projectId, version, body, notified, prerelease, createdAt, sha) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(release.id, release.projectId, release.version, release.body, release.notified ? 1 : 0, release.prerelease ? 1 : 0, release.createdAt, release.sha);

    return release;
}

function releasesUpdate(releaseId, data) {
    assert.strictEqual(typeof releaseId, 'string');
    assert.strictEqual(typeof data, 'object');

    const allowedFields = new Set(['notified', 'sha']);
    const { sets, args } = buildSetClause(data, allowedFields);

    if (sets.length === 0) return;

    args.push(releaseId);
    db.prepare(`UPDATE releases SET ${sets.join(',')} WHERE id=?`).run(...args);
}

function releasesListAllPending() {
    return db.prepare('SELECT * FROM releases WHERE notified=0').all();
}

function releasesListPendingForProject(projectId) {
    assert.strictEqual(typeof projectId, 'string');

    return db.prepare('SELECT * FROM releases WHERE projectId=? AND notified=0').all(projectId);
}