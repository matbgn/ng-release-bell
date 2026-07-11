#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const server = require('./backend/server.js'),
    tasks = require('./backend/tasks.js'),
    database = require('./backend/database.js');

const PORT = process.env.PORT || 3000;

// Ensure data directory exists
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Generate session secret if not present
const secretPath = path.join(dataDir, 'session.secret');
if (!fs.existsSync(secretPath)) {
    fs.writeFileSync(secretPath, crypto.randomBytes(256).toString('base64'));
}

// Validate environment variables
function validateEnv() {
    const warnings = [];
    if (!process.env.MAIL_SMTP_SERVER) warnings.push('MAIL_SMTP_SERVER not set — email notifications disabled');
    if (!process.env.APP_ORIGIN) warnings.push('APP_ORIGIN not set — email links will be empty');
    if (!process.env.GITHUB_TOKEN && !process.env.OIDC_ISSUER) warnings.push('No GITHUB_TOKEN or OIDC_ISSUER — using mock login');
    warnings.forEach(w => console.warn('⚠ ' + w));
}

validateEnv();
database.init();

server.start(parseInt(PORT), function (error) {
    if (error) return console.error('Failed to start server.', error);

    console.log(`Server is up and running on port ${PORT}`);

    tasks.run();
});