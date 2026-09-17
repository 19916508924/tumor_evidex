ALTER TABLE "candidate_document" ADD COLUMN "pmcid" text;--> statement-breakpoint
ALTER TABLE "candidate_document" ADD COLUMN "source_scope" text DEFAULT 'ABSTRACT' NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_document" ADD COLUMN "source_license" text;--> statement-breakpoint
ALTER TABLE "candidate_document" ADD COLUMN "full_text" text;--> statement-breakpoint
ALTER TABLE "candidate_document" ADD CONSTRAINT "ck_candidate_source_scope" CHECK ("candidate_document"."source_scope" in ('ABSTRACT', 'PMC_FULL_TEXT'));