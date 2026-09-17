CREATE TABLE "agent_version" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"version" text NOT NULL,
	"name" text NOT NULL,
	"goal" text NOT NULL,
	"instructions_version" text NOT NULL,
	"allowed_skill_versions" jsonb NOT NULL,
	"allowed_tools" jsonb NOT NULL,
	"model_configuration" jsonb NOT NULL,
	"token_and_cost_budget" jsonb NOT NULL,
	"stop_conditions" jsonb NOT NULL,
	"handoff_conditions" jsonb NOT NULL,
	"failure_policy" jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_agent_version_status" CHECK ("agent_version"."status" in ('DRAFT', 'ACTIVE', 'DEPRECATED'))
);
--> statement-breakpoint
CREATE TABLE "candidate_document" (
	"id" text PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"external_id" text NOT NULL,
	"doi" text,
	"document_hash" text,
	"title" text NOT NULL,
	"abstract" text NOT NULL,
	"journal" text,
	"publication_date" text,
	"source_url" text NOT NULL,
	"matched_strategy_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"duplicate_of_id" text,
	"exclusion_reason" jsonb,
	"active_workflow_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_candidate_source_type" CHECK ("candidate_document"."source_type" = 'PUBMED'),
	CONSTRAINT "ck_candidate_status" CHECK ("candidate_document"."status" in ('DISCOVERED', 'DUPLICATE', 'EXCLUDED', 'QUEUED', 'PROCESSING', 'NEEDS_HUMAN', 'READY_FOR_REVIEW', 'REJECTED', 'PUBLISHED', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "evidence_draft" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_document_id" text NOT NULL,
	"workflow_run_id" text NOT NULL,
	"association_id" text NOT NULL,
	"draft_version" integer NOT NULL,
	"status" text NOT NULL,
	"payload" jsonb NOT NULL,
	"field_provenance" jsonb NOT NULL,
	"agent_version" text NOT NULL,
	"skill_versions" jsonb NOT NULL,
	"proposed_level" text NOT NULL,
	"grading_rationale" text NOT NULL,
	"qa_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_evidence_draft_version" CHECK ("evidence_draft"."draft_version" > 0),
	CONSTRAINT "ck_evidence_draft_status" CHECK ("evidence_draft"."status" in ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "knowledge_change_set" (
	"id" text PRIMARY KEY NOT NULL,
	"review_task_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"target_version" text NOT NULL,
	"result_release_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_change_set_status" CHECK ("knowledge_change_set"."status" in ('PENDING', 'VALIDATED', 'PUBLISHED', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "knowledge_release_claim" (
	"knowledge_release_id" text NOT NULL,
	"evidence_claim_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_run" (
	"id" text PRIMARY KEY NOT NULL,
	"question_hash" text NOT NULL,
	"redacted_question" text NOT NULL,
	"locale" text NOT NULL,
	"context" jsonb NOT NULL,
	"normalized_question" jsonb,
	"status" text NOT NULL,
	"knowledge_release_id" text NOT NULL,
	"public_result" jsonb,
	"error_code" text,
	"idempotency_key" text NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_run_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "ck_question_run_status" CHECK ("question_run"."status" in ('PENDING', 'RUNNING', 'NEEDS_CLARIFICATION', 'ANSWERED', 'NO_CURATED_EVIDENCE', 'OUT_OF_SCOPE', 'SUMMARY_UNAVAILABLE', 'FAILED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "review_decision" (
	"id" text PRIMARY KEY NOT NULL,
	"review_task_id" text NOT NULL,
	"decision" text NOT NULL,
	"expected_draft_version" integer NOT NULL,
	"actor_id" text NOT NULL,
	"comment" text NOT NULL,
	"requested_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"result_release_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_decision_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "ck_review_decision_type" CHECK ("review_decision"."decision" in ('REQUEST_CHANGES', 'REJECT', 'APPROVE_AND_PUBLISH'))
);
--> statement-breakpoint
CREATE TABLE "review_task" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_document_id" text NOT NULL,
	"evidence_draft_id" text NOT NULL,
	"draft_version" integer NOT NULL,
	"status" text NOT NULL,
	"lock_version" integer DEFAULT 1 NOT NULL,
	"assigned_to" text,
	"published_release_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_review_task_lock_version" CHECK ("review_task"."lock_version" > 0),
	CONSTRAINT "ck_review_task_status" CHECK ("review_task"."status" in ('PENDING', 'IN_REVIEW', 'REQUESTED_CHANGES', 'READY_FOR_REVIEW', 'REJECTED', 'PUBLISHING', 'PUBLISHED', 'PUBLISH_FAILED'))
);
--> statement-breakpoint
CREATE TABLE "skill_version" (
	"id" text PRIMARY KEY NOT NULL,
	"skill_id" text NOT NULL,
	"version" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"input_schema" jsonb NOT NULL,
	"output_schema" jsonb NOT NULL,
	"allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"side_effect" text NOT NULL,
	"timeout_ms" integer NOT NULL,
	"max_attempts" integer NOT NULL,
	"risk_level" text NOT NULL,
	"evaluation_suite_id" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_skill_version_kind" CHECK ("skill_version"."kind" in ('DETERMINISTIC', 'MODEL', 'HYBRID')),
	CONSTRAINT "ck_skill_version_side_effect" CHECK ("skill_version"."side_effect" in ('NONE', 'STAGING_WRITE')),
	CONSTRAINT "ck_skill_version_limits" CHECK ("skill_version"."timeout_ms" > 0 and "skill_version"."max_attempts" > 0),
	CONSTRAINT "ck_skill_version_status" CHECK ("skill_version"."status" in ('DRAFT', 'ACTIVE', 'DEPRECATED'))
);
--> statement-breakpoint
CREATE TABLE "user_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"question_run_id" text NOT NULL,
	"answer_version" text NOT NULL,
	"knowledge_release_id" text NOT NULL,
	"category" text NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_user_feedback_category" CHECK ("user_feedback"."category" in ('HELPFUL', 'NOT_HELPFUL', 'IRRELEVANT_CITATION', 'MISSING_LIMITATION', 'HARD_TO_UNDERSTAND', 'OTHER'))
);
--> statement-breakpoint
CREATE TABLE "workflow_artifact" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_run_id" text NOT NULL,
	"artifact_type" text NOT NULL,
	"schema_version" text NOT NULL,
	"created_by_type" text NOT NULL,
	"created_by_id" text NOT NULL,
	"input_artifact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"sensitivity" text NOT NULL,
	"public_policy" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_workflow_artifact_creator" CHECK ("workflow_artifact"."created_by_type" in ('AGENT', 'SKILL', 'USER', 'SYSTEM')),
	CONSTRAINT "ck_workflow_artifact_sensitivity" CHECK ("workflow_artifact"."sensitivity" in ('PUBLIC', 'INTERNAL', 'SENSITIVE')),
	CONSTRAINT "ck_workflow_artifact_public_policy" CHECK ("workflow_artifact"."public_policy" in ('PUBLIC', 'SUMMARY_ONLY', 'INTERNAL_ONLY'))
);
--> statement-breakpoint
CREATE TABLE "workflow_run" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_version_id" text,
	"workflow_version" text NOT NULL,
	"kind" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text NOT NULL,
	"current_step" text,
	"locked_knowledge_release_id" text,
	"input_hash" text NOT NULL,
	"output_hash" text,
	"error_code" text,
	"total_input_tokens" integer DEFAULT 0 NOT NULL,
	"total_output_tokens" integer DEFAULT 0 NOT NULL,
	"total_cost_microusd" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_run_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "ck_workflow_run_kind" CHECK ("workflow_run"."kind" in ('UPSTREAM', 'DOWNSTREAM')),
	CONSTRAINT "ck_workflow_run_status" CHECK ("workflow_run"."status" in ('PENDING', 'RUNNING', 'SUCCEEDED', 'PARTIAL_SUCCESS', 'NEEDS_HUMAN', 'FAILED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "workflow_step_run" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_run_id" text NOT NULL,
	"step_key" text NOT NULL,
	"attempt" integer NOT NULL,
	"status" text NOT NULL,
	"skill_version_id" text,
	"agent_version_id" text,
	"input_hash" text NOT NULL,
	"output_hash" text,
	"error_code" text,
	"error_summary" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_microusd" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_workflow_step_attempt" CHECK ("workflow_step_run"."attempt" > 0),
	CONSTRAINT "ck_workflow_step_status" CHECK ("workflow_step_run"."status" in ('PENDING', 'RUNNING', 'SUCCEEDED', 'RETRY_WAIT', 'NEEDS_HUMAN', 'FAILED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "workflow_version" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"version" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"definition" jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_workflow_version_kind" CHECK ("workflow_version"."kind" in ('UPSTREAM', 'DOWNSTREAM')),
	CONSTRAINT "ck_workflow_version_status" CHECK ("workflow_version"."status" in ('DRAFT', 'ACTIVE', 'DEPRECATED'))
);
--> statement-breakpoint
ALTER TABLE "candidate_document" ADD CONSTRAINT "candidate_document_active_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("active_workflow_run_id") REFERENCES "workflow_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_draft" ADD CONSTRAINT "evidence_draft_candidate_document_id_candidate_document_id_fk" FOREIGN KEY ("candidate_document_id") REFERENCES "candidate_document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_draft" ADD CONSTRAINT "evidence_draft_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_draft" ADD CONSTRAINT "evidence_draft_association_id_therapeutic_association_id_fk" FOREIGN KEY ("association_id") REFERENCES "therapeutic_association"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_change_set" ADD CONSTRAINT "knowledge_change_set_review_task_id_review_task_id_fk" FOREIGN KEY ("review_task_id") REFERENCES "review_task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_change_set" ADD CONSTRAINT "knowledge_change_set_result_release_id_knowledge_release_id_fk" FOREIGN KEY ("result_release_id") REFERENCES "knowledge_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_release_claim" ADD CONSTRAINT "knowledge_release_claim_knowledge_release_id_knowledge_release_id_fk" FOREIGN KEY ("knowledge_release_id") REFERENCES "knowledge_release"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_release_claim" ADD CONSTRAINT "knowledge_release_claim_evidence_claim_id_evidence_claim_id_fk" FOREIGN KEY ("evidence_claim_id") REFERENCES "evidence_claim"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_run" ADD CONSTRAINT "question_run_knowledge_release_id_knowledge_release_id_fk" FOREIGN KEY ("knowledge_release_id") REFERENCES "knowledge_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decision" ADD CONSTRAINT "review_decision_review_task_id_review_task_id_fk" FOREIGN KEY ("review_task_id") REFERENCES "review_task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decision" ADD CONSTRAINT "review_decision_result_release_id_knowledge_release_id_fk" FOREIGN KEY ("result_release_id") REFERENCES "knowledge_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_task" ADD CONSTRAINT "review_task_candidate_document_id_candidate_document_id_fk" FOREIGN KEY ("candidate_document_id") REFERENCES "candidate_document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_task" ADD CONSTRAINT "review_task_evidence_draft_id_evidence_draft_id_fk" FOREIGN KEY ("evidence_draft_id") REFERENCES "evidence_draft"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_task" ADD CONSTRAINT "review_task_published_release_id_knowledge_release_id_fk" FOREIGN KEY ("published_release_id") REFERENCES "knowledge_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_question_run_id_question_run_id_fk" FOREIGN KEY ("question_run_id") REFERENCES "question_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_knowledge_release_id_knowledge_release_id_fk" FOREIGN KEY ("knowledge_release_id") REFERENCES "knowledge_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_artifact" ADD CONSTRAINT "workflow_artifact_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_workflow_version_id_workflow_version_id_fk" FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_locked_knowledge_release_id_knowledge_release_id_fk" FOREIGN KEY ("locked_knowledge_release_id") REFERENCES "knowledge_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_run" ADD CONSTRAINT "workflow_step_run_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_run" ADD CONSTRAINT "workflow_step_run_skill_version_id_skill_version_id_fk" FOREIGN KEY ("skill_version_id") REFERENCES "skill_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_run" ADD CONSTRAINT "workflow_step_run_agent_version_id_agent_version_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "agent_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_agent_version_identity" ON "agent_version" USING btree ("agent_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_candidate_source_identity" ON "candidate_document" USING btree ("source_type","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_candidate_doi" ON "candidate_document" USING btree ("doi") WHERE "candidate_document"."doi" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_candidate_document_hash" ON "candidate_document" USING btree ("document_hash") WHERE "candidate_document"."document_hash" is not null;--> statement-breakpoint
CREATE INDEX "idx_candidate_status" ON "candidate_document" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_evidence_draft_version" ON "evidence_draft" USING btree ("candidate_document_id","draft_version");--> statement-breakpoint
CREATE INDEX "idx_evidence_draft_workflow" ON "evidence_draft" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_change_set_review_hash" ON "knowledge_change_set" USING btree ("review_task_id","content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_knowledge_release_claim" ON "knowledge_release_claim" USING btree ("knowledge_release_id","evidence_claim_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_release_claim_release" ON "knowledge_release_claim" USING btree ("knowledge_release_id");--> statement-breakpoint
CREATE INDEX "idx_question_run_status" ON "question_run" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_question_run_release_hash" ON "question_run" USING btree ("knowledge_release_id","question_hash");--> statement-breakpoint
CREATE INDEX "idx_review_decision_task" ON "review_decision" USING btree ("review_task_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_review_task_draft" ON "review_task" USING btree ("evidence_draft_id");--> statement-breakpoint
CREATE INDEX "idx_review_task_status" ON "review_task" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_skill_version_identity" ON "skill_version" USING btree ("skill_id","version");--> statement-breakpoint
CREATE INDEX "idx_user_feedback_question" ON "user_feedback" USING btree ("question_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_workflow_artifact_hash" ON "workflow_artifact" USING btree ("workflow_run_id","artifact_type","content_hash");--> statement-breakpoint
CREATE INDEX "idx_workflow_artifact_run" ON "workflow_artifact" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_run_status" ON "workflow_run" USING btree ("kind","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_workflow_step_attempt" ON "workflow_step_run" USING btree ("workflow_run_id","step_key","attempt");--> statement-breakpoint
CREATE INDEX "idx_workflow_step_status" ON "workflow_step_run" USING btree ("workflow_run_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_workflow_version_identity" ON "workflow_version" USING btree ("workflow_id","version");--> statement-breakpoint
INSERT INTO "knowledge_release_claim" (
	"knowledge_release_id",
	"evidence_claim_id"
)
SELECT
	kra."knowledge_release_id",
	ec."id"
FROM "knowledge_release_association" kra
INNER JOIN "evidence_claim" ec
	ON ec."association_id" = kra."therapeutic_association_id"
WHERE ec."review_status" = 'APPROVED'
ON CONFLICT DO NOTHING;--> statement-breakpoint
CREATE TRIGGER evidex_release_claim_immutable
BEFORE INSERT OR UPDATE OR DELETE ON "knowledge_release_claim"
FOR EACH ROW EXECUTE FUNCTION evidex_reject_published_membership_change();
