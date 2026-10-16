CREATE SEQUENCE "page_copy_publication_seq";
--> statement-breakpoint
CREATE TABLE "page_copy_drafts" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "owner_profile_id" text NOT NULL REFERENCES "profiles"("id") ON DELETE RESTRICT,
 "namespace" text NOT NULL,
 "base_revision" varchar(64) NOT NULL,
 "revision" varchar(64) NOT NULL,
 "entries" jsonb NOT NULL,
 "base_entries" jsonb NOT NULL,
 "previous_entries" jsonb,
 "published_at" timestamptz,
 "publication_sequence" bigint,
 "created_at" timestamptz DEFAULT now() NOT NULL,
 "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "page_copy_draft_publication_pair" CHECK (("published_at" IS NULL) = ("publication_sequence" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "page_copy_one_open_draft" ON "page_copy_drafts"("owner_profile_id","namespace") WHERE "published_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "page_copy_publication_history" ON "page_copy_drafts"("namespace","publication_sequence") WHERE "published_at" IS NOT NULL;
