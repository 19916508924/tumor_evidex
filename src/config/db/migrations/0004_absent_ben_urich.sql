CREATE TABLE "discovery_run_document" (
	"id" text PRIMARY KEY NOT NULL,
	"discovery_run_id" text NOT NULL,
	"external_id" text NOT NULL,
	"matched_strategy_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"candidate_document_id" text,
	"error_code" text,
	"error_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_discovery_run_document_status" CHECK ("discovery_run_document"."status" in ('DISCOVERED', 'DUPLICATE', 'READY_FOR_REVIEW', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "discovery_run_query" (
	"id" text PRIMARY KEY NOT NULL,
	"discovery_run_id" text NOT NULL,
	"strategy_id" text NOT NULL,
	"strategy_version" text NOT NULL,
	"association_id" text NOT NULL,
	"query" text NOT NULL,
	"label" text NOT NULL,
	"estimated_match_count" integer DEFAULT 0 NOT NULL,
	"source_cursor" text,
	"fetched_page_count" integer DEFAULT 0 NOT NULL,
	"exhausted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_discovery_run_query_counts" CHECK ("discovery_run_query"."estimated_match_count" >= 0 and "discovery_run_query"."fetched_page_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "platform_job" (
	"id" text PRIMARY KEY NOT NULL,
	"job_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"last_error_code" text,
	"last_error_summary" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_job_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "ck_platform_job_type" CHECK ("platform_job"."job_type" in ('DISCOVERY_RUN', 'CANDIDATE_RETRY')),
	CONSTRAINT "ck_platform_job_status" CHECK ("platform_job"."status" in ('QUEUED', 'RUNNING', 'RETRY_WAIT', 'PAUSED', 'SUCCEEDED', 'DEAD_LETTER', 'CANCELLED')),
	CONSTRAINT "ck_platform_job_attempts" CHECK ("platform_job"."attempts" >= 0 and "platform_job"."max_attempts" > 0 and "platform_job"."attempts" <= "platform_job"."max_attempts")
);
--> statement-breakpoint
ALTER TABLE "discovery_run" DROP CONSTRAINT "ck_discovery_run_status";--> statement-breakpoint
ALTER TABLE "discovery_run" ADD COLUMN "scope_mode" text DEFAULT 'SCOPED' NOT NULL;--> statement-breakpoint
ALTER TABLE "discovery_run" ADD COLUMN "scope_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "discovery_run" ADD COLUMN "document_limit" integer;--> statement-breakpoint
ALTER TABLE "discovery_run" ADD COLUMN "estimated_match_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovery_run" ADD COLUMN "unique_discovered_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovery_run" ADD COLUMN "processed_document_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discovery_run" ADD COLUMN "preview_hash" text;--> statement-breakpoint
ALTER TABLE "discovery_run" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discovery_run" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "discovery_run_document" ADD CONSTRAINT "discovery_run_document_discovery_run_id_discovery_run_id_fk" FOREIGN KEY ("discovery_run_id") REFERENCES "discovery_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_run_document" ADD CONSTRAINT "discovery_run_document_candidate_document_id_candidate_document_id_fk" FOREIGN KEY ("candidate_document_id") REFERENCES "candidate_document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_run_query" ADD CONSTRAINT "discovery_run_query_discovery_run_id_discovery_run_id_fk" FOREIGN KEY ("discovery_run_id") REFERENCES "discovery_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_run_query" ADD CONSTRAINT "discovery_run_query_strategy_id_discovery_strategy_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "discovery_strategy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_run_query" ADD CONSTRAINT "discovery_run_query_association_id_therapeutic_association_id_fk" FOREIGN KEY ("association_id") REFERENCES "therapeutic_association"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_discovery_run_document" ON "discovery_run_document" USING btree ("discovery_run_id","external_id");--> statement-breakpoint
CREATE INDEX "idx_discovery_run_document_status" ON "discovery_run_document" USING btree ("discovery_run_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_discovery_run_query_strategy" ON "discovery_run_query" USING btree ("discovery_run_id","strategy_id");--> statement-breakpoint
CREATE INDEX "idx_discovery_run_query_progress" ON "discovery_run_query" USING btree ("discovery_run_id","exhausted");--> statement-breakpoint
CREATE INDEX "idx_platform_job_claim" ON "platform_job" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "idx_platform_job_resource" ON "platform_job" USING btree ("job_type","resource_id");--> statement-breakpoint
ALTER TABLE "discovery_run" ADD CONSTRAINT "ck_discovery_run_scope_mode" CHECK ("discovery_run"."scope_mode" in ('ALL_KNOWLEDGE', 'SCOPED'));--> statement-breakpoint
ALTER TABLE "discovery_run" ADD CONSTRAINT "ck_discovery_run_document_limit" CHECK ("discovery_run"."document_limit" is null or "discovery_run"."document_limit" in (50, 100));--> statement-breakpoint
ALTER TABLE "discovery_run" ADD CONSTRAINT "ck_discovery_run_progress" CHECK ("discovery_run"."estimated_match_count" >= 0 and "discovery_run"."unique_discovered_count" >= 0 and "discovery_run"."processed_document_count" >= 0 and "discovery_run"."processed_document_count" <= "discovery_run"."unique_discovered_count");--> statement-breakpoint
ALTER TABLE "discovery_run" ADD CONSTRAINT "ck_discovery_run_status" CHECK ("discovery_run"."status" in ('PENDING', 'RUNNING', 'SUCCEEDED', 'PARTIAL_SUCCESS', 'PAUSED', 'FAILED', 'CANCELLED'));
--> statement-breakpoint
UPDATE "discovery_strategy"
SET "schedule_rrule" = NULL, "next_run_at" = NULL
WHERE "schedule_rrule" IS NOT NULL OR "next_run_at" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "skill_version" (
	"id", "skill_id", "version", "name", "kind", "description", "input_schema", "output_schema", "allowed_tools", "side_effect", "timeout_ms", "max_attempts", "risk_level", "status"
) VALUES (
	'propose_evidence_level@1.0.0', 'propose_evidence_level', '1.0.0', 'Propose evidence level', 'DETERMINISTIC', 'Propose a review-only level from the new document without copying the historical association level.', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, '[]'::jsonb, 'NONE', 5000, 1, 'HIGH', 'ACTIVE'
) ON CONFLICT ("skill_id", "version") DO NOTHING;
--> statement-breakpoint
UPDATE "agent_version"
SET "allowed_skill_versions" = '["extract_evidence_claims@1.0.0","propose_evidence_level@1.0.0","validate_draft_completeness@1.0.0"]'::jsonb
WHERE "id" = 'extraction-agent@1.0.0';
--> statement-breakpoint
INSERT INTO "workflow_version" (
	"id", "workflow_id", "version", "name", "kind", "definition", "status"
) VALUES (
	'pubmed-discovery-v2', 'pubmed-discovery', '2.0.0', 'Manual scoped PubMed discovery', 'UPSTREAM', '{"trigger":"MANUAL","steps":["scope_preview","search_pubmed","deduplicate","extract_evidence_claims","propose_evidence_level","validate_draft_completeness","human_review"]}'::jsonb, 'ACTIVE'
) ON CONFLICT ("workflow_id", "version") DO NOTHING;
