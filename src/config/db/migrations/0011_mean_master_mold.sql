ALTER TABLE "knowledge_release_association" ADD COLUMN "approved_level" text;--> statement-breakpoint
ALTER TABLE "knowledge_release_association" ADD COLUMN "grading_rationale" text;--> statement-breakpoint
ALTER TABLE "knowledge_release_association" DISABLE TRIGGER evidex_release_association_immutable;--> statement-breakpoint
UPDATE "knowledge_release_association" kra
SET
	"approved_level" = COALESCE(ta."approved_level", ta."proposed_level", 'UNRATED'),
	"grading_rationale" = ta."grading_rationale"
FROM "therapeutic_association" ta
WHERE ta."id" = kra."therapeutic_association_id";--> statement-breakpoint
ALTER TABLE "knowledge_release_association" ENABLE TRIGGER evidex_release_association_immutable;--> statement-breakpoint
ALTER TABLE "knowledge_release_association" ALTER COLUMN "approved_level" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_release_association" ALTER COLUMN "grading_rationale" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_release_association" ADD CONSTRAINT "ck_knowledge_release_association_approved_level" CHECK ("knowledge_release_association"."approved_level" in ('1', '2', '3A', '3B', '4', 'R1', 'R2', 'UNRATED'));
