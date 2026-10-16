-- Additive governance. Every historical row remains unverified; arbitrary JSON metadata never grants approval.
ALTER TABLE kb_documents
 ADD COLUMN source_id uuid NOT NULL DEFAULT gen_random_uuid(),
 ADD COLUMN version integer NOT NULL DEFAULT 1,
 ADD COLUMN approval_state text NOT NULL DEFAULT 'unverified',
 ADD COLUMN audience text NOT NULL DEFAULT 'public',
 ADD COLUMN owner_profile_id text REFERENCES profiles(id) ON DELETE RESTRICT,
 ADD COLUMN approved_by text REFERENCES profiles(id) ON DELETE RESTRICT,
 ADD COLUMN effective_from timestamptz,
 ADD COLUMN effective_to timestamptz,
 ADD COLUMN review_due timestamptz,
 ADD COLUMN content_hash text,
 ADD COLUMN original_content text,
 ADD COLUMN chunk_start integer,
 ADD COLUMN chunk_end integer,
 ADD COLUMN structured_facts jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN supersedes_version integer,
 ADD COLUMN index_state text NOT NULL DEFAULT 'unindexed',
 ADD COLUMN index_attempt_id uuid;
--> statement-breakpoint
ALTER TABLE kb_documents
 ADD CONSTRAINT kb_documents_governance_states CHECK (approval_state IN ('unverified','draft','approved','withdrawn') AND audience IN ('public','staff') AND index_state IN ('unindexed','indexing','ready','failed')),
 ADD CONSTRAINT kb_documents_version_valid CHECK (version>0 AND (supersedes_version IS NULL OR supersedes_version<version)),
 ADD CONSTRAINT kb_documents_effective_range CHECK (effective_to IS NULL OR effective_from IS NOT NULL AND effective_to>effective_from),
 ADD CONSTRAINT kb_documents_approved_provenance CHECK (approval_state<>'approved' OR (owner_profile_id IS NOT NULL AND approved_by IS NOT NULL AND approved_by<>owner_profile_id AND effective_from IS NOT NULL AND review_due IS NOT NULL AND review_due>effective_from AND content_hash IS NOT NULL AND content_hash ~ '^[a-f0-9]{64}$' AND original_content IS NOT NULL AND content_hash=encode(sha256(convert_to(original_content,'UTF8')),'hex') AND chunk_start IS NOT NULL AND chunk_end IS NOT NULL AND chunk_start>=0 AND chunk_end>chunk_start AND substring(original_content FROM chunk_start+1 FOR chunk_end-chunk_start)=content)),
 ADD CONSTRAINT kb_documents_ready_approved CHECK (index_state<>'ready' OR approval_state='approved');
--> statement-breakpoint
CREATE UNIQUE INDEX kb_documents_source_chunk_version_idx ON kb_documents(source_id,locale,version,chunk_start) WHERE chunk_start IS NOT NULL;
CREATE INDEX kb_documents_approved_scope_idx ON kb_documents(namespace,locale,audience,approval_state,index_state,effective_from,effective_to,review_due);
CREATE INDEX kb_documents_source_versions_idx ON kb_documents(source_id,locale,version);
