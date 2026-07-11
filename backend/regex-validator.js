'use strict';

const safeRegex = require('safe-regex');

function validateRegex(pattern) {
    if (!pattern || typeof pattern !== 'string' || pattern.length === 0) return { valid: true };
    try {
        const re = new RegExp(pattern);
        if (!safeRegex(re)) {
            return { valid: false, error: 'This regex pattern is potentially catastrophic (ReDoS risk). Please simplify it.' };
        }
        return { valid: true };
    } catch (e) {
        return { valid: false, error: 'Invalid regex: ' + e.message };
    }
}

function validateVersionFilters(versionFilters) {
    if (!versionFilters) return { valid: true };
    const filters = typeof versionFilters === 'string' ? JSON.parse(versionFilters) : versionFilters;
    for (const f of filters) {
        const result = validateRegex(f.value);
        if (!result.valid) return { valid: false, error: `Invalid regex filter "${f.value}": ${result.error}` };
    }
    return { valid: true };
}

function passesVersionFilters(version, versionFilters) {
    if (!versionFilters) return true;
    const filters = typeof versionFilters === 'string' ? JSON.parse(versionFilters) : versionFilters;
    const includes = filters.filter(f => f.inverse === true);
    const excludes = filters.filter(f => f.inverse === false);

    if (includes.length > 0 && !includes.some(f => {
        if (!f.value) return false;
        try {
            const re = new RegExp(f.value);
            if (!safeRegex(re)) return false;
            return re.test(version);
        } catch (e) { return false; }
    })) return false;

    if (excludes.some(f => {
        if (!f.value) return false;
        try {
            const re = new RegExp(f.value);
            if (!safeRegex(re)) return false;
            return re.test(version);
        } catch (e) { return false; }
    })) return false;

    return true;
}

module.exports = { validateRegex, validateVersionFilters, passesVersionFilters };