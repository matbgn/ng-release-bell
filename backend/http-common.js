'use strict';

const fs = require('fs'),
    path = require('path');

const TIMEOUT = {
    response: 30000,
    deadline: 60000
};

const VERSION = (() => {
    try {
        return fs.readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf8').trim() || '0.0.0';
    } catch (e) {
        return '0.0.0';
    }
})();

const USER_AGENT = `ng-releasebell/${VERSION}`;

function withTimeout(request) {
    return request.timeout(TIMEOUT).set('User-Agent', USER_AGENT);
}

module.exports = exports = {
    TIMEOUT,
    USER_AGENT,
    withTimeout
};