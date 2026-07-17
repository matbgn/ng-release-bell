'use strict';

const assert = require('assert'),
    fs = require('fs'),
    database = require('./database.js'),
    debug = require('debug')('ngreleasebell/tasks'),
    github = require('./github.js'),
    gitlab = require('./gitlab.js'),
    gitea = require('./gitea.js'),
    npm = require('./npm.js'),
    pypi = require('./pypi.js'),
    dockerhub = require('./dockerhub.js'),
    quay = require('./quay.js'),
    ghcr = require('./ghcr.js'),
    sourceforge = require('./sourceforge.js'),
    { passesVersionFilters } = require('./regex-validator.js'),
    handlebars = require('handlebars'),
    markdown = require('helper-markdown'),
    nodemailer = require('nodemailer'),
    path = require('path');

handlebars.registerHelper('markdown', function(text) {
    text = markdown(text);
    return new handlebars.SafeString(text);
});

const CAN_SEND_EMAIL = (process.env.MAIL_SMTP_SERVER && process.env.MAIL_SMTP_PORT && process.env.MAIL_FROM);
if (CAN_SEND_EMAIL) {
    console.log(`Can send emails. Email notifications are sent out as ${process.env.MAIL_FROM}`);
} else {
    console.log(`
No email configuration found. Set the following environment variables:
    MAIL_SMTP_SERVER
    MAIL_SMTP_PORT
    MAIL_SMTP_USERNAME
    MAIL_SMTP_PASSWORD
    MAIL_FROM
    `);
}

module.exports = exports = {
    run,
    syncReleasesByProject,
    sendTestEmail,
    CAN_SEND_EMAIL
};

const PROVIDERS = {
    github: github,
    github_manual: github,
    gitlab: gitlab,
    gitea: gitea,
    npm: npm,
    pypi: pypi,
    dockerhub: dockerhub,
    quay: quay,
    ghcr: ghcr,
    sourceforge: sourceforge
};

const REGISTRY_PROVIDERS = new Set(['npm', 'pypi', 'dockerhub', 'quay', 'ghcr', 'sourceforge']);
const MAX_NEW_RELEASES = 50;

const EMAIL_TEMPLATE = handlebars.compile(fs.readFileSync(path.resolve(__dirname, 'notification.template'), 'utf8'));
const DIGEST_TEMPLATE = handlebars.compile(fs.readFileSync(path.resolve(__dirname, 'notification-digest.template'), 'utf8'));
const COMBINED_DIGEST_TEMPLATE = handlebars.compile(fs.readFileSync(path.resolve(__dirname, 'notification-digest-combined.template'), 'utf8'));

function buildTransport() {
    return nodemailer.createTransport({
        host: process.env.MAIL_SMTP_SERVER,
        port: process.env.MAIL_SMTP_PORT,
        auth: {
            user: process.env.MAIL_SMTP_USERNAME,
            pass: process.env.MAIL_SMTP_PASSWORD
        }
    });
}

async function sendTestEmail(user, email) {
    assert.strictEqual(typeof user, 'object');
    assert.strictEqual(typeof email, 'string');

    const transport = buildTransport();
    await transport.sendMail({
        from: process.env.MAIL_FROM,
        to: email,
        subject: 'NG Release Bell - Test Email',
        text: 'This is a test email from NG Release Bell to validate your email configuration. If you received this, your SMTP settings are working correctly.',
        html: '<p>This is a test email from <strong>NG Release Bell</strong> to validate your email configuration. If you received this, your SMTP settings are working correctly.</p>'
    });
}

let gTasksActive = false;
let gRetryAt = 0;

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

async function run() {
    if (gTasksActive) return debug('run: already running');

    gTasksActive = true;

    debug('run: start');

    try {
        await syncProjects();
    } catch (error) {
        console.error('Failed to sync projects', error);
    }

    try {
        await syncReleases();
    } catch (error) {
        console.error('Failed to sync releases', error);
    }

    try {
        await sendNotifications();
    } catch (error) {
        console.error('Failed to send notifications', error);
    }

    const nextRun = gRetryAt ? ((60*1000) + (gRetryAt - Date.now())) : (5 * 60 * 1000);

    gRetryAt = 0;
    gTasksActive = false;

    debug(`run: done. Next run in ${nextRun/1000}s at ${new Date(nextRun + Date.now())}`);

    setTimeout(run, nextRun);
}

async function syncProjects() {
    const users = await database.users.list();

    shuffleArray(users);

    for (let user of users) {
        try {
            await syncGithubStarredByUser(user);
        } catch (error) {
            console.error(error);
        }
    }
}

