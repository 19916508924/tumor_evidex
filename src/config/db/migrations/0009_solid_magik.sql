CREATE TABLE "rate_limit_bucket" (
	"key" text PRIMARY KEY NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeat" (
	"worker_id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"current_job_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "ck_worker_heartbeat_status" CHECK ("worker_heartbeat"."status" in ('IDLE', 'RUNNING', 'ERROR'))
);
--> statement-breakpoint
ALTER TABLE "worker_heartbeat" ADD CONSTRAINT "worker_heartbeat_current_job_id_platform_job_id_fk" FOREIGN KEY ("current_job_id") REFERENCES "platform_job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_rate_limit_bucket_updated" ON "rate_limit_bucket" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_worker_heartbeat_seen" ON "worker_heartbeat" USING btree ("last_seen_at");
