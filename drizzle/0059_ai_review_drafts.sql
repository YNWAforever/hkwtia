-- Durable reviewed drafts. Approval is evidence, never a send or membership effect.
CREATE TABLE ai_review_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), version integer NOT NULL DEFAULT 1 CHECK(version>0),
 kind text NOT NULL CHECK(kind IN ('application','support','renewal','board','content')), case_id text NOT NULL CHECK(length(case_id) BETWEEN 1 AND 255),
 locale text NOT NULL CHECK(locale IN ('en','zh-HK')), facts_hash text NOT NULL CHECK(facts_hash ~ '^[a-f0-9]{64}$'),
 owner_profile_id text REFERENCES profiles(id) ON DELETE RESTRICT, due_at timestamptz,
 source_refs jsonb NOT NULL CHECK(jsonb_typeof(source_refs)='array'), claims jsonb NOT NULL CHECK(jsonb_typeof(claims)='array'),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 20000), rendered_body text NOT NULL,
 state text NOT NULL CHECK(state IN ('proposed','needs_review','approved','rejected','stale')),
 violations jsonb NOT NULL CHECK(jsonb_typeof(violations)='array'),
 model_route text NOT NULL CHECK(length(model_route) BETWEEN 1 AND 120), prompt_version text NOT NULL CHECK(length(prompt_version) BETWEEN 1 AND 80),
 run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE RESTRICT,
 approved_by text REFERENCES profiles(id) ON DELETE RESTRICT, approved_at timestamptz, approved_version integer,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ai_review_drafts_approved CHECK(state<>'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_version IS NOT NULL AND approved_version=version AND jsonb_array_length(violations)=0)),
 CONSTRAINT ai_review_drafts_unapproved CHECK(state='approved' OR (approved_by IS NULL AND approved_at IS NULL AND approved_version IS NULL))
);
--> statement-breakpoint
CREATE INDEX ai_review_drafts_queue ON ai_review_drafts(state,updated_at DESC,id);
CREATE INDEX ai_review_drafts_case ON ai_review_drafts(kind,case_id,created_at DESC);
CREATE INDEX ai_review_drafts_owner_queue ON ai_review_drafts(owner_profile_id,state,updated_at DESC,id);
--> statement-breakpoint
CREATE TABLE ai_draft_revisions (
 draft_id uuid NOT NULL REFERENCES ai_review_drafts(id) ON DELETE RESTRICT, version integer NOT NULL CHECK(version>0),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'), actor_profile_id text NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(draft_id,version)
);
--> statement-breakpoint
CREATE TABLE ai_draft_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), draft_id uuid NOT NULL REFERENCES ai_review_drafts(id) ON DELETE RESTRICT,
 expected_version integer NOT NULL CHECK(expected_version>0), resulting_version integer NOT NULL CHECK(resulting_version=expected_version+1),
 decision text NOT NULL CHECK(decision IN ('approve','reject')), reviewer_profile_id text NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
 reason text CHECK(length(reason)<=1000), facts_hash text NOT NULL CHECK(facts_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(draft_id,expected_version)
);
--> statement-breakpoint
CREATE TABLE ai_draft_work (
 run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('application','support','renewal','board','content')),
 case_id text NOT NULL CHECK(length(case_id) BETWEEN 1 AND 255), facts_hash text NOT NULL CHECK(facts_hash ~ '^[a-f0-9]{64}$'),
 agent_version text NOT NULL CHECK(length(agent_version) BETWEEN 1 AND 120), idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 255),
 state text NOT NULL CHECK(state IN ('claimed','requesting','succeeded','unknown','failed_before_request')),
 claim_token uuid NOT NULL, lease_until timestamptz NOT NULL, request_started_at timestamptz,
 draft_id uuid REFERENCES ai_review_drafts(id) ON DELETE RESTRICT, provider_request_id text CHECK(length(provider_request_id) BETWEEN 1 AND 255),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ai_draft_work_scope_key UNIQUE(kind,case_id,facts_hash,agent_version,idempotency_key),
 CONSTRAINT ai_draft_work_effect_state CHECK(
 (state IN ('claimed','failed_before_request') AND request_started_at IS NULL AND draft_id IS NULL) OR
 (state IN ('requesting','unknown') AND request_started_at IS NOT NULL AND draft_id IS NULL) OR
 (state='succeeded' AND request_started_at IS NOT NULL AND draft_id IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX ai_draft_work_pending ON ai_draft_work(state,lease_until);

--> statement-breakpoint
-- Review evidence is append-only. Retention/redaction policy requires a separately reviewed forward repair.
CREATE FUNCTION hkwtia_ai_draft_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'AI_DRAFT_HISTORY_IMMUTABLE';
END $$;
--> statement-breakpoint
CREATE TRIGGER ai_draft_revisions_immutable BEFORE UPDATE OR DELETE ON ai_draft_revisions
FOR EACH ROW EXECUTE FUNCTION hkwtia_ai_draft_history_immutable();
CREATE TRIGGER ai_draft_reviews_immutable BEFORE UPDATE OR DELETE ON ai_draft_reviews
FOR EACH ROW EXECUTE FUNCTION hkwtia_ai_draft_history_immutable();
