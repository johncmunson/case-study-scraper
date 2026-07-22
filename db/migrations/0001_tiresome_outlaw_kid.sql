CREATE TYPE "public"."scrape_job_status" AS ENUM('pending', 'in_progress', 'complete', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."scrape_run_error_code" AS ENUM('workflow_dispatch_failed', 'mapping_failed', 'filtering_failed', 'job_creation_failed', 'scrape_failed', 'missing_required_fields', 'unexpected_workflow_failure');--> statement-breakpoint
CREATE TYPE "public"."scrape_run_stage" AS ENUM('mapping', 'filtering', 'scraping');--> statement-breakpoint
CREATE TYPE "public"."scrape_run_stage_status" AS ENUM('pending', 'in_progress', 'complete', 'failed', 'cancelled', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."scrape_run_status" AS ENUM('pending', 'in_progress', 'complete', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "scrape_jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scrape_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"scrape_run_id" integer NOT NULL,
	"url" text NOT NULL,
	"status" "scrape_job_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"result" jsonb,
	"missing_required_field_keys" text[],
	"failure_code" "scrape_run_error_code",
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "scrape_jobs_complete_result_consistency" CHECK ((
        ("scrape_jobs"."status" = 'complete' AND "scrape_jobs"."result" IS NOT NULL AND JSONB_TYPEOF("scrape_jobs"."result") = 'object')
        OR
        ("scrape_jobs"."status" <> 'complete' AND "scrape_jobs"."result" IS NULL)
      )),
	CONSTRAINT "scrape_jobs_attempt_count_nonnegative" CHECK ("scrape_jobs"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "scrape_run_fields" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scrape_run_fields_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"scrape_run_id" integer NOT NULL,
	"position" integer NOT NULL,
	"label" varchar(30) NOT NULL,
	"key" varchar(30) NOT NULL,
	"description" varchar(100) NOT NULL,
	"required" boolean NOT NULL,
	"primary_identifier" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scrape_run_fields_primary_requires_required" CHECK (NOT "scrape_run_fields"."primary_identifier" OR "scrape_run_fields"."required"),
	CONSTRAINT "scrape_run_fields_position_nonnegative" CHECK ("scrape_run_fields"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "scrape_run_stages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scrape_run_stages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"scrape_run_id" integer NOT NULL,
	"stage" "scrape_run_stage" NOT NULL,
	"status" "scrape_run_stage_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"failure_code" "scrape_run_error_code",
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "scrape_run_stages_attempt_count_nonnegative" CHECK ("scrape_run_stages"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scrape_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"user_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"target_url" text NOT NULL,
	"example_urls" text[] NOT NULL,
	"filtering_model" text NOT NULL,
	"status" "scrape_run_status" DEFAULT 'pending' NOT NULL,
	"workflow_run_id" text,
	"cancellation_requested_at" timestamp with time zone,
	"failure_code" "scrape_run_error_code",
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "scrape_runs_name_not_blank" CHECK (BTRIM("scrape_runs"."name") <> ''),
	CONSTRAINT "scrape_runs_example_url_count" CHECK (CARDINALITY("scrape_runs"."example_urls") BETWEEN 2 AND 5),
	CONSTRAINT "scrape_runs_example_urls_have_no_nulls" CHECK (ARRAY_POSITION("scrape_runs"."example_urls", NULL) IS NULL),
	CONSTRAINT "scrape_runs_filtering_model_not_blank" CHECK (BTRIM("scrape_runs"."filtering_model") <> '')
);
--> statement-breakpoint
ALTER TABLE "scrape_jobs" ADD CONSTRAINT "scrape_jobs_scrape_run_id_scrape_runs_id_fk" FOREIGN KEY ("scrape_run_id") REFERENCES "public"."scrape_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_run_fields" ADD CONSTRAINT "scrape_run_fields_scrape_run_id_scrape_runs_id_fk" FOREIGN KEY ("scrape_run_id") REFERENCES "public"."scrape_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_run_stages" ADD CONSTRAINT "scrape_run_stages_scrape_run_id_scrape_runs_id_fk" FOREIGN KEY ("scrape_run_id") REFERENCES "public"."scrape_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scrape_jobs_run_url_unique_idx" ON "scrape_jobs" USING btree ("scrape_run_id","url");--> statement-breakpoint
CREATE INDEX "scrape_jobs_run_status_idx" ON "scrape_jobs" USING btree ("scrape_run_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "scrape_run_fields_run_position_unique_idx" ON "scrape_run_fields" USING btree ("scrape_run_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "scrape_run_fields_run_key_unique_idx" ON "scrape_run_fields" USING btree ("scrape_run_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "scrape_run_fields_one_primary_per_run_idx" ON "scrape_run_fields" USING btree ("scrape_run_id") WHERE "scrape_run_fields"."primary_identifier" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "scrape_run_stages_run_stage_unique_idx" ON "scrape_run_stages" USING btree ("scrape_run_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "scrape_runs_one_active_per_user_idx" ON "scrape_runs" USING btree ("user_id") WHERE "scrape_runs"."status" IN ('pending', 'in_progress');--> statement-breakpoint
CREATE INDEX "scrape_runs_user_created_at_idx" ON "scrape_runs" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "scrape_runs_workflow_run_id_unique_idx" ON "scrape_runs" USING btree ("workflow_run_id") WHERE "scrape_runs"."workflow_run_id" IS NOT NULL;