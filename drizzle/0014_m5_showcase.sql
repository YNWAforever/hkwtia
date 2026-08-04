CREATE TYPE "public"."lead_status" AS ENUM('new', 'contacted', 'closed');--> statement-breakpoint
CREATE TYPE "public"."showcase_listing_status" AS ENUM('draft', 'pending_review', 'published', 'rejected');--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"organization" text,
	"message" text,
	"locale" varchar(10) DEFAULT 'en' NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "showcase_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"status" "showcase_listing_status" DEFAULT 'draft' NOT NULL,
	"premium" boolean DEFAULT false NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"member_since" date NOT NULL,
	"name_en" text NOT NULL,
	"name_zh_hk" text NOT NULL,
	"tagline_en" text NOT NULL,
	"tagline_zh_hk" text NOT NULL,
	"description_en" text NOT NULL,
	"description_zh_hk" text NOT NULL,
	"category" text NOT NULL,
	"use_cases" text[] DEFAULT '{}'::text[] NOT NULL,
	"deployment_options" text[] DEFAULT '{}'::text[] NOT NULL,
	"supported_languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"works_with" text[] DEFAULT '{}'::text[] NOT NULL,
	"video_url" text,
	"case_study_url" text,
	"case_study_summary_en" text,
	"case_study_summary_zh_hk" text,
	"logo_reference" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_profile_id" text,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "showcase_listings_views_check" CHECK ("showcase_listings"."views" >= 0)
);
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_listing_id_showcase_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."showcase_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "showcase_listings" ADD CONSTRAINT "showcase_listings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "showcase_listings" ADD CONSTRAINT "showcase_listings_reviewed_by_profile_id_profiles_id_fk" FOREIGN KEY ("reviewed_by_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_listing_created_idx" ON "leads" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "showcase_listings_company_unique" ON "showcase_listings" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "showcase_listings_slug_unique" ON "showcase_listings" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "showcase_listings_status_premium_category_idx" ON "showcase_listings" USING btree ("status","premium","category");--> statement-breakpoint
CREATE INDEX "showcase_listings_use_cases_idx" ON "showcase_listings" USING gin ("use_cases");--> statement-breakpoint
CREATE INDEX "showcase_listings_deployment_options_idx" ON "showcase_listings" USING gin ("deployment_options");--> statement-breakpoint
CREATE INDEX "showcase_listings_supported_languages_idx" ON "showcase_listings" USING gin ("supported_languages");--> statement-breakpoint
CREATE INDEX "showcase_listings_works_with_idx" ON "showcase_listings" USING gin ("works_with");