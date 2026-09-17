ALTER TABLE "question_run" ADD COLUMN "workflow_run_id" text;--> statement-breakpoint
ALTER TABLE "question_run" ADD CONSTRAINT "question_run_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "workflow_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "skill_version" (
	"id", "skill_id", "version", "name", "kind", "description", "input_schema", "output_schema", "allowed_tools", "side_effect", "timeout_ms", "max_attempts", "risk_level", "status"
) VALUES (
	'understand_question@1.0.0', 'understand_question', '1.0.0', 'Understand evidence question', 'DETERMINISTIC', 'Resolve intent and clinical entities against one locked published catalog.', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, '["knowledge.read"]'::jsonb, 'NONE', 5000, 1, 'HIGH', 'ACTIVE'
), (
	'build_retrieval_plan@1.0.0', 'build_retrieval_plan', '1.0.0', 'Build retrieval plan', 'DETERMINISTIC', 'Build a deterministic release-locked evidence retrieval plan.', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, '[]'::jsonb, 'NONE', 5000, 1, 'HIGH', 'ACTIVE'
), (
	'analyze_evidence@1.0.0', 'analyze_evidence', '1.0.0', 'Analyze evidence pack', 'DETERMINISTIC', 'Summarize direction, maturity and limitations without changing approved evidence.', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, '[]'::jsonb, 'NONE', 10000, 1, 'HIGH', 'ACTIVE'
) ON CONFLICT ("skill_id", "version") DO NOTHING;--> statement-breakpoint
UPDATE "agent_version"
SET "allowed_skill_versions" = '["understand_question@1.0.0","normalize_query@1.0.0","build_retrieval_plan@1.0.0","build_evidence_pack@1.0.0","analyze_evidence@1.0.0","compose_evidence_answer@1.0.0","validate_answer@1.0.0"]'::jsonb
WHERE "id" = 'answer-agent@1.0.0';--> statement-breakpoint
UPDATE "workflow_version"
SET "definition" = '{"steps":["understand_question","normalize_query","build_retrieval_plan","build_evidence_pack","analyze_evidence","compose_evidence_answer","validate_answer"]}'::jsonb
WHERE "id" = 'evidence-question-v1';
