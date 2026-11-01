CREATE TABLE "audio_briefings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"theme_ids" jsonb NOT NULL,
	"theme_titles" jsonb NOT NULL,
	"length" text DEFAULT 'balanced' NOT NULL,
	"name_mode" text DEFAULT 'mask' NOT NULL,
	"status" text DEFAULT 'writing' NOT NULL,
	"error" text,
	"script" jsonb,
	"has_audio" boolean DEFAULT false NOT NULL,
	"duration_sec" integer,
	"size_bytes" integer,
	"voice_source" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audio_files" (
	"briefing_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"mp3" bytea NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audio_briefings" ADD CONSTRAINT "audio_briefings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_briefings" ADD CONSTRAINT "audio_briefings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_files" ADD CONSTRAINT "audio_files_briefing_id_audio_briefings_id_fk" FOREIGN KEY ("briefing_id") REFERENCES "public"."audio_briefings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_files" ADD CONSTRAINT "audio_files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "briefings_ws_idx" ON "audio_briefings" USING btree ("workspace_id","created_at");--> statement-breakpoint
-- Same protection as every other table: nothing readable through Supabase's public API.
ALTER TABLE "audio_briefings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audio_files" ENABLE ROW LEVEL SECURITY;
