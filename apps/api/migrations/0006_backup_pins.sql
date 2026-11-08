-- A retained database backup must not outlive the media it can restore.
-- Only the owner/operations role can create or change pins; the runtime/GC role can read them.
CREATE TABLE backup_object_pins (
 backup_id uuid NOT NULL REFERENCES maintenance_runs(id),
 object_key text NOT NULL REFERENCES stored_objects(object_key),
 protected_until timestamptz NOT NULL,
 PRIMARY KEY(backup_id,object_key)
);
CREATE INDEX backup_object_pins_active ON backup_object_pins(object_key,protected_until);
REVOKE ALL ON backup_object_pins FROM PUBLIC,wanwu_app;
GRANT SELECT ON backup_object_pins TO wanwu_app;

-- Conservatively protect surviving media for recent pre-upgrade successful backups.
-- This cannot recreate a file already deleted; the restore drill must detect that.
INSERT INTO backup_object_pins(backup_id,object_key,protected_until)
SELECT b.id,o.object_key,b.finished_at+interval '37 days'
FROM maintenance_runs b CROSS JOIN stored_objects o
WHERE b.kind='backup' AND b.status='pass' AND b.finished_at>now()-interval '30 days'
 AND o.deleted_at IS NULL;
