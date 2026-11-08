-- Catalogue excerpts stay shared catalogue assets; track who admitted new processing/storage, not who may read them.
ALTER TABLE sources ADD COLUMN requested_by uuid REFERENCES accounts(id);
CREATE INDEX sources_requester_pending ON sources(requested_by,status) WHERE requested_by IS NOT NULL;
