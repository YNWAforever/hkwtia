CREATE TABLE "application_supplement_receipts" (
	"actor" text NOT NULL,
	"operation_request_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	CONSTRAINT "application_supplement_receipts_actor_operation_request_id_pk" PRIMARY KEY("actor","operation_request_id"),
	CONSTRAINT "application_supplement_receipt_kind" CHECK ("application_supplement_receipts"."kind" IN ('create','publish','respond','close','cancel'))
);
--> statement-breakpoint
CREATE TABLE "application_supplement_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text NOT NULL,
	"items" jsonb NOT NULL,
	"due_at" text,
	"created_by" text NOT NULL,
	"published_at" text,
	"closed_at" text,
	"staff_context" text,
	"replaces_request_id" uuid,
	"cancellation_reason" text,
	CONSTRAINT "application_supplement_status" CHECK ("application_supplement_requests"."status" IN ('draft','published','responded','closed','cancelled')),
	CONSTRAINT "application_supplement_version" CHECK ("application_supplement_requests"."version" > 0),
	CONSTRAINT "application_supplement_items" CHECK (jsonb_typeof("application_supplement_requests"."items") = 'array' AND jsonb_array_length("application_supplement_requests"."items") BETWEEN 1 AND 10),
	CONSTRAINT "application_supplement_publication" CHECK ("application_supplement_requests"."status" NOT IN ('published','responded','closed') OR "application_supplement_requests"."published_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "application_supplement_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"request_version" integer NOT NULL,
	"applicant_user_id" text NOT NULL,
	"answers" jsonb NOT NULL,
	"submitted_at" text NOT NULL,
	"operation_id" uuid NOT NULL,
	CONSTRAINT "application_supplement_response_version_positive" CHECK ("application_supplement_responses"."request_version" > 0),
	CONSTRAINT "application_supplement_answers" CHECK (jsonb_typeof("application_supplement_responses"."answers") = 'array' AND jsonb_array_length("application_supplement_responses"."answers") <= 10)
);
--> statement-breakpoint
ALTER TABLE "application_supplement_receipts" ADD CONSTRAINT "application_supplement_receipts_application_id_membership_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."membership_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_supplement_receipts" ADD CONSTRAINT "application_supplement_receipts_request_id_application_supplement_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."application_supplement_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_supplement_requests" ADD CONSTRAINT "application_supplement_requests_application_id_membership_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."membership_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_supplement_requests" ADD CONSTRAINT "application_supplement_requests_replaces_request_id_application_supplement_requests_id_fk" FOREIGN KEY ("replaces_request_id") REFERENCES "public"."application_supplement_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_supplement_responses" ADD CONSTRAINT "application_supplement_responses_request_id_application_supplement_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."application_supplement_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_supplement_responses" ADD CONSTRAINT "application_supplement_responses_applicant_user_id_profiles_id_fk" FOREIGN KEY ("applicant_user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "application_supplement_one_open" ON "application_supplement_requests" USING btree ("application_id") WHERE "application_supplement_requests"."status" IN ('published', 'responded');--> statement-breakpoint
CREATE UNIQUE INDEX "application_supplement_response_operation" ON "application_supplement_responses" USING btree ("applicant_user_id","operation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "application_supplement_response_version" ON "application_supplement_responses" USING btree ("request_id","request_version");