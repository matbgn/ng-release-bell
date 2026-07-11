'use strict';

var async = require('async');

exports.up = function(db, callback) {
    async.series([
        db.runSql.bind(db, 'ALTER TABLE projects ADD COLUMN emailFrequency VARCHAR(16) NOT NULL DEFAULT "instant"'),
        db.runSql.bind(db, 'ALTER TABLE projects ADD COLUMN excludePrereleases BOOLEAN DEFAULT false'),
        db.runSql.bind(db, 'ALTER TABLE projects ADD COLUMN excludeUpdated BOOLEAN DEFAULT false'),
        db.runSql.bind(db, 'ALTER TABLE projects ADD COLUMN versionFilters TEXT NULL'),
        db.runSql.bind(db, 'ALTER TABLE projects ADD COLUMN lastNotifiedAt BIGINT DEFAULT 0'),
        db.runSql.bind(db, 'ALTER TABLE releases ADD COLUMN sha VARCHAR(128) DEFAULT ""'),
        db.runSql.bind(db, 'ALTER TABLE users ADD COLUMN quayToken VARCHAR(512) NOT NULL DEFAULT ""'),
        db.runSql.bind(db, 'ALTER TABLE users ADD COLUMN githubAutoImport BOOLEAN DEFAULT true')
    ], callback);
};

exports.down = function(db, callback) {
    async.series([
        db.runSql.bind(db, 'ALTER TABLE projects DROP COLUMN emailFrequency'),
        db.runSql.bind(db, 'ALTER TABLE projects DROP COLUMN excludePrereleases'),
        db.runSql.bind(db, 'ALTER TABLE projects DROP COLUMN excludeUpdated'),
        db.runSql.bind(db, 'ALTER TABLE projects DROP COLUMN versionFilters'),
        db.runSql.bind(db, 'ALTER TABLE projects DROP COLUMN lastNotifiedAt'),
        db.runSql.bind(db, 'ALTER TABLE releases DROP COLUMN sha'),
        db.runSql.bind(db, 'ALTER TABLE users DROP COLUMN quayToken'),
        db.runSql.bind(db, 'ALTER TABLE users DROP COLUMN githubAutoImport')
    ], callback);
};