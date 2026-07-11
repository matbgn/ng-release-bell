'use strict';

var assert = require('assert'),
    database = require('./database.js'),
    github = require('./github.js'),
    tasks = require('./tasks.js'),
    { validateVersionFilters } = require('./regex-validator.js'),
    lastMile = require('connect-lastmile'),
    HttpError = lastMile.HttpError,
    HttpSuccess = lastMile.HttpSuccess;

module.exports = exports = {
    status,
    auth,
    login,
    availableProviders,

    profile: {
        get: profileGet,
        update: profileUpdate
    },

    projects: {
        get: projectsGet,
        add: projectAdd,
        list: projectsList,
        update: projectsUpdate,
        del: projectsDelete,
        releases: projectReleases,
        sync: projectSync,
        syncAll: projectsSyncAll
    },

    data: {
        export: dataExport,
        import: dataImport
    }
};

const PORT = process.env.PORT || 3000;
const APP_ORIGIN = process.env.APP_ORIGIN || `http://localhost:${PORT}`;

function login(req, res) {
    res.oidc.login({
        returnTo: '/',
        authorizationParams: {
            redirect_uri: `${APP_ORIGIN}/api/v1/callback`,
        }
    });
}

function status(req, res, next) {
    try {
        database.testConnection();
        next(new HttpSuccess(200, { ok: true, db: true, timestamp: new Date().toISOString() }));
    } catch (e) {
        next(new HttpSuccess(200, { ok: true, db: false, error: e.message }));
    }
}

function availableProviders(req, res, next) {
    const providers = {
        github: true,
        github_manual: true,
        gitlab: true,
        gitea: true,
        npm: true,
        pypi: true,
        dockerhub: true,
        quay: !!(process.env.QUAY_TOKEN || (req.user && req.user.quayToken)),
        ghcr: !!(process.env.GITHUB_TOKEN || (req.user && req.user.githubToken)),
        sourceforge: true
    };
    next(new HttpSuccess(200, { providers }));
}

async function auth(req, res, next) {
    if (!req.oidc.isAuthenticated()) return next(new HttpError(401, 'Unauthorized'));

    let user;
    try {
        user = await database.users.get(req.oidc.user.sub);
    } catch (e) {
        try {
            user = await database.users.add({ id: req.oidc.user.sub, email: req.oidc.user.email, githubToken: '' });
        } catch (e) {
            console.error('Failed to add user', req.user.oidc.user, e);
            return next(new HttpError(500, 'internal error'));
        }
    }

    // update email if changed
    if (user.email !== req.oidc.user.email) {
        try {
            await database.users.update(user.id, user.githubToken, req.oidc.user.email);
            user.email = req.oidc.user.email;
        } catch (e) {
            console.error('Failed to update email for user.', user, e);
        }
    }

    req.user = user;

    next();
}

function profileGet(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    next(new HttpSuccess(200, { user: req.user }));
}

async function profileUpdate(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const githubToken = req.body.githubToken !== undefined ? req.body.githubToken : req.user.githubToken;
    const quayToken = req.body.quayToken !== undefined ? req.body.quayToken : (req.user.quayToken || '');
    const githubAutoImport = req.body.githubAutoImport !== undefined ? req.body.githubAutoImport : req.user.githubAutoImport;

    if (githubToken !== req.user.githubToken) {
        try {
            await github.verifyToken(githubToken);
        } catch (error) {
            return next(new HttpError(402, error.message));
        }
    }

    try {
        await database.users.update(req.user.id, githubToken, req.user.email, quayToken, githubAutoImport);
    } catch (error) {
        return next(new HttpError(500, error));
    }
    req.user.githubToken = githubToken;
    req.user.quayToken = quayToken;
    req.user.githubAutoImport = githubAutoImport;

    next(new HttpSuccess(202, {}));

    if (githubToken && githubToken !== req.user.githubToken) tasks.run();
}

async function projectsList(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    let result;
    try {
        result = await database.projects.list(req.user.id);
    } catch (error) {
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(200, { projects: result }));
}

