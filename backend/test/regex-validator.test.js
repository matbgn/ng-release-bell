'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    validateVersionFilters,
    passesVersionFilters,
    releasePassesDisplayFilters,
    NON_SEMVER_TAGS
} = require('../regex-validator.js');

function makeProject(overrides = {}) {
    return {
        versionFilters: null,
        excludePrereleases: false,
        ...overrides
    };
}

test('NON_SEMVER_TAGS contains the expected set', () => {
    for (const tag of ['latest', 'stable', 'develop', 'main', 'master', 'edge', 'nightly']) {
        assert.ok(NON_SEMVER_TAGS.includes(tag), `${tag} should be a non-semver tag`);
    }
});

test('passesVersionFilters: no filters passes everything', () => {
    assert.equal(passesVersionFilters('v1.0.0', null), true);
    assert.equal(passesVersionFilters('v1.0.0', undefined), true);
    assert.equal(passesVersionFilters('v1.0.0', []), true);
    assert.equal(passesVersionFilters('v1.0.0', '[]'), true);
});

test('passesVersionFilters: include regex keeps only matching versions', () => {
    const filters = [{ value: '^v?\\d+\\.\\d+\\.\\d+$', inverse: true }];
    assert.equal(passesVersionFilters('1.2.3', filters), true);
    assert.equal(passesVersionFilters('v1.2.3', filters), true);
    assert.equal(passesVersionFilters('nightly', filters), false);
    assert.equal(passesVersionFilters('1.2.3-rc.1', filters), false);
});

test('passesVersionFilters: exclude regex drops matching versions', () => {
    const filters = [{ value: '-rc\\.\\d+', inverse: false }];
    assert.equal(passesVersionFilters('1.2.3', filters), true);
    assert.equal(passesVersionFilters('1.2.3-rc.1', filters), false);
});

test('passesVersionFilters: include + exclude combine (all includes must match, no exclude may match)', () => {
    const filters = [
        { value: '^\\d', inverse: true },
        { value: '-beta', inverse: false }
    ];
    assert.equal(passesVersionFilters('1.0.0', filters), true);
    assert.equal(passesVersionFilters('1.0.0-beta.1', filters), false);
    assert.equal(passesVersionFilters('v1.0.0', filters), false);
});

test('passesVersionFilters: invalid regex in filter is treated as non-matching (no throw)', () => {
    const include = [{ value: '(unclosed', inverse: true }];
    assert.equal(passesVersionFilters('1.0.0', include), false);
    const exclude = [{ value: '(unclosed', inverse: false }];
    assert.equal(passesVersionFilters('1.0.0', exclude), true);
});

test('passesVersionFilters: empty filter value is treated as non-matching', () => {
    const include = [{ value: '', inverse: true }];
    assert.equal(passesVersionFilters('1.0.0', include), false);
    const exclude = [{ value: '', inverse: false }];
    assert.equal(passesVersionFilters('1.0.0', exclude), true);
});

test('validateVersionFilters: null/undefined is valid', () => {
    assert.deepEqual(validateVersionFilters(null), { valid: true });
    assert.deepEqual(validateVersionFilters(undefined), { valid: true });
});

test('validateVersionFilters: valid patterns pass', () => {
    assert.deepEqual(validateVersionFilters([{ value: '^v\\d+$', inverse: true }]), { valid: true });
    assert.deepEqual(validateVersionFilters(JSON.stringify([{ value: '^v\\d+$', inverse: true }])), { valid: true });
});

test('validateVersionFilters: invalid regex returns error', () => {
    const res = validateVersionFilters([{ value: '(unclosed', inverse: true }]);
    assert.equal(res.valid, false);
    assert.match(res.error, /Invalid regex/);
});

test('releasePassesDisplayFilters: rejects NON_SEMVER_TAGS regardless of case', () => {
    const project = makeProject();
    assert.equal(releasePassesDisplayFilters({ version: 'LATEST', prerelease: false }, project), false);
    assert.equal(releasePassesDisplayFilters({ version: 'Nightly', prerelease: false }, project), false);
});

test('releasePassesDisplayFilters: rejects version failing include regex', () => {
    const project = makeProject({ versionFilters: [{ value: '^\\d+\\.\\d+\\.\\d+$', inverse: true }] });
    assert.equal(releasePassesDisplayFilters({ version: '1.2.3', prerelease: false }, project), true);
    assert.equal(releasePassesDisplayFilters({ version: 'some-branch', prerelease: false }, project), false);
});

test('releasePassesDisplayFilters: rejects prereleases when excludePrereleases is set', () => {
    const project = makeProject({ excludePrereleases: true });
    assert.equal(releasePassesDisplayFilters({ version: '1.0.0', prerelease: false }, project), true);
    assert.equal(releasePassesDisplayFilters({ version: '1.0.0-rc.1', prerelease: true }, project), false);
});

test('releasePassesDisplayFilters: keeps prereleases when excludePrereleases is off', () => {
    const project = makeProject({ excludePrereleases: false });
    assert.equal(releasePassesDisplayFilters({ version: '1.0.0-rc.1', prerelease: true }, project), true);
});

test('releasePassesDisplayFilters: non-semver tag still rejected even with matching include regex', () => {
    const project = makeProject({ versionFilters: [{ value: '.*', inverse: true }] });
    assert.equal(releasePassesDisplayFilters({ version: 'latest', prerelease: false }, project), false);
});

test('releasePassesDisplayFilters: all filters out -> false (the bug-fix scenario)', () => {
    const project = makeProject({ versionFilters: [{ value: '^v\\d', inverse: true }] });
    assert.equal(releasePassesDisplayFilters({ version: 'latest', prerelease: false }, project), false);
    assert.equal(releasePassesDisplayFilters({ version: 'main', prerelease: false }, project), false);
});