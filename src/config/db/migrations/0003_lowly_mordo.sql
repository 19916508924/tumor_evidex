CREATE TABLE "discovery_run" (
	"id" text PRIMARY KEY NOT NULL,
	"strategy_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"trigger_type" text NOT NULL,
	"triggered_by" text NOT NULL,
	"workflow_version" text NOT NULL,
	"window_from" timestamp with time zone NOT NULL,
	"window_to" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"counts" jsonb DEFAULT '{"discovered":0,"duplicate":0,"excluded":0,"processing":0,"readyForReview":0,"published":0,"failed":0}'::jsonb NOT NULL,
	"source_cursor" text,
	"error_code" text,
	"error_summary" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_run_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "ck_discovery_run_trigger" CHECK ("discovery_run"."trigger_type" in ('MANUAL', 'SCHEDULED')),
	CONSTRAINT "ck_discovery_run_status" CHECK ("discovery_run"."status" in ('PENDING', 'RUNNING', 'SUCCEEDED', 'PARTIAL_SUCCESS', 'FAILED', 'CANCELLED')),
	CONSTRAINT "ck_discovery_run_window" CHECK ("discovery_run"."window_from" <= "discovery_run"."window_to")
);
--> statement-breakpoint
CREATE TABLE "discovery_strategy" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"query" text NOT NULL,
	"association_id" text NOT NULL,
	"status" text NOT NULL,
	"schedule_timezone" text DEFAULT 'Asia/Shanghai' NOT NULL,
	"schedule_rrule" text,
	"overlap_days" integer DEFAULT 7 NOT NULL,
	"max_results" integer DEFAULT 100 NOT NULL,
	"last_successful_cutoff_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_discovery_strategy_status" CHECK ("discovery_strategy"."status" in ('ACTIVE', 'PAUSED')),
	CONSTRAINT "ck_discovery_strategy_limits" CHECK ("discovery_strategy"."overlap_days" >= 0 and "discovery_strategy"."max_results" > 0 and "discovery_strategy"."max_results" <= 10000)
);
--> statement-breakpoint
CREATE TABLE "platform_audit_event" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence_draft" ADD COLUMN "parent_draft_id" text;--> statement-breakpoint
ALTER TABLE "evidence_draft" ADD COLUMN "edited_by" text;--> statement-breakpoint
ALTER TABLE "evidence_draft" ADD COLUMN "edit_reason" text;--> statement-breakpoint
ALTER TABLE "user_feedback" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
UPDATE "user_feedback" SET "idempotency_key" = 'legacy-feedback:' || "id" WHERE "idempotency_key" IS NULL;--> statement-breakpoint
ALTER TABLE "user_feedback" ALTER COLUMN "idempotency_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "discovery_run" ADD CONSTRAINT "discovery_run_strategy_id_discovery_strategy_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "discovery_strategy"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_strategy" ADD CONSTRAINT "discovery_strategy_association_id_therapeutic_association_id_fk" FOREIGN KEY ("association_id") REFERENCES "therapeutic_association"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_discovery_run_strategy" ON "discovery_run" USING btree ("strategy_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_discovery_run_status" ON "discovery_run" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_discovery_strategy_version" ON "discovery_strategy" USING btree ("id","version");--> statement-breakpoint
CREATE INDEX "idx_discovery_strategy_status" ON "discovery_strategy" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE INDEX "idx_platform_audit_resource" ON "platform_audit_event" USING btree ("resource_type","resource_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_platform_audit_actor" ON "platform_audit_event" USING btree ("actor_id","created_at");--> statement-breakpoint
ALTER TABLE "evidence_draft" ADD CONSTRAINT "evidence_draft_parent_draft_id_evidence_draft_id_fk" FOREIGN KEY ("parent_draft_id") REFERENCES "evidence_draft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_idempotency_key_unique" UNIQUE("idempotency_key");--> statement-breakpoint
INSERT INTO "skill_version" (
	"id", "skill_id", "version", "name", "kind", "description", "input_schema", "output_schema", "allowed_tools", "side_effect", "timeout_ms", "max_attempts", "risk_level", "status"
) VALUES
	('normalize_query@1.0.0', 'normalize_query', '1.0.0', 'Normalize evidence query', 'DETERMINISTIC', 'Validate and normalize supported disease and variant input.', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, '[]'::jsonb, 'NONE', 5000, 1, 'LOW', 'ACTIVE'),
	('build_evidence_pack@1.0.0', 'build_evidence_pack', '1.0.0', 'Build evidence pack', 'DETERMINISTIC', 'Build a release-locked evidence pack.', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, '["knowledge.read"]'::jsonb, 'NONE', 10000, 2, 'MEDIUM', 'ACTIVE'),
	('compose_evidence_answer@1.0.0', 'compose_evidence_answer', '1.0.0', 'Compose evidence answer', 'MODEL', 'Generate a structured answer constrained by an evidence pack.', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, '[]'::jsonb, 'NONE', 120000, 2, 'HIGH', 'ACTIVE'),
	('validate_answer@1.0.0', 'validate_answer', '1.0.0', 'Validate answer', 'DETERMINISTIC', 'Validate answer schema, citations and release membership.', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, '[]'::jsonb, 'NONE', 10000, 1, 'HIGH', 'ACTIVE'),
	('extract_evidence_claims@1.0.0', 'extract_evidence_claims', '1.0.0', 'Extract evidence claims', 'MODEL', 'Extract reviewable structured evidence from an allowed source.', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, '[]'::jsonb, 'STAGING_WRITE', 120000, 2, 'HIGH', 'ACTIVE'),
	('validate_draft_completeness@1.0.0', 'validate_draft_completeness', '1.0.0', 'Validate draft completeness', 'DETERMINISTIC', 'Validate passages, claims, provenance and QA readiness.', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, '[]'::jsonb, 'STAGING_WRITE', 10000, 1, 'HIGH', 'ACTIVE')
ON CONFLICT ("skill_id", "version") DO NOTHING;--> statement-breakpoint
INSERT INTO "agent_version" (
	"id", "agent_id", "version", "name", "goal", "instructions_version", "allowed_skill_versions", "allowed_tools", "model_configuration", "token_and_cost_budget", "stop_conditions", "handoff_conditions", "failure_policy", "status"
) VALUES
	('extraction-agent@1.0.0', 'extraction-agent', '1.0.0', 'Evidence Extraction Agent', 'Create a reviewable evidence draft without publishing.', 'evidex-extraction-v1', '["extract_evidence_claims@1.0.0","validate_draft_completeness@1.0.0"]'::jsonb, '[]'::jsonb, '{"provider":"evolink","model":"gpt-5.6-terra"}'::jsonb, '{"maxOutputTokens":6000}'::jsonb, '["draft_ready","blocking_qa"]'::jsonb, '["human_review"]'::jsonb, '{"maxAttempts":2,"onFailure":"NEEDS_HUMAN"}'::jsonb, 'ACTIVE'),
	('answer-agent@1.0.0', 'answer-agent', '1.0.0', 'Evidence Answer Agent', 'Answer from one release-locked evidence pack.', 'evidex-answer-v1', '["normalize_query@1.0.0","build_evidence_pack@1.0.0","compose_evidence_answer@1.0.0","validate_answer@1.0.0"]'::jsonb, '["knowledge.read"]'::jsonb, '{"provider":"evolink","model":"gpt-5.6-terra"}'::jsonb, '{"maxOutputTokens":6000}'::jsonb, '["answer_valid","safe_fallback"]'::jsonb, '[]'::jsonb, '{"maxAttempts":2,"onFailure":"SUMMARY_UNAVAILABLE"}'::jsonb, 'ACTIVE')
ON CONFLICT ("agent_id", "version") DO NOTHING;--> statement-breakpoint
INSERT INTO "workflow_version" (
	"id", "workflow_id", "version", "name", "kind", "definition", "status"
) VALUES
	('single-pubmed-v1', 'single-pubmed', '1.0.0', 'Single PubMed assisted ingestion', 'UPSTREAM', '{"steps":["fetch_pubmed","extract_evidence_claims","validate_draft_completeness","human_review","publish"]}'::jsonb, 'ACTIVE'),
	('pubmed-discovery-v1', 'pubmed-discovery', '1.0.0', 'PubMed incremental discovery', 'UPSTREAM', '{"steps":["search_pubmed","deduplicate","ingest_candidates"]}'::jsonb, 'ACTIVE'),
	('evidence-question-v1', 'evidence-question', '1.0.0', 'Release-locked evidence question', 'DOWNSTREAM', '{"steps":["understand","retrieve","compose","validate"]}'::jsonb, 'ACTIVE')
ON CONFLICT ("workflow_id", "version") DO NOTHING;--> statement-breakpoint
INSERT INTO "discovery_strategy" (
	"id", "name", "version", "query", "association_id", "status", "schedule_timezone", "schedule_rrule", "overlap_days", "max_results", "last_successful_cutoff_at", "next_run_at"
)
SELECT DISTINCT ON (ta."disease_id", ta."variant_id")
	'discovery_' || ta."disease_id" || '_' || ta."variant_id",
	d."canonical_name" || ' · ' || g."symbol" || ' ' || COALESCE(v."hgvsp", v."canonical_key"),
	'1.0.0',
	format('("%s"[Title/Abstract]) AND ("%s"[Title/Abstract]) AND (cancer[Title/Abstract] OR carcinoma[Title/Abstract] OR tumor[Title/Abstract])', g."symbol", COALESCE(v."hgvsp", v."canonical_key")),
	ta."id",
	'ACTIVE',
	'Asia/Shanghai',
	'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0',
	7,
	100,
	(SELECT MAX(kr."literature_cutoff_at") FROM "knowledge_release" kr WHERE kr."status" = 'PUBLISHED'),
	now() + interval '7 days'
FROM "therapeutic_association" ta
JOIN "disease" d ON d."id" = ta."disease_id"
JOIN "variant" v ON v."id" = ta."variant_id"
JOIN "gene" g ON g."id" = v."gene_id"
WHERE ta."review_status" = 'APPROVED'
ORDER BY ta."disease_id", ta."variant_id", ta."id"
ON CONFLICT ("id") DO NOTHING;
