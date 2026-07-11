'use strict';

var assert = require('assert'),
    database = require('./database.js'),
    github = require('./github.js'),
    tasks = require('./tasks.js'),
    authLib = require('./auth.js'),
    { validateVersionFilters } = require('./regex-validator.js'),
    lastMile = require('connect-lastmile'),
    HttpError = lastMile.HttpError,
    HttpSuccess = lastMile.HttpSuccess;

module.exports = exports = {
    status,
    auth,
    login,
    loginPassword,
    setupGet,
    setupPost,
    availableProviders,

    profile: {
        get: profileGet,
        update: profileUpdate,
        testEmail: profileTestEmail
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

async function status(req, res, next) {
    try {
        database.testConnection();
        let needsSetup = false;
        if (!authLib.OIDC_ENABLED) {
            const users = await database.users.list();
            needsSetup = users.length === 0 || (users.length === 1 && !users[0].passwordHash);
        }
        next(new HttpSuccess(200, {
            ok: true,
            db: true,
            timestamp: new Date().toISOString(),
            auth: {
                mode: authLib.OIDC_ENABLED ? 'oidc' : 'password',
                needsSetup: needsSetup
            }
        }));
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
    if (authLib.OIDC_ENABLED) {
        if (!req.oidc.isAuthenticated()) return next(new HttpError(401, 'Unauthorized'));

        let user;
        try {
            user = await database.users.get(req.oidc.user.sub);
        } catch (e) {
            try {
                user = await database.users.add({ id: req.oidc.user.sub, email: req.oidc.user.email, githubToken: '' });
            } catch (e) {
                console.error('Failed to add user', req.oidc.user, e);
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

        return next();
    }

    // password mode
    if (!req.userId) return next(new HttpError(401, 'Unauthorized'));

    let user;
    try {
        user = await database.users.get(req.userId);
    } catch (e) {
        return next(new HttpError(401, 'Unauthorized'));
    }

    req.user = user;

    next();
}

async function loginPassword(req, res, next) {
    const password = req.body.password;
    if (!password) return next(new HttpError(400, 'password is required'));

    const users = await database.users.list();
    if (users.length === 0) return next(new HttpError(401, 'Unauthorized'));

    const user = users[0];
    if (!authLib.verifyPassword(password, user.passwordHash)) return next(new HttpError(401, 'Unauthorized'));

    res.cookie(authLib.SESSION_COOKIE, authLib.signSession(user.id), authLib.cookieOptions());
    next(new HttpSuccess(200, {}));
}

async function setupGet(req, res, next) {
    const needsSetup = (await database.users.list()).length === 0;
    next(new HttpSuccess(200, { needsSetup }));
}

async function setupPost(req, res, next) {
    const password = req.body.password;
    if (!password || typeof password !== 'string' || password.length < 8) {
        return next(new HttpError(400, 'Password must be at least 8 characters'));
    }

    const users = await database.users.list();
    const noUsers = users.length === 0;
    const orphanAdmin = users.length === 1 && !users[0].passwordHash;
    if (!noUsers && !orphanAdmin) return next(new HttpError(403, 'Setup already complete'));

    const email = process.env.ADMIN_EMAIL || 'admin@ngreleasebell.local';
    let userId;
    if (noUsers) {
        const user = await database.users.add({ id: 'admin', email: email, githubToken: '', passwordHash: authLib.hashPassword(password) });
        userId = user.id;
    } else {
        // adopt the existing (passwordless) admin, e.g. one created by a prior OIDC session
        const existing = users[0];
        await database.users.update(existing.id, existing.githubToken, email, existing.quayToken, existing.githubAutoImport, authLib.hashPassword(password));
        userId = existing.id;
    }

    res.cookie(authLib.SESSION_COOKIE, authLib.signSession(userId), authLib.cookieOptions());
    next(new HttpSuccess(200, {}));
}

function profileGet(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const safeUser = Object.assign({}, req.user);
    delete safeUser.passwordHash;
    next(new HttpSuccess(200, { user: safeUser }));
}

async function profileUpdate(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const githubToken = req.body.githubToken !== undefined ? req.body.githubToken : req.user.githubToken;
    const quayToken = req.body.quayToken !== undefined ? req.body.quayToken : (req.user.quayToken || '');
    const githubAutoImport = req.body.githubAutoImport !== undefined ? req.body.githubAutoImport : req.user.githubAutoImport;
    const email = req.body.email !== undefined ? req.body.email : req.user.email;

    if (githubToken !== req.user.githubToken) {
        try {
            await github.verifyToken(githubToken);
        } catch (error) {
            return next(new HttpError(402, error.message));
        }
    }

    const password = req.body.password;
    const passwordHash = (password && typeof password === 'string' && password.length > 0) ? authLib.hashPassword(password) : undefined;

    try {
        await database.users.update(req.user.id, githubToken, email, quayToken, githubAutoImport, passwordHash);
    } catch (error) {
        return next(new HttpError(500, error));
    }
    req.user.githubToken = githubToken;
    req.user.quayToken = quayToken;
    req.user.githubAutoImport = githubAutoImport;
    req.user.email = email;

    next(new HttpSuccess(202, {}));

    if (githubToken && githubToken !== req.user.githubToken) tasks.run();
}

async function profileTestEmail(req, res, next) {
    assert.strictEqual(typeof req.user, 'object');

    const email = (req.body.email !== undefined && req.body.email) ? req.body.email : req.user.email;
    if (!email) return next(new HttpError(400, 'No email address configured. Enter your email in the settings first.'));
    if (!tasks.CAN_SEND_EMAIL) return next(new HttpError(400, 'Email is not configured on the server. Check the MAIL_* environment variables.'));

    try {
        await tasks.sendTestEmail(req.user, email);
    } catch (error) {
        return next(new HttpError(500, error.message || 'Failed to send test email'));
    }

    next(new HttpSuccess(202, {}));
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
