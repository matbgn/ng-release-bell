'use strict';

const TIMEOUT = {
    response: 30000,
    deadline: 60000
};

function withTimeout(request) {
    return request.timeout(TIMEOUT);
}

module.exports = exports = {
    TIMEOUT,
    withTimeout
};