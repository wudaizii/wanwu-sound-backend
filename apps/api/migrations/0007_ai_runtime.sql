-- No prompts, BYOK credentials, audio or provider response bodies in usage/lease records.
CREATE TABLE ai_daily_usage (
 day date PRIMARY KEY, calls integer NOT NULL CHECK(calls>=0), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ai_call_leases (
 id uuid PRIMARY KEY, expires_at timestamptz NOT NULL
);
CREATE TABLE ai_background_jobs (
 id uuid PRIMARY KEY, owner_hash char(64) NOT NULL, input_digest char(64) NOT NULL,
 step text NOT NULL CHECK(step IN ('audio-ai','voice-ai','notes-ai')),
 mode text NOT NULL CHECK(mode IN ('builtin','ephemeral')),
 brief jsonb, provider_digest char(64) NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','done')),
 result jsonb, job_id uuid, lease_id uuid, deadline timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 CHECK(mode='builtin' OR brief IS NULL), CHECK(status<>'done' OR result IS NOT NULL)
);
CREATE INDEX ai_jobs_owner_input ON ai_background_jobs(owner_hash,input_digest,created_at DESC);
CREATE INDEX ai_jobs_pending ON ai_background_jobs(status,deadline) WHERE status<>'done';
ALTER TABLE runtime_status DROP CONSTRAINT runtime_status_component_check;
ALTER TABLE runtime_status ADD CONSTRAINT runtime_status_component_check CHECK(component IN ('media-worker','ai-worker'));
GRANT SELECT,INSERT,UPDATE,DELETE ON ai_daily_usage,ai_call_leases,ai_background_jobs TO wanwu_app;
