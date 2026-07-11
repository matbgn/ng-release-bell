'use strict';

var assert = require('assert'),
    connectTimeout = require('connect-timeout'),
    cors = require('./cors.js'),
    lastMile = require('connect-lastmile'),
    oidc = require('express-openid-connect'),
    path = require('path'),
    fs = require('fs'),
    routes = require('./routes.js'),
    express = require('express');

module.exports = exports = {
    start: start
};

const baseDir = process.env.DATA_DIR || path.join(__dirname, '../.dev');

function start(port, callback) {
    assert.strictEqual(typeof port, 'number');
    assert.strictEqual(typeof callback, 'function');

    var router = express.Router();

    var app = express();

    router.get ('/api/v1/login', routes.login);
    router.get ('/api/v1/status', routes.status);
    router.get ('/api/v1/providers', routes.auth, routes.availableProviders);
    router.get ('/api/v1/profile', routes.auth, routes.profile.get);
    router.post('/api/v1/profile', routes.auth, routes.profile.update);
    router.get ('/api/v1/projects', routes.auth, routes.projects.list);
    router.post('/api/v1/projects', routes.auth, routes.projects.add);
    router.get ('/api/v1/projects/:projectId', routes.auth, routes.projects.get);
    router.get ('/api/v1/projects/:projectId/releases', routes.auth, routes.projects.releases);
    router.post('/api/v1/projects/:projectId/sync', routes.auth, routes.projects.sync);
    router.post('/api/v1/projects/sync-all', routes.auth, routes.projects.syncAll);
    router.post('/api/v1/projects/:projectId', routes.auth, routes.projects.update);
    router.delete ('/api/v1/projects/:projectId', routes.auth, routes.projects.del);
    router.get ('/api/v1/data/export', routes.auth, routes.data.export);
    router.post('/api/v1/data/import', routes.auth, routes.data.import);

    app.set('trust proxy', 1);

    // currently for local development. vite runs on http://localhost:5173
    app.use(cors({ origins: [ '*' ], allowCredentials: true }));

    app.use(connectTimeout(20000, { respond: true }));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    if (process.env.OIDC_ISSUER) {
        app.use(oidc.auth({
            issuerBaseURL: process.env.OIDC_ISSUER,
            baseURL: process.env.APP_ORIGIN,
            clientID: process.env.OIDC_CLIENT_ID,
            clientSecret: process.env.OIDC_CLIENT_SECRET,
            secret: fs.readFileSync(path.resolve(__dirname, `${baseDir}/session.secret`), 'utf8'),
            authorizationParams: {
                response_type: 'code',
                scope: 'openid profile email'
            },
            authRequired: false,
            routes: {
                callback: '/api/v1/callback',
                login: false,
                logout: '/api/v1/logout'
            }
        }));
    } else {
        // mock oidc (login bypass mode for local testing)
        app.use((req, res, next) => {
            res.oidc = {
                login(options) {
                    res.redirect(options.authorizationParams.redirect_uri);
                }
            };
            req.oidc = {
                user: {
                    sub: 'admin',
                    family_name: 'Admin',
                    given_name: 'Admin',
                    locale: 'en-US',
                    name: 'Admin',
                    preferred_username: 'admin',
                    email: 'admin@ngreleasebell.local',
                    email_verified: true
                },
                isAuthenticated() {
                    return true;
                }
            };

            next();
        });

        app.use('/api/v1/callback', (req, res) => {
            res.redirect(`${process.env.APP_ORIGIN || 'http://localhost:' + (process.env.VITE_DEV_PORT || process.env.PORT)}/`);
        });

        app.use('/api/v1/logout', (req, res) => {
            res.status(200).send({});
        });
    }
    app.use(router);
    app.use(express.static('./dist'));
    app.use(lastMile());
    app.listen(port, callback);
}