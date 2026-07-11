#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Generate session secret before requiring auth.js (which reads it at load time)
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const secretPath = path.join(dataDir, 'session.secret');
if (!fs.existsSync(secretPath)) {
    fs.writeFileSync(secretPath, crypto.randomBytes(256).toString('base64'));
}

const server = require('./backend/server.js'),
    tasks = require('./backend/tasks.js'),
    database = require('./backend/database.js'),
    auth = require('./backend/auth.js');

const PORT = process.env.PORT || 3000;

// Validate environment variables
function validateEnv() {
    const oidcEnabled = auth.OIDC_ENABLED;
    if (oidcEnabled) {
        console.log(`Auth: OIDC (${process.env.OIDC_ISSUER})`);
    } else if (process.env.ADMIN_PASSWORD) {
        console.log('Auth: password (admin pre-provisioned via ADMIN_PASSWORD)');
    } else {
        console.log('Auth: password (first-run — complete setup via the UI, or set ADMIN_PASSWORD for headless deploys)');
    }

    const warnings = [];
    if (!process.env.MAIL_SMTP_SERVER) warnings.push('MAIL_SMTP_SERVER not set — email notifications disabled');
    if (!process.env.APP_ORIGIN) warnings.push('APP_ORIGIN not set — email links will be empty');
    warnings.forEach(w => console.warn('⚠ ' + w));
}

validateEnv();
database.init();

// In password mode, ensure an admin user exists and apply ADMIN_PASSWORD overrides
if (!auth.OIDC_ENABLED) {
    (async function ensureAdmin() {
        try {
            const users = await database.users.list();
            const email = process.env.ADMIN_EMAIL || 'admin@ngreleasebell.local';

            // ADMIN_PASSWORD (explicit, all environments): create or override the admin password
            if (process.env.ADMIN_PASSWORD) {
                if (users.length > 0) {
                    const user = users[0];
                    await database.users.update(user.id, user.githubToken, user.email, user.quayToken, user.githubAutoImport, auth.hashPassword(process.env.ADMIN_PASSWORD));
                    console.warn('⚠ ADMIN_PASSWORD is set and has overridden the existing admin password. Storing the password in .env is less secure than setting it via the UI or setup wizard.');
                } else {
                    await database.users.add({ id: 'admin', email: email, githubToken: '', passwordHash: auth.hashPassword(process.env.ADMIN_PASSWORD) });
                    console.log('Admin user provisioned from ADMIN_PASSWORD');
                }
                return;
            }

            // No ADMIN_PASSWORD: in production/headless, generate a one-time password and
            // print it once. In dev, leave provisioning to the UI setup wizard. If only a
            // passwordless admin exists (e.g. from a prior OIDC session), adopt it.
            const needsProvision = users.length === 0 || (users.length === 1 && !users[0].passwordHash);
            if (needsProvision && process.env.NODE_ENV === 'production') {
                const generated = crypto.randomBytes(12).toString('base64url');
                const hash = auth.hashPassword(generated);
                if (users.length === 0) {
                    await database.users.add({ id: 'admin', email: email, githubToken: '', passwordHash: hash });
                } else {
                    const existing = users[0];
                    await database.users.update(existing.id, existing.githubToken, existing.email, existing.quayToken, existing.githubAutoImport, hash);
                }
                console.log('');
                console.log('=====================================================================');
                console.log(' NG Release Bell — first-run admin password (shown only ONCE):');
                console.log('   ' + generated);
                console.log(' Log in with this password, then change it in Settings if desired.');
                console.log(' To use your own password instead, set ADMIN_PASSWORD and restart.');
                console.log('=====================================================================');
                console.log('');
            }
        } catch (e) {
            console.error('Failed to provision admin user', e);
        }
    })();
}

server.start(parseInt(PORT), function (error) {
    if (error) return console.error('Failed to start server.', error);

    console.log(`Server is up and running on port ${PORT}`);

    tasks.run();
});