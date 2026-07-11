'use strict';

const fs = require('fs'),
    path = require('path'),
    crypto = require('crypto');

// Session secret is generated at startup by index.js in this directory.
const baseDir = process.env.DATA_DIR || path.join(__dirname, '../data');

const SESSION_COOKIE = 'nrb_session';

const OIDC_ENABLED = !!(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET);

function loadSecret() {
    const secretPath = path.resolve(baseDir, 'session.secret');
    try {
        return fs.readFileSync(secretPath, 'utf8').trim();
    } catch (e) {
        throw new Error('session.secret not found at ' + secretPath + '. Ensure the server has started and generated it.');
    }
}

const SESSION_SECRET = loadSecret();

function hashPassword(pw) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(pw, salt, 64);
    return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(pw, stored) {
    if (!stored || typeof stored !== 'string') return false;
    const parts = stored.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    const hash = crypto.scryptSync(pw, salt, expected.length);
    if (hash.length !== expected.length) return false;
    return crypto.timingSafeEqual(hash, expected);
}

function signSession(userId) {
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(String(userId)).digest('base64url');
    return `${userId}.${sig}`;
}

function verifySession(token) {
    if (!token || typeof token !== 'string') return null;
    const idx = token.lastIndexOf('.');
    if (idx <= 0) return null;
    const userId = token.slice(0, idx);
    const sig = token.slice(idx + 1);
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(userId).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
    return userId;
}

function cookieOptions() {
    const secure = process.env.NODE_ENV === 'production' && (process.env.APP_ORIGIN || '').startsWith('https');
    return {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure
    };
}

module.exports = {
    SESSION_COOKIE,
    OIDC_ENABLED,
    hashPassword,
    verifyPassword,
    signSession,
    verifySession,
    cookieOptions
};
