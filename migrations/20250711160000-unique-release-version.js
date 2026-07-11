'use strict';

exports.up = function(db) {
    // Remove pre-existing duplicate releases (same project + version), keeping one row each.
    db.exec(`
        DELETE FROM releases
        WHERE id NOT IN (
            SELECT MIN(id) FROM releases GROUP BY projectId, version
        )
    `);

    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS releases_project_version ON releases(projectId, version)');
};
