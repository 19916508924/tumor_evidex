ALTER TABLE "candidate_document" ADD COLUMN "source_license_policy" jsonb;--> statement-breakpoint
INSERT INTO "skill_version" (
	"id", "skill_id", "version", "name", "kind", "description", "input_schema", "output_schema", "allowed_tools", "side_effect", "timeout_ms", "max_attempts", "risk_level", "status"
) VALUES
	('screen_evidence_eligibility@2.0.0', 'screen_evidence_eligibility', '2.0.0', 'Screen evidence eligibility', 'DETERMINISTIC', 'Require exact variant mentions for variant-scoped targets.', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, '[]'::jsonb, 'STAGING_WRITE', 5000, 1, 'HIGH', 'ACTIVE'),
	('recognize_evidence_entities@2.0.0', 'recognize_evidence_entities', '2.0.0', 'Recognize evidence entities', 'DETERMINISTIC', 'Collect source-grounded entity mentions including reviewed target terms.', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, '[]'::jsonb, 'NONE', 5000, 1, 'HIGH', 'ACTIVE'),
	('normalize_evidence_entities@2.0.0', 'normalize_evidence_entities', '2.0.0', 'Normalize evidence entities', 'DETERMINISTIC', 'Propose catalog candidates and association binding only from literal target matches.', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, '[]'::jsonb, 'NONE', 5000, 1, 'HIGH', 'ACTIVE'),
	('extract_treatment_relationship@2.0.0', 'extract_treatment_relationship', '2.0.0', 'Extract treatment relationship', 'DETERMINISTIC', 'Create a review-only relationship from the validated association proposal.', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, '[]'::jsonb, 'NONE', 5000, 1, 'HIGH', 'ACTIVE')
ON CONFLICT ("skill_id", "version") DO NOTHING;--> statement-breakpoint
INSERT INTO "agent_version" (
	"id", "agent_id", "version", "name", "goal", "instructions_version", "allowed_skill_versions", "allowed_tools", "model_configuration", "token_and_cost_budget", "stop_conditions", "handoff_conditions", "failure_policy", "status"
) VALUES
	('eligibility-agent@2.0.0', 'eligibility-agent', '2.0.0', 'Evidence Eligibility Agent', 'Prevent disease, gene, or exact-variant misattribution before extraction.', 'evidex-eligibility-v2', '["screen_evidence_eligibility@2.0.0"]'::jsonb, '[]'::jsonb, '{"mode":"deterministic"}'::jsonb, '{"maxOutputTokens":0}'::jsonb, '["include","exclude","needs_human"]'::jsonb, '["human_review"]'::jsonb, '{"maxAttempts":1,"onFailure":"NEEDS_HUMAN"}'::jsonb, 'ACTIVE'),
	('entity-recognition-agent@2.0.0', 'entity-recognition-agent', '2.0.0', 'Entity Recognition Agent', 'Recognize source-grounded entities and exact reviewed target mentions.', 'evidex-entity-recognition-v2', '["recognize_evidence_entities@2.0.0"]'::jsonb, '[]'::jsonb, '{"mode":"deterministic"}'::jsonb, '{"maxOutputTokens":0}'::jsonb, '["entities_recognized"]'::jsonb, '["human_review"]'::jsonb, '{"maxAttempts":1,"onFailure":"NEEDS_HUMAN"}'::jsonb, 'ACTIVE'),
	('normalization-agent@2.0.0', 'normalization-agent', '2.0.0', 'Evidence Normalization Agent', 'Propose catalog identifiers with literal-match basis and unresolved fields.', 'evidex-normalization-v2', '["normalize_evidence_entities@2.0.0"]'::jsonb, '[]'::jsonb, '{"mode":"deterministic"}'::jsonb, '{"maxOutputTokens":0}'::jsonb, '["entities_normalized","needs_human"]'::jsonb, '["human_review"]'::jsonb, '{"maxAttempts":1,"onFailure":"NEEDS_HUMAN"}'::jsonb, 'ACTIVE'),
	('relationship-agent@2.0.0', 'relationship-agent', '2.0.0', 'Relationship Extraction Agent', 'Build review-only relationships from validated association proposals.', 'evidex-relationship-v2', '["extract_treatment_relationship@2.0.0"]'::jsonb, '[]'::jsonb, '{"mode":"deterministic"}'::jsonb, '{"maxOutputTokens":0}'::jsonb, '["relationship_proposed"]'::jsonb, '["human_review"]'::jsonb, '{"maxAttempts":1,"onFailure":"NEEDS_HUMAN"}'::jsonb, 'ACTIVE')
ON CONFLICT ("agent_id", "version") DO NOTHING;--> statement-breakpoint
INSERT INTO "workflow_version" (
	"id", "workflow_id", "version", "name", "kind", "definition", "status"
) VALUES (
	'single-pubmed-v3', 'single-pubmed', '3.0.0', 'Variant-safe governed PubMed ingestion', 'UPSTREAM', '{"steps":["fetch_pubmed_metadata","deduplicate_source_document","screen_evidence_eligibility","extract_evidence_claims","recognize_evidence_entities","normalize_evidence_entities","extract_treatment_relationship","propose_evidence_level","validate_draft_completeness","human_review"]}'::jsonb, 'ACTIVE'
) ON CONFLICT ("workflow_id", "version") DO NOTHING;--> statement-breakpoint
UPDATE "workflow_version" SET "status" = 'DEPRECATED' WHERE "workflow_id" = 'single-pubmed' AND "version" <> '3.0.0';