async function syncGithubStarredByUser(user) {
    assert.strictEqual(typeof user, 'object');

    if (!user.githubToken) return '';
    if (user.githubAutoImport === false || user.githubAutoImport === 0) return debug('syncGithubStarredByUser: auto-import disabled for user', user.id);

    debug('syncGithubStarredByUser: ', user.id);

    const result = await github.getStarred(user.githubToken);

    debug(`syncGithubStarredByUser: found ${result.length} starred repos`);

    const starredProjects = result.map(function (p) { return { name: p.full_name }; });

    const trackedProjects = await database.projects.listByType(user.id, database.PROJECT_TYPE_GITHUB);

    const newProjects = starredProjects.filter(function (a) { return !trackedProjects.find(function (b) { return a.name === b.name; }); });
    const outdatedProjects = trackedProjects.filter(function (a) { return !starredProjects.find(function (b) { return a.name === b.name; }); });

    debug(`syncGithubStarredByUser: new projects: ${newProjects.length} outdated projects: ${outdatedProjects.length}`);

    for (let project of newProjects) {
        debug(`syncGithubStarredByUser: [${project.name}] is new for user ${user.id}`);

        const result = await database.projects.add({ type: database.PROJECT_TYPE_GITHUB, userId: user.id, name: project.name });

        await syncReleasesByProject(user, result);
    }

    for (let project of outdatedProjects) {
        debug(`syncGithubStarredByUser: [${project.name}] not starred anymore by ${user.id}`);

        try {
            await database.projects.remove(project.id);
        } catch (error) {
            console.error(`Failed to remove outdated project ${project.name} for ${user.id}`, error);
        }
    }
}

function getVersionLink(project, version) {
    if (project.type === database.PROJECT_TYPE_GITHUB || project.type === database.PROJECT_TYPE_GITHUB_MANUAL) {
        return `https://github.com/${project.name}/releases/tag/${version}`;
    } else if (project.type === database.PROJECT_TYPE_GITLAB) {
        return `${project.origin}/${project.name}/-/tags/${version}`;
    } else if (project.type === database.PROJECT_TYPE_GITEA) {
        return `${project.origin}/${project.name}/releases/tag/${version}`;
    } else if (project.type === database.PROJECT_TYPE_NPM) {
        return `https://www.npmjs.com/package/${project.name}/v/${version}`;
    } else if (project.type === database.PROJECT_TYPE_PYPI) {
        return `https://pypi.org/project/${project.name}/${version}/`;
    } else if (project.type === database.PROJECT_TYPE_DOCKERHUB) {
        return `https://hub.docker.com/r/${project.name}/tags?name=${version}`;
    } else if (project.type === database.PROJECT_TYPE_QUAY) {
        return `https://quay.io/repository/${project.name}`;
    } else if (project.type === database.PROJECT_TYPE_GHCR) {
        return `https://github.com/${project.name.split('/')[0]}?tab=packages`;
    } else if (project.type === database.PROJECT_TYPE_SOURCEFORGE) {
        return `https://sourceforge.net/projects/${project.name}/files/${version}/`;
    }
    return '';
}

