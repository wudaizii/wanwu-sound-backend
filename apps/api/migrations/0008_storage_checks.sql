CREATE TABLE storage_checks (
 object_key text PRIMARY KEY REFERENCES stored_objects(object_key),
 status text NOT NULL CHECK(status IN ('present','missing','invalid','unavailable')),
 checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX storage_checks_recent ON storage_checks(status,checked_at);
GRANT SELECT,INSERT,UPDATE ON storage_checks TO wanwu_app;
ALTER TABLE maintenance_runs DROP CONSTRAINT maintenance_runs_kind_check;
ALTER TABLE maintenance_runs ADD CONSTRAINT maintenance_runs_kind_check CHECK(kind IN ('garbage-collection','backup','restore-drill','storage-reconcile'));
