CREATE TABLE "page_copy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"locale" varchar(10) NOT NULL,
	"namespace" text NOT NULL,
	"key_path" text NOT NULL,
	"value" text NOT NULL,
	"updated_by_profile_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_copy" ADD CONSTRAINT "page_copy_updated_by_profile_id_profiles_id_fk" FOREIGN KEY ("updated_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "page_copy_locale_namespace_key_path_unique" ON "page_copy" USING btree ("locale","namespace","key_path");--> statement-breakpoint
CREATE INDEX "page_copy_locale_idx" ON "page_copy" USING btree ("locale");