async function syncReleasesByProject(user, project) {
    assert.strictEqual(typeof user, 'object');
    assert.strictEqual(typeof project, 'object');

    debug(`syncReleasesByProject: [${project.name}] type ${project.type} start sync releases, notifications are ${project.enabled ? 'enabled' : 'disabled'}. Last successful sync was at`, new Date(project.lastSuccessfulSyncAt));

    const api = PROVIDERS[project.type];
    if (!api) {
        debug(`syncReleasesByProject: [${project.name}] unknown type ${project.type}. Ignoring for now`);
        return;
    }

    const providerToken = project.type === database.PROJECT_TYPE_QUAY
        ? (user.quayToken || process.env.QUAY_TOKEN)
        : user.githubToken;

    const upstreamReleases = await api.getReleases(providerToken, project);
    const trackedReleases = await database.releases.list(project.id);

    let newReleases = upstreamReleases.filter(function (a) { return !trackedReleases.find(function (b) { return a.version == b.version; }); });

    newReleases.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (newReleases.length > MAX_NEW_RELEASES) {
        console.log(`Limiting ${project.name}: found ${newReleases.length} new releases, processing only the ${MAX_NEW_RELEASES} most recent`);
        newReleases = newReleases.slice(0, MAX_NEW_RELEASES);
    }

    debug(`syncReleasesByProject: [${project.name}] found ${newReleases.length} new releases`);

    const isRegistry = REGISTRY_PROVIDERS.has(project.type);

    for (let release of newReleases) {
        release.notified = !project.lastSuccessfulSyncAt ? true : !project.enabled;

        if (isRegistry) {
            release.body = release.body || '';
            release.prerelease = release.prerelease || false;
            release.sha = release.sha || '';
            release.createdAt = release.createdAt || 0;
        } else {
            release.body = '';
            release.createdAt = 0;
            release.prerelease = false;
        }

        const existingWithSha = trackedReleases.find(b => b.version === release.version);
        if (existingWithSha && release.sha && existingWithSha.sha && existingWithSha.sha !== release.sha) {
            if (project.excludeUpdated) {
                release.notified = true;
            } else {
                await database.releases.update(existingWithSha.id, { sha: release.sha, notified: false });
                continue;
            }
        }

        if (project.excludePrereleases && release.prerelease) {
            release.notified = true;
        }

        if (!passesVersionFilters(release.version, project.versionFilters)) {
            release.notified = true;
        }

        if (isRegistry) {
            if (!release.notified && Date.now() - release.createdAt > 10 * 24 * 60 * 60 * 1000) release.notified = true;

            if (release.body && release.body.length > 65000) {
                release.body = release.body.substring(0, 65000) + '...';
            }

            await database.releases.add(release);
            continue;
        }

        let commit;
        try {
            commit = await api.getCommit(user.githubToken, project, release.sha);
            release.createdAt = new Date(commit.createdAt).getTime() || 0;
        } catch (error) {
            console.error(`Failed to get commit for ${project.name} ${release.version}. Using createdAt=0.`, error);
        }

        try {
            const result = await api.getRelease(user.githubToken, project, release.version);
            release.body = result.body;
            release.prerelease = result.prerelease;
            if (result.publishedAt) release.createdAt = new Date(result.publishedAt).getTime() || release.createdAt;
        } catch (error) {
            console.error(`Failed to get release body for ${project.name} ${release.version}. Falling back to commit message.`, error);
            release.body = '';
            release.prerelease = false;
        }

        if (project.excludePrereleases && release.prerelease) {
            release.notified = true;
        }

        if (Date.now() - release.createdAt > 10 * 24 * 60 * 60 * 1000) release.notified = true;

        debug(`syncReleasesByProject: [${project.name}] add release ${release.version} from ${release.createdAt} as ${commit ? new Date(commit.createdAt) : 'unknown'} notified ${release.notified}`);

        if (!release.body) {
            const fullBody = 'Latest commit message: \n' + (commit ? commit.message : 'unknown');
            const releaseBody = fullBody.length > 1000 ? fullBody.substring(0, 1000) + '...' : fullBody;
            release.body = releaseBody;
        } else {
            release.body = release.body.length > 65000 ? release.body.substring(0, 65000) + '...' : release.body;
        }

        await database.releases.add(release);
    }

    debug(`syncReleasesByProject: [${project.name}] successfully synced`);

    await database.projects.update(project.id, { lastSuccessfulSyncAt: Date.now() });
}

async function syncReleasesByUser(user) {
    assert.strictEqual(typeof user, 'object');

    const projects = await database.projects.list(user.id);

    shuffleArray(projects);

    for (let project of projects) {
        try {
            await syncReleasesByProject(user, project);
        } catch (error) {
            console.error(`Failed to sync releases for ${project.name} (${project.type}). Continuing...`, error);
        }
    }
}

async function syncReleases() {
    const users = await database.users.list();

    shuffleArray(users);

    for (let user of users) {
        try {
            await syncReleasesByUser(user);
        } catch (error) {
            console.error(`Failed to get releases for user ${user.id}. Continuing...`, error);
        }
    }
}

async function sendNotificationEmail(release, project) {
    assert.strictEqual(typeof release, 'object');

    if (!CAN_SEND_EMAIL) {
        console.log('Would send email for release', release);
        return;
    }

    if (!project) project = await database.projects.get(release.projectId);
    const user = await database.users.get(project.userId);

    const transport = buildTransport();

    const versionLink = getVersionLink(project, release.version);
    const settingsLink = process.env.APP_ORIGIN || '';

    const mail = {
        from: `${process.env.MAIL_FROM_DISPLAY_NAME ? process.env.MAIL_FROM_DISPLAY_NAME : 'NG Release Bell'} <${process.env.MAIL_FROM}>`,
        to: user.email,
        subject: `${project.name} ${release.version}${release.prerelease ? ' (prerelease)' : ''} released`,
        text: `A new ${release.prerelease ? 'prerelease' : 'release'} at ${project.name} with version ${release.version} was published. ${release.body}. Read more about this release at ${versionLink}`,
        html: EMAIL_TEMPLATE({ project, release, versionLink, settingsLink })
    };

    await transport.sendMail(mail);
    await database.releases.update(release.id, { notified: true });
}

