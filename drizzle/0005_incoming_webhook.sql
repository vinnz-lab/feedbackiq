ALTER TYPE "public"."source_kind" ADD VALUE IF NOT EXISTS 'webhook';--> statement-breakpoint
CREATE TABLE "incoming_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_hint" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"received_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"window_start" timestamp with time zone,
	"window_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "incoming_webhooks" ADD CONSTRAINT "incoming_webhooks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_webhooks" ADD CONSTRAINT "incoming_webhooks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "webhooks_ws_uq" ON "incoming_webhooks" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhooks_token_uq" ON "incoming_webhooks" USING btree ("token_hash");
--> statement-breakpoint
-- Same protection as every other table: nothing readable through Supabase's public API.
ALTER TABLE "incoming_webhooks" ENABLE ROW LEVEL SECURITY;
