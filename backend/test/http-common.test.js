'use strict';

const assert = require('assert'),
    http = require('http'),
    { test } = require('node:test'),
    superagent = require('superagent'),
    { withTimeout, USER_AGENT } = require('../http-common.js');

test('USER_AGENT is a non-empty ng-releasebell string', () => {
    assert.ok(USER_AGENT, 'USER_AGENT must not be empty');
    assert.match(USER_AGENT, /^ng-releasebell\//, 'USER_AGENT should start with ng-releasebell/');
});

test('withTimeout sets a User-Agent header on the outgoing request', async () => {
    const server = http.createServer((req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ua: req.headers['user-agent'] }));
    });

    await new Promise((resolve) => server.listen(0, resolve));
    const { port } = server.address();

    try {
        const res = await withTimeout(superagent.get(`http://127.0.0.1:${port}/`));
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.ua, USER_AGENT, 'outgoing request must carry USER_AGENT');
    } finally {
        server.close();
    }
});