async function sendCombinedDigestEmail(user, entries) {
    assert.strictEqual(typeof user, 'object');
    assert.strictEqual(typeof entries, 'object');

    const totalReleases = entries.reduce((n, e) => n + e.pending.length, 0);

    if (!CAN_SEND_EMAIL) {
        console.log(`Would send hourly digest email to ${user.email} for ${entries.length} project(s) with ${totalReleases} release(s)`);
        return;
    }

    const settingsLink = process.env.APP_ORIGIN || '';

    const projectsData = entries.map(function (entry) {
        const releaseData = entry.pending.map(function (release) {
            return {
                version: release.version,
                versionLink: getVersionLink(entry.project, release.version),
                date: release.createdAt ? new Date(release.createdAt).toLocaleDateString() : '',
                prerelease: release.prerelease
            };
        });
        return { name: entry.project.name, releases: releaseData };
    });

    const transport = buildTransport();
    const mail = {
        from: `${process.env.MAIL_FROM_DISPLAY_NAME ? process.env.MAIL_FROM_DISPLAY_NAME : 'NG Release Bell'} <${process.env.MAIL_FROM}>`,
        to: user.email,
        subject: `NG Release Bell Digest: ${entries.length} project(s), ${totalReleases} new release(s)`,
        text: projectsData.map(p => `${p.name}: ${p.releases.map(r => r.version).join(', ')}`).join('\n'),
        html: COMBINED_DIGEST_TEMPLATE({ projects: projectsData, settingsLink })
    };

    await transport.sendMail(mail);
}

async function sendNotifications() {
    const now = Date.now();
    const startOfHour = Math.floor(now / 3600000) * 3600000;
    const atTopOfHour = (now - startOfHour) < 5 * 60 * 1000;

    const projects = await database.projects.listAllWithPendingReleases();

    // Instant: send each pending release individually on every run (every 5 minutes).
    for (const project of projects) {
        if ((project.emailFrequency || 'instant') !== 'instant') continue;

        const pending = await database.releases.listPendingForProject(project.id);
        if (pending.length === 0) continue;

        for (const release of pending) {
            try {
                await sendNotificationEmail(release, project);
            } catch (error) {
                console.error(`Failed to send notification email for release ${release.projectId}/${release.version}`, error);
            }
        }
    }

    // Hourly: stack all pending releases across the user's projects into a single
    // digest, sent only at the top of the hour.
    if (atTopOfHour) {
        const byUser = new Map();
        for (const project of projects) {
            if ((project.emailFrequency || 'instant') !== 'hourly') continue;

            const pending = await database.releases.listPendingForProject(project.id);
            if (pending.length === 0) continue;

            if (!byUser.has(project.userId)) byUser.set(project.userId, []);
            byUser.get(project.userId).push({ project, pending });
        }

        for (const [userId, entries] of byUser) {
            try {
                const user = await database.users.get(userId);
                await sendCombinedDigestEmail(user, entries);
                for (const entry of entries) {
                    for (const r of entry.pending) await database.releases.update(r.id, { notified: true });
                    await database.projects.update(entry.project.id, { lastNotifiedAt: Date.now() });
                }
            } catch (error) {
                console.error(`Failed to send hourly digest for user ${userId}`, error);
            }
        }
    }

    // Daily / Weekly: keep the existing interval-based digest behavior.
    const intervals = { daily: 24 * 3600 * 1000, weekly: 7 * 24 * 3600 * 1000 };
    for (const project of projects) {
        const freq = project.emailFrequency || 'instant';
        const interval = intervals[freq];
        if (!interval) continue;

        const pending = await database.releases.listPendingForProject(project.id);
        if (pending.length === 0) continue;

        if (now - (project.lastNotifiedAt || 0) < interval) continue;

        try {
            const user = await database.users.get(project.userId);
            await sendDigestEmail(user, project, pending);
            for (const r of pending) await database.releases.update(r.id, { notified: true });
            await database.projects.update(project.id, { lastNotifiedAt: Date.now() });
        } catch (error) {
            console.error(`Failed to send digest for ${project.name}`, error);
        }
    }
}