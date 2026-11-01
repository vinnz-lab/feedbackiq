ALTER TABLE "enhancements" ADD COLUMN "jira_url" text;--> statement-breakpoint
ALTER TABLE "enhancements" ADD COLUMN "jira_status" text;--> statement-breakpoint
ALTER TABLE "enhancements" ADD COLUMN "jira_status_category" text;--> statement-breakpoint
ALTER TABLE "enhancements" ADD COLUMN "jira_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tracker_connections" ADD COLUMN "site_url" text;--> statement-breakpoint
ALTER TABLE "tracker_connections" ADD COLUMN "auth_email" text;--> statement-breakpoint
ALTER TABLE "tracker_connections" ADD COLUMN "encrypted_token" text;--> statement-breakpoint
ALTER TABLE "tracker_connections" ADD COLUMN "token_last4" text;--> statement-breakpoint
ALTER TABLE "tracker_connections" ADD COLUMN "name_mode" text DEFAULT 'include' NOT NULL;--> statement-breakpoint
ALTER TABLE "tracker_connections" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "tracker_connections" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "tracker_connections" ADD CONSTRAINT "tracker_connections_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- One connection per workspace. Only credential-less demo placeholders can
-- exist today (nothing has ever saved a real connection), so if a workspace
-- somehow has more than one, keep the newest.
DELETE FROM "tracker_connections" a USING "tracker_connections" b
WHERE a."workspace_id" = b."workspace_id" AND (a."created_at", a."id") < (b."created_at", b."id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracker_ws_uq" ON "tracker_connections" USING btree ("workspace_id");