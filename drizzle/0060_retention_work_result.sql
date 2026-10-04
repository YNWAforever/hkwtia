-- Add a constrained reference to the existing retention approval result.
-- Existing draft rows and historical approvals remain unchanged.
ALTER TABLE ai_draft_work ADD COLUMN approval_id uuid;
--> statement-breakpoint
ALTER TABLE ai_draft_work ADD CONSTRAINT ai_draft_work_approval_id_approvals_id_fk FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE ai_draft_work DROP CONSTRAINT ai_draft_work_effect_state;
--> statement-breakpoint
ALTER TABLE ai_draft_work ADD CONSTRAINT ai_draft_work_effect_state CHECK (
 (state IN ('claimed','failed_before_request') AND request_started_at IS NULL AND draft_id IS NULL AND approval_id IS NULL) OR
 (state IN ('requesting','unknown') AND request_started_at IS NOT NULL AND draft_id IS NULL AND approval_id IS NULL) OR
 (state='succeeded' AND request_started_at IS NOT NULL AND
   ((draft_id IS NOT NULL AND approval_id IS NULL) OR (kind='renewal' AND draft_id IS NULL AND approval_id IS NOT NULL)))
);
--> statement-breakpoint
CREATE INDEX approvals_pending_retention_profile ON approvals ((payload->>'profileId')) WHERE action_type='agent.retention_outreach' AND status='pending';
