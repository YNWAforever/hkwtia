CREATE TABLE ai_budget_control (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 halted boolean NOT NULL DEFAULT false,
 reason_code text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO ai_budget_control (id) VALUES (true);
--> statement-breakpoint
CREATE TABLE ai_budget_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_key uuid NOT NULL UNIQUE,
 scope text NOT NULL CHECK (scope IN ('concierge','writer','application','support','renewal','board','content','evaluation','embedding','judge')),
 max_microusd bigint NOT NULL CHECK (max_microusd >= 0 AND max_microusd <= 9007199254740991),
 charged_microusd bigint NOT NULL CHECK (charged_microusd >= 0 AND charged_microusd <= 9007199254740991),
 actual_microusd bigint CHECK (actual_microusd >= 0 AND actual_microusd <= 9007199254740991),
 usage_state text NOT NULL DEFAULT 'held' CHECK (usage_state IN ('held','unknown','known','released')),
 pricing_version text NOT NULL,
 expires_at timestamptz NOT NULL,
 dispatched_at timestamptz,
 provider_request_id text CHECK (provider_request_id IS NULL OR provider_request_id ~ '^[A-Za-z0-9_.:-]{1,200}$'),
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 CHECK (expires_at > created_at),
 CHECK ((usage_state = 'known' AND actual_microusd IS NOT NULL AND charged_microusd = actual_microusd)
   OR (usage_state IN ('held','unknown') AND actual_microusd IS NULL AND charged_microusd = max_microusd)
   OR (usage_state = 'released' AND actual_microusd IS NULL AND charged_microusd = 0 AND dispatched_at IS NULL))
);
--> statement-breakpoint
CREATE INDEX ai_budget_created_idx ON ai_budget_reservations (created_at);
--> statement-breakpoint
CREATE INDEX ai_budget_unresolved_idx ON ai_budget_reservations (usage_state) WHERE usage_state IN ('held','unknown');

--> statement-breakpoint
ALTER TABLE agent_runs ALTER COLUMN cost_usd DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE agent_runs ADD COLUMN usage_state text NOT NULL DEFAULT 'legacy_unknown' CHECK (usage_state IN ('known','unknown','not_dispatched','legacy_unknown'));
--> statement-breakpoint
ALTER TABLE agent_runs ADD COLUMN cache_read_tokens bigint, ADD COLUMN cache_write_tokens bigint, ADD COLUMN reasoning_tokens bigint, ADD COLUMN pricing_version text;

--> statement-breakpoint
ALTER TABLE ai_budget_reservations ADD COLUMN accepted_at timestamptz;
--> statement-breakpoint
CREATE TABLE ai_budget_provider_receipts (
 reservation_id uuid NOT NULL REFERENCES ai_budget_reservations(id),
 provider_request_id text NOT NULL CHECK (provider_request_id ~ '^[A-Za-z0-9_.:-]{1,200}$'),
 observed_at timestamptz NOT NULL,
 PRIMARY KEY (reservation_id,provider_request_id)
);

--> statement-breakpoint
ALTER TABLE agent_runs ADD COLUMN cost_microusd bigint CHECK (cost_microusd >= 0 AND cost_microusd <= 9007199254740991);
