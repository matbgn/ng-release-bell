#!/usr/bin/env node

import { app, clearCache, click, cloudronCli, execSync, goto, loginOIDC, sendKeys, setupBrowser, takeScreenshot, teardownBrowser } from '@cloudron/charlie';

/* global it, describe, before, after, afterEach */

describe('Application life cycle test', function () {
    const ghToken = process.env.GITHUB_TOKEN;

    before(setupBrowser);
    after(teardownBrowser);

    afterEach(async function () {
        await takeScreenshot(this.currentTest);
    });

    async function login() {
        await goto(`https://${app.fqdn}`, 'css=#loginButton');
        await click('css=#loginButton');
        await loginOIDC('css=#logoutButton');
    }

    async function setGithubToken() {
        if (process.env.CI) return;

        await goto(`https://${app.fqdn}`, 'css=#settingsButton');
        await click('css=#settingsButton');
        await sendKeys('css=#githubTokenInput', ghToken);
        await click('css=#settingsSaveButton');

        execSync('spd-say "Waiting for 10 mins for sync"');
        console.log('waiting for 10 minutes for syncing');

        await new Promise(resolve => setTimeout(resolve, 10 * 60 * 1000));

        execSync('spd-say "Resuming test after sync"');
    }

    async function checkProjects() {
        if (process.env.CI) return;

        await goto(`https://${app.fqdn}`, 'xpath=//td/a[contains(@href, "https://github.com/")]');
    }

    it('install app', cloudronCli.install);

    it('can login', login);
    it('can set gh token', setGithubToken);
    it('can see projects', checkProjects);
    it('can logout', clearCache);

    it('restart app', cloudronCli.restart);

    it('can login', login);
    it('can see projects', checkProjects);
    it('can logout', clearCache);

    it('backup app', cloudronCli.createBackup);
    it('restore app', cloudronCli.restoreFromLatestBackup);

    it('can login', login);
    it('can see projects', checkProjects);
    it('can logout', clearCache);

    it('move to different location', cloudronCli.changeLocation);

    it('can login', login);
    it('can see projects', checkProjects);
    it('can logout', clearCache);

    it('uninstall app', cloudronCli.uninstall);

    // test update
    it('can install app for update', cloudronCli.appstoreInstall);

    it('can login', login);
    it('can set gh token', setGithubToken);
    it('can logout', clearCache);

    it('can update', cloudronCli.update);

    it('can login', login);
    it('can see projects', checkProjects);
    it('can logout', clearCache);

    it('uninstall app', cloudronCli.uninstall);
});
