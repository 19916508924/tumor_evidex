CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_task" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"media_type" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt" text NOT NULL,
	"options" text,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp,
	"task_id" text,
	"task_info" text,
	"task_result" text,
	"cost_credits" integer DEFAULT 0 NOT NULL,
	"scene" text DEFAULT '' NOT NULL,
	"credit_id" text
);
--> statement-breakpoint
CREATE TABLE "apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "chat" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"model" text NOT NULL,
	"provider" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"parts" text NOT NULL,
	"metadata" text,
	"content" text
);
--> statement-breakpoint
CREATE TABLE "chat_message" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"role" text NOT NULL,
	"parts" text NOT NULL,
	"metadata" text,
	"model" text NOT NULL,
	"provider" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config" (
	"name" text NOT NULL,
	"value" text,
	CONSTRAINT "config_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "credit" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text,
	"order_no" text,
	"subscription_no" text,
	"transaction_no" text NOT NULL,
	"transaction_type" text NOT NULL,
	"transaction_scene" text,
	"credits" integer NOT NULL,
	"remaining_credits" integer DEFAULT 0 NOT NULL,
	"description" text,
	"expires_at" timestamp,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp,
	"consumed_detail" text,
	"metadata" text,
	CONSTRAINT "credit_transaction_no_unique" UNIQUE("transaction_no")
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" text PRIMARY KEY NOT NULL,
	"order_no" text NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text,
	"status" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"product_id" text,
	"payment_type" text,
	"payment_interval" text,
	"payment_provider" text NOT NULL,
	"payment_session_id" text,
	"checkout_info" text NOT NULL,
	"checkout_result" text,
	"payment_result" text,
	"discount_code" text,
	"discount_amount" integer,
	"discount_currency" text,
	"payment_email" text,
	"payment_amount" integer,
	"payment_currency" text,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp,
	"description" text,
	"product_name" text,
	"subscription_id" text,
	"subscription_result" text,
	"checkout_url" text,
	"callback_url" text,
	"credits_amount" integer,
	"credits_valid_days" integer,
	"plan_name" text,
	"payment_product_id" text,
	"invoice_id" text,
	"invoice_url" text,
	"subscription_no" text,
	"transaction_id" text,
	"payment_user_name" text,
	"payment_user_id" text,
	CONSTRAINT "order_order_no_unique" UNIQUE("order_no")
);
--> statement-breakpoint
CREATE TABLE "permission" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"resource" text NOT NULL,
	"action" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "permission_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "post" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"parent_id" text,
	"slug" text NOT NULL,
	"type" text NOT NULL,
	"title" text,
	"description" text,
	"image" text,
	"content" text,
	"categories" text,
	"tags" text,
	"author_name" text,
	"author_image" text,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "post_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "role_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "role_permission" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"permission_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_no" text NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text,
	"status" text NOT NULL,
	"payment_provider" text NOT NULL,
	"subscription_id" text NOT NULL,
	"subscription_result" text,
	"product_id" text,
	"description" text,
	"amount" integer,
	"currency" text,
	"interval" text,
	"interval_count" integer,
	"trial_period_days" integer,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp,
	"plan_name" text,
	"billing_url" text,
	"product_name" text,
	"credits_amount" integer,
	"credits_valid_days" integer,
	"payment_product_id" text,
	"payment_user_id" text,
	"canceled_at" timestamp,
	"canceled_end_at" timestamp,
	"canceled_reason" text,
	"canceled_reason_type" text,
	CONSTRAINT "subscription_subscription_no_unique" UNIQUE("subscription_no")
);
--> statement-breakpoint
CREATE TABLE "taxonomy" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"parent_id" text,
	"slug" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"image" text,
	"icon" text,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"deleted_at" timestamp,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "taxonomy_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"utm_source" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"locale" text DEFAULT '' NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_role" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "answer_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"request_fingerprint" text NOT NULL,
	"knowledge_release_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"locale" text NOT NULL,
	"evidence_ids" jsonb NOT NULL,
	"association_ids" jsonb NOT NULL,
	"regulatory_approval_ids" jsonb NOT NULL,
	"structured_output" jsonb NOT NULL,
	"validation_status" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_answer_snapshot_validation" CHECK ("answer_snapshot"."validation_status" in ('VALID', 'INVALID'))
);
--> statement-breakpoint
CREATE TABLE "disease" (
	"id" text PRIMARY KEY NOT NULL,
	"canonical_name" text NOT NULL,
	"display_name_zh" text NOT NULL,
	"display_name_en" text NOT NULL,
	"ontology_system" text,
	"ontology_code" text,
	"lineage" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disease_canonical_name_unique" UNIQUE("canonical_name"),
	CONSTRAINT "ck_disease_lineage" CHECK ("disease"."lineage" in ('SOLID', 'HEMATOLOGIC', 'UNKNOWN')),
	CONSTRAINT "ck_disease_status" CHECK ("disease"."status" in ('ACTIVE', 'INACTIVE', 'DEPRECATED'))
);
--> statement-breakpoint
CREATE TABLE "drug" (
	"id" text PRIMARY KEY NOT NULL,
	"generic_name" text NOT NULL,
	"display_name_zh" text NOT NULL,
	"display_name_en" text NOT NULL,
	"brand_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drug_generic_name_unique" UNIQUE("generic_name"),
	CONSTRAINT "ck_drug_status" CHECK ("drug"."status" in ('ACTIVE', 'INACTIVE', 'DEPRECATED'))
);
--> statement-breakpoint
CREATE TABLE "evidence_claim" (
	"id" text PRIMARY KEY NOT NULL,
	"association_id" text NOT NULL,
	"claim_type" text NOT NULL,
	"evidence_maturity" text NOT NULL,
	"study_type" text NOT NULL,
	"study_name" text,
	"population_summary" text NOT NULL,
	"sample_size" integer,
	"disease_stage" text,
	"treatment_line" text,
	"prior_therapy" text,
	"intervention" text NOT NULL,
	"comparator" text,
	"endpoint" text NOT NULL,
	"effect_value" jsonb,
	"conclusion" text NOT NULL,
	"limitations" text NOT NULL,
	"cohort_fingerprint" text,
	"review_status" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_evidence_claim_type" CHECK ("evidence_claim"."claim_type" in ('EFFICACY', 'RESISTANCE', 'SAFETY_CONTEXT', 'OTHER')),
	CONSTRAINT "ck_evidence_claim_maturity" CHECK ("evidence_claim"."evidence_maturity" in ('REGULATORY', 'GUIDELINE', 'MATURE_CLINICAL', 'LIMITED_CLINICAL', 'PRECLINICAL', 'INSUFFICIENT')),
	CONSTRAINT "ck_evidence_claim_review" CHECK ("evidence_claim"."review_status" in ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "evidence_claim_passage" (
	"evidence_claim_id" text NOT NULL,
	"source_passage_id" text NOT NULL,
	"support_role" text NOT NULL,
	CONSTRAINT "evidence_claim_passage_evidence_claim_id_source_passage_id_pk" PRIMARY KEY("evidence_claim_id","source_passage_id"),
	CONSTRAINT "ck_evidence_claim_passage_role" CHECK ("evidence_claim_passage"."support_role" in ('PRIMARY', 'CONTEXT', 'LIMITATION'))
);
--> statement-breakpoint
CREATE TABLE "gene" (
	"id" text PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"hgnc_id" text,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gene_symbol_unique" UNIQUE("symbol"),
	CONSTRAINT "gene_hgnc_id_unique" UNIQUE("hgnc_id"),
	CONSTRAINT "ck_gene_symbol_upper" CHECK ("gene"."symbol" = upper("gene"."symbol")),
	CONSTRAINT "ck_gene_status" CHECK ("gene"."status" in ('ACTIVE', 'INACTIVE', 'DEPRECATED'))
);
--> statement-breakpoint
CREATE TABLE "knowledge_release" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"status" text NOT NULL,
	"literature_cutoff_at" timestamp with time zone NOT NULL,
	"regulatory_cutoff_at" timestamp with time zone NOT NULL,
	"grading_rule_version" text NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_release_version_unique" UNIQUE("version"),
	CONSTRAINT "ck_knowledge_release_status" CHECK ("knowledge_release"."status" in ('DRAFT', 'PUBLISHED', 'RETIRED')),
	CONSTRAINT "ck_knowledge_release_published_metadata" CHECK ("knowledge_release"."status" <> 'PUBLISHED' or ("knowledge_release"."published_at" is not null and "knowledge_release"."published_by" is not null))
);
--> statement-breakpoint
CREATE TABLE "knowledge_release_approval" (
	"knowledge_release_id" text NOT NULL,
	"regulatory_approval_id" text NOT NULL,
	CONSTRAINT "knowledge_release_approval_knowledge_release_id_regulatory_approval_id_pk" PRIMARY KEY("knowledge_release_id","regulatory_approval_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_release_association" (
	"knowledge_release_id" text NOT NULL,
	"therapeutic_association_id" text NOT NULL,
	CONSTRAINT "knowledge_release_association_knowledge_release_id_therapeutic_association_id_pk" PRIMARY KEY("knowledge_release_id","therapeutic_association_id")
);
--> statement-breakpoint
CREATE TABLE "regulatory_approval" (
	"id" text PRIMARY KEY NOT NULL,
	"authority" text NOT NULL,
	"application_number" text NOT NULL,
	"submission_number" text,
	"approval_status" text NOT NULL,
	"approval_date" date NOT NULL,
	"status_as_of" date NOT NULL,
	"indication_text" text NOT NULL,
	"biomarker_text" text,
	"label_effective_date" date,
	"source_document_id" text NOT NULL,
	"review_status" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_regulatory_approval_status" CHECK ("regulatory_approval"."approval_status" in ('APPROVED', 'WITHDRAWN', 'INACTIVE', 'NOT_APPROVED', 'UNKNOWN')),
	CONSTRAINT "ck_regulatory_approval_review" CHECK ("regulatory_approval"."review_status" in ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "regulatory_approval_disease" (
	"regulatory_approval_id" text NOT NULL,
	"disease_id" text NOT NULL,
	"scope" text NOT NULL,
	CONSTRAINT "regulatory_approval_disease_regulatory_approval_id_disease_id_pk" PRIMARY KEY("regulatory_approval_id","disease_id"),
	CONSTRAINT "ck_regulatory_approval_disease_scope" CHECK ("regulatory_approval_disease"."scope" in ('EXACT', 'BROADER', 'OTHER'))
);
--> statement-breakpoint
CREATE TABLE "regulatory_approval_drug" (
	"regulatory_approval_id" text NOT NULL,
	"drug_id" text NOT NULL,
	CONSTRAINT "regulatory_approval_drug_regulatory_approval_id_drug_id_pk" PRIMARY KEY("regulatory_approval_id","drug_id")
);
--> statement-breakpoint
CREATE TABLE "regulatory_approval_passage" (
	"regulatory_approval_id" text NOT NULL,
	"source_passage_id" text NOT NULL,
	"support_role" text NOT NULL,
	CONSTRAINT "regulatory_approval_passage_regulatory_approval_id_source_passage_id_pk" PRIMARY KEY("regulatory_approval_id","source_passage_id"),
	CONSTRAINT "ck_regulatory_approval_passage_role" CHECK ("regulatory_approval_passage"."support_role" in ('INDICATION', 'BIOMARKER', 'STATUS', 'CONTEXT'))
);
--> statement-breakpoint
CREATE TABLE "regulatory_approval_variant" (
	"regulatory_approval_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"scope" text NOT NULL,
	CONSTRAINT "regulatory_approval_variant_regulatory_approval_id_variant_id_pk" PRIMARY KEY("regulatory_approval_id","variant_id"),
	CONSTRAINT "ck_regulatory_approval_variant_scope" CHECK ("regulatory_approval_variant"."scope" in ('EXACT', 'EXPLICIT_GROUP_INCLUDES_EXACT', 'GENE_ONLY'))
);
--> statement-breakpoint
CREATE TABLE "source_document" (
	"id" text PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"publisher_or_agency" text,
	"journal" text,
	"publication_date" date,
	"doi" text,
	"pmcid" text,
	"url" text NOT NULL,
	"source_scope" text NOT NULL,
	"language" text NOT NULL,
	"license" text,
	"retrieved_at" timestamp with time zone NOT NULL,
	"document_hash" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"review_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_source_document_type" CHECK ("source_document"."source_type" in ('PUBMED', 'FDA')),
	CONSTRAINT "ck_source_document_scope" CHECK ("source_document"."source_scope" in ('ABSTRACT', 'PMC_FULL_TEXT', 'FDA_LABEL', 'FDA_APPROVAL_RECORD', 'OTHER')),
	CONSTRAINT "ck_source_document_review" CHECK ("source_document"."review_status" in ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "source_passage" (
	"id" text PRIMARY KEY NOT NULL,
	"source_document_id" text NOT NULL,
	"section" text,
	"paragraph_index" integer,
	"locator" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"original_text" text NOT NULL,
	"text_hash" text NOT NULL,
	"language" text NOT NULL,
	"display_policy" text NOT NULL,
	"model_use_policy" text NOT NULL,
	"public_excerpt" text,
	"context_before_id" text,
	"context_after_id" text,
	"review_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_source_passage_display" CHECK ("source_passage"."display_policy" in ('FULL_TEXT', 'EXCERPT', 'LINK_ONLY', 'INTERNAL_ONLY')),
	CONSTRAINT "ck_source_passage_model_use" CHECK ("source_passage"."model_use_policy" in ('ALLOWED', 'PROHIBITED')),
	CONSTRAINT "ck_source_passage_review" CHECK ("source_passage"."review_status" in ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "therapeutic_association" (
	"id" text PRIMARY KEY NOT NULL,
	"disease_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"therapy_key" text NOT NULL,
	"direction" text NOT NULL,
	"variant_applicability" text NOT NULL,
	"proposed_level" text NOT NULL,
	"approved_level" text,
	"grading_rule_version" text NOT NULL,
	"grading_rationale" text NOT NULL,
	"review_status" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_association_direction" CHECK ("therapeutic_association"."direction" in ('SENSITIVITY', 'RESISTANCE', 'EXPLORATORY')),
	CONSTRAINT "ck_association_variant_applicability" CHECK ("therapeutic_association"."variant_applicability" in ('EXACT', 'EXPLICIT_GROUP_INCLUDES_EXACT', 'GENE_ONLY', 'ANALOGOUS_VARIANT', 'UNKNOWN')),
	CONSTRAINT "ck_association_proposed_level" CHECK ("therapeutic_association"."proposed_level" in ('1', '2', '3A', '3B', '4', 'R1', 'R2', 'UNRATED')),
	CONSTRAINT "ck_association_approved_level" CHECK ("therapeutic_association"."approved_level" is null or "therapeutic_association"."approved_level" in ('1', '2', '3A', '3B', '4', 'R1', 'R2', 'UNRATED')),
	CONSTRAINT "ck_association_review" CHECK ("therapeutic_association"."review_status" in ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "therapeutic_association_drug" (
	"association_id" text NOT NULL,
	"drug_id" text NOT NULL,
	"role" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "therapeutic_association_drug_association_id_drug_id_pk" PRIMARY KEY("association_id","drug_id"),
	CONSTRAINT "ck_association_drug_role" CHECK ("therapeutic_association_drug"."role" in ('PRIMARY', 'COMBINATION_COMPONENT'))
);
--> statement-breakpoint
CREATE TABLE "variant" (
	"id" text PRIMARY KEY NOT NULL,
	"gene_id" text NOT NULL,
	"alteration_type" text NOT NULL,
	"hgvsp" text,
	"hgvsc" text,
	"transcript" text,
	"canonical_key" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variant_canonical_key_unique" UNIQUE("canonical_key"),
	CONSTRAINT "ck_variant_status" CHECK ("variant"."status" in ('ACTIVE', 'INACTIVE', 'DEPRECATED'))
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_task" ADD CONSTRAINT "ai_task_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat" ADD CONSTRAINT "chat_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "chat"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit" ADD CONSTRAINT "credit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "permission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxonomy" ADD CONSTRAINT "taxonomy_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_snapshot" ADD CONSTRAINT "answer_snapshot_knowledge_release_id_knowledge_release_id_fk" FOREIGN KEY ("knowledge_release_id") REFERENCES "knowledge_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_claim" ADD CONSTRAINT "evidence_claim_association_id_therapeutic_association_id_fk" FOREIGN KEY ("association_id") REFERENCES "therapeutic_association"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_claim_passage" ADD CONSTRAINT "evidence_claim_passage_evidence_claim_id_evidence_claim_id_fk" FOREIGN KEY ("evidence_claim_id") REFERENCES "evidence_claim"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_claim_passage" ADD CONSTRAINT "evidence_claim_passage_source_passage_id_source_passage_id_fk" FOREIGN KEY ("source_passage_id") REFERENCES "source_passage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_release_approval" ADD CONSTRAINT "knowledge_release_approval_knowledge_release_id_knowledge_release_id_fk" FOREIGN KEY ("knowledge_release_id") REFERENCES "knowledge_release"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_release_approval" ADD CONSTRAINT "knowledge_release_approval_regulatory_approval_id_regulatory_approval_id_fk" FOREIGN KEY ("regulatory_approval_id") REFERENCES "regulatory_approval"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_release_association" ADD CONSTRAINT "knowledge_release_association_knowledge_release_id_knowledge_release_id_fk" FOREIGN KEY ("knowledge_release_id") REFERENCES "knowledge_release"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_release_association" ADD CONSTRAINT "knowledge_release_association_therapeutic_association_id_therapeutic_association_id_fk" FOREIGN KEY ("therapeutic_association_id") REFERENCES "therapeutic_association"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_approval" ADD CONSTRAINT "regulatory_approval_source_document_id_source_document_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "source_document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_approval_disease" ADD CONSTRAINT "regulatory_approval_disease_regulatory_approval_id_regulatory_approval_id_fk" FOREIGN KEY ("regulatory_approval_id") REFERENCES "regulatory_approval"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_approval_disease" ADD CONSTRAINT "regulatory_approval_disease_disease_id_disease_id_fk" FOREIGN KEY ("disease_id") REFERENCES "disease"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_approval_drug" ADD CONSTRAINT "regulatory_approval_drug_regulatory_approval_id_regulatory_approval_id_fk" FOREIGN KEY ("regulatory_approval_id") REFERENCES "regulatory_approval"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_approval_drug" ADD CONSTRAINT "regulatory_approval_drug_drug_id_drug_id_fk" FOREIGN KEY ("drug_id") REFERENCES "drug"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_approval_passage" ADD CONSTRAINT "regulatory_approval_passage_regulatory_approval_id_regulatory_approval_id_fk" FOREIGN KEY ("regulatory_approval_id") REFERENCES "regulatory_approval"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_approval_passage" ADD CONSTRAINT "regulatory_approval_passage_source_passage_id_source_passage_id_fk" FOREIGN KEY ("source_passage_id") REFERENCES "source_passage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_approval_variant" ADD CONSTRAINT "regulatory_approval_variant_regulatory_approval_id_regulatory_approval_id_fk" FOREIGN KEY ("regulatory_approval_id") REFERENCES "regulatory_approval"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_approval_variant" ADD CONSTRAINT "regulatory_approval_variant_variant_id_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "variant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_passage" ADD CONSTRAINT "source_passage_source_document_id_source_document_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "source_document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_passage" ADD CONSTRAINT "source_passage_context_before_id_source_passage_id_fk" FOREIGN KEY ("context_before_id") REFERENCES "source_passage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_passage" ADD CONSTRAINT "source_passage_context_after_id_source_passage_id_fk" FOREIGN KEY ("context_after_id") REFERENCES "source_passage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "therapeutic_association" ADD CONSTRAINT "therapeutic_association_disease_id_disease_id_fk" FOREIGN KEY ("disease_id") REFERENCES "disease"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "therapeutic_association" ADD CONSTRAINT "therapeutic_association_variant_id_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "variant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "therapeutic_association_drug" ADD CONSTRAINT "therapeutic_association_drug_association_id_therapeutic_association_id_fk" FOREIGN KEY ("association_id") REFERENCES "therapeutic_association"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "therapeutic_association_drug" ADD CONSTRAINT "therapeutic_association_drug_drug_id_drug_id_fk" FOREIGN KEY ("drug_id") REFERENCES "drug"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant" ADD CONSTRAINT "variant_gene_id_gene_id_fk" FOREIGN KEY ("gene_id") REFERENCES "gene"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_account_user_id" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_account_provider_account" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "idx_ai_task_user_media_type" ON "ai_task" USING btree ("user_id","media_type");--> statement-breakpoint
CREATE INDEX "idx_ai_task_media_type_status" ON "ai_task" USING btree ("media_type","status");--> statement-breakpoint
CREATE INDEX "idx_apikey_user_status" ON "apikey" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_apikey_key_status" ON "apikey" USING btree ("key","status");--> statement-breakpoint
CREATE INDEX "idx_chat_user_status" ON "chat" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_chat_message_chat_id" ON "chat_message" USING btree ("chat_id","status");--> statement-breakpoint
CREATE INDEX "idx_chat_message_user_id" ON "chat_message" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_credit_consume_fifo" ON "credit" USING btree ("user_id","status","transaction_type","remaining_credits","expires_at");--> statement-breakpoint
CREATE INDEX "idx_credit_order_no" ON "credit" USING btree ("order_no");--> statement-breakpoint
CREATE INDEX "idx_credit_subscription_no" ON "credit" USING btree ("subscription_no");--> statement-breakpoint
CREATE INDEX "idx_order_user_status_payment_type" ON "order" USING btree ("user_id","status","payment_type");--> statement-breakpoint
CREATE INDEX "idx_order_transaction_provider" ON "order" USING btree ("transaction_id","payment_provider");--> statement-breakpoint
CREATE INDEX "idx_order_created_at" ON "order" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_permission_resource_action" ON "permission" USING btree ("resource","action");--> statement-breakpoint
CREATE INDEX "idx_post_type_status" ON "post" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "idx_role_status" ON "role" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_role_permission_role_permission" ON "role_permission" USING btree ("role_id","permission_id");--> statement-breakpoint
CREATE INDEX "idx_session_user_expires" ON "session" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "idx_subscription_user_status_interval" ON "subscription" USING btree ("user_id","status","interval");--> statement-breakpoint
CREATE INDEX "idx_subscription_provider_id" ON "subscription" USING btree ("subscription_id","payment_provider");--> statement-breakpoint
CREATE INDEX "idx_subscription_created_at" ON "subscription" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_taxonomy_type_status" ON "taxonomy" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "idx_user_name" ON "user" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_user_created_at" ON "user" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_user_role_user_expires" ON "user_role" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "idx_verification_identifier" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_answer_snapshot_cache_key" ON "answer_snapshot" USING btree ("request_fingerprint","knowledge_release_id","prompt_version","provider","model","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_disease_ontology" ON "disease" USING btree ("ontology_system","ontology_code") WHERE "disease"."ontology_system" is not null and "disease"."ontology_code" is not null;--> statement-breakpoint
CREATE INDEX "idx_evidence_claim_association" ON "evidence_claim" USING btree ("association_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_release_status" ON "knowledge_release" USING btree ("status","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_regulatory_approval_identity" ON "regulatory_approval" USING btree ("authority","application_number","submission_number");--> statement-breakpoint
CREATE INDEX "idx_regulatory_approval_status" ON "regulatory_approval" USING btree ("authority","approval_status","review_status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_source_document_external" ON "source_document" USING btree ("source_type","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_source_passage_document_hash" ON "source_passage" USING btree ("source_document_id","text_hash");--> statement-breakpoint
CREATE INDEX "idx_source_passage_document" ON "source_passage" USING btree ("source_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_therapeutic_association_identity" ON "therapeutic_association" USING btree ("disease_id","variant_id","therapy_key","direction");--> statement-breakpoint
CREATE INDEX "idx_association_retrieval" ON "therapeutic_association" USING btree ("variant_id","disease_id","review_status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_association_drug_order" ON "therapeutic_association_drug" USING btree ("association_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_variant_gene" ON "variant" USING btree ("gene_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION evidex_reject_published_release_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'published knowledge release is immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER evidex_knowledge_release_immutable
BEFORE UPDATE OR DELETE ON "knowledge_release"
FOR EACH ROW
WHEN (OLD.status = 'PUBLISHED')
EXECUTE FUNCTION evidex_reject_published_release_change();--> statement-breakpoint
CREATE OR REPLACE FUNCTION evidex_reject_published_membership_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	release_id text;
BEGIN
	release_id := COALESCE(NEW.knowledge_release_id, OLD.knowledge_release_id);
	IF EXISTS (
		SELECT 1 FROM knowledge_release
		WHERE id = release_id AND status = 'PUBLISHED'
	) THEN
		RAISE EXCEPTION 'published knowledge release membership is immutable';
	END IF;
	RETURN COALESCE(NEW, OLD);
END;
$$;--> statement-breakpoint
CREATE TRIGGER evidex_release_association_immutable
BEFORE INSERT OR UPDATE OR DELETE ON "knowledge_release_association"
FOR EACH ROW EXECUTE FUNCTION evidex_reject_published_membership_change();--> statement-breakpoint
CREATE TRIGGER evidex_release_approval_immutable
BEFORE INSERT OR UPDATE OR DELETE ON "knowledge_release_approval"
FOR EACH ROW EXECUTE FUNCTION evidex_reject_published_membership_change();
