-- Freeze admission/encoding settings; later administrator edits never change an existing task's inputs.
ALTER TABLE sources ADD COLUMN upload_policy jsonb NOT NULL DEFAULT '{"maxBytes":20971520,"maxSeconds":45.5}';
ALTER TABLE work_snapshots ADD COLUMN encoding jsonb NOT NULL DEFAULT '{"mp3Kbps":128}';