async function projectAdd(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    if (!req.body.type) return next(new HttpError(400, 'type is required'));
    const ALLOWED_TYPES = [
        database.PROJECT_TYPE_GITHUB_MANUAL,
        database.PROJECT_TYPE_GITLAB,
        database.PROJECT_TYPE_WEBSITE,
        database.PROJECT_TYPE_GITEA,
        database.PROJECT_TYPE_NPM,
        database.PROJECT_TYPE_PYPI,
        database.PROJECT_TYPE_DOCKERHUB,
        database.PROJECT_TYPE_QUAY,
        database.PROJECT_TYPE_GHCR,
        database.PROJECT_TYPE_SOURCEFORGE
    ];
    if (ALLOWED_TYPES.indexOf(req.body.type) === -1) return next(new HttpError(400, 'invalid type'));

    const project = {
        type: req.body.type,
        userId: req.user.id,
        name: req.body.name,
        origin: req.body.origin
    };

    let result;
    try {
        result = await database.projects.add(project);
    } catch (error) {
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(201, { project: result }));

    // force an initial release sync
    try {
        await tasks.syncReleasesByProject(req.user, result);
    } catch (error) {
        console.error('Failed to perfom initial sync.', error);
    }
}

async function projectsGet(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert.strictEqual(typeof req.params.projectId, 'string');

    let result;
    try {
        result = await database.projects.get(req.user.id, req.params.projectId);
    } catch (error) {
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(200, { project: result }));
}

async function projectsUpdate(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert.strictEqual(typeof req.params.projectId, 'string');

    if (req.body.versionFilters) {
        const result = validateVersionFilters(req.body.versionFilters);
        if (!result.valid) return next(new HttpError(400, result.error));
    }

    try {
        await database.projects.update(req.params.projectId, req.body);
    } catch (error) {
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(202, {}));
}

async function projectsDelete(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert.strictEqual(typeof req.params.projectId, 'string');

    try {
        await database.projects.remove(req.params.projectId);
    } catch (error) {
        return next(new HttpError(500, error));
    }

    next(new HttpSuccess(202, {}));
}

async function projectReleases(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert.strictEqual(typeof req.params.projectId, 'string');

    try {
        const result = await database.releases.list(req.params.projectId);
        result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return next(new HttpSuccess(200, { releases: result.slice(0, 20) }));
    } catch (error) {
        return next(new HttpError(500, error));
    }
}

async function projectSync(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');
    assert.strictEqual(typeof req.params.projectId, 'string');

    let project;
    try {
        project = await database.projects.get(req.params.projectId);
    } catch (error) {
        return next(new HttpError(404, 'project not found'));
    }

    next(new HttpSuccess(202, {}));

    try {
        await tasks.syncReleasesByProject(req.user, project);
    } catch (error) {
        console.error('Failed to sync project', project.name, error);
    }
}

async function dataExport(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const projects = await database.projects.list(req.user.id);
    const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        projects: projects.map(p => ({
            name: p.name,
            type: p.type,
            origin: p.origin,
            enabled: p.enabled,
            emailFrequency: p.emailFrequency,
            excludePrereleases: p.excludePrereleases,
            excludeUpdated: p.excludeUpdated,
            versionFilters: p.versionFilters,
        }))
    };

    next(new HttpSuccess(200, data));
}

async function dataImport(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    if (!req.body.projects || !Array.isArray(req.body.projects)) {
        return next(new HttpError(400, 'projects array is required'));
    }

    let imported = 0, skipped = 0;
    const importedProjects = [];
    for (const p of req.body.projects) {
        if (!p.name || !p.type) { skipped++; continue; }

        const existing = await database.projects.list(req.user.id);
        if (existing.find(e => e.name === p.name && e.type === p.type)) { skipped++; continue; }

        try {
            const project = await database.projects.add({
                userId: req.user.id,
                name: p.name,
                type: p.type,
                origin: p.origin || '',
                enabled: p.enabled !== undefined ? p.enabled : true,
                emailFrequency: p.emailFrequency || 'instant',
                excludePrereleases: p.excludePrereleases || false,
                excludeUpdated: p.excludeUpdated || false,
                versionFilters: p.versionFilters || null,
            });
            importedProjects.push(project);
            imported++;
        } catch (error) {
            console.error('Failed to import project', p.name, error);
            skipped++;
        }
    }

    next(new HttpSuccess(200, { imported, skipped }));

    for (const project of importedProjects) {
        try {
            await tasks.syncReleasesByProject(req.user, project);
        } catch (error) {
            console.error('Failed to sync imported project', project.name, error);
        }
    }
}

async function projectsSyncAll(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    next(new HttpSuccess(202, {}));

    const projects = await database.projects.list(req.user.id);
    for (const project of projects) {
        try {
            await tasks.syncReleasesByProject(req.user, project);
        } catch (error) {
            console.error('Failed to sync project', project.name, error);
        }
    }
}
