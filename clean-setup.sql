-- FeedbackIQ — CLEAN setup for a NEW, EMPTY Supabase project.
--
-- Creates the tables and one empty workspace. NO demo data and NO test users.
-- Contains no DROP or DELETE statements, but it is meant for a brand-new project
-- only: paste it into the SQL editor of the NEW project, never your live one.
-- If you run it twice, the second run stops with "already exists" and changes nothing.

-- ============ SCHEMA ============
CREATE TYPE "public"."confidence" AS ENUM('High', 'Medium', 'Low');--> statement-breakpoint
CREATE TYPE "public"."enhancement_status" AS ENUM('review', 'planned', 'progress', 'shipped', 'wontdo');--> statement-breakpoint
CREATE TYPE "public"."feedback_type" AS ENUM('Feature', 'Bug', 'UX', 'Question', 'Praise');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('High', 'Medium', 'Low');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('needs_review', 'approved', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'contributor', 'executive', 'engineer', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."sentiment" AS ENUM('Positive', 'Neutral', 'Negative');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('email', 'recording', 'transcript', 'spreadsheet', 'note', 'paste', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('queued', 'processing', 'processed', 'failed');--> statement-breakpoint
CREATE TABLE "ai_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"scoring_weights" jsonb,
	"tagging_prompt" text,
	"summary_prompt" text,
	"rules" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_label" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"content" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enhancements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"theme_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"benefit" integer DEFAULT 5 NOT NULL,
	"effort" integer DEFAULT 5 NOT NULL,
	"demand" integer DEFAULT 0 NOT NULL,
	"score" numeric(4, 1) DEFAULT '0' NOT NULL,
	"status" "enhancement_status" DEFAULT 'review' NOT NULL,
	"jira_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"enhancement_id" uuid NOT NULL,
	"feedback_item_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_id" uuid,
	"theme_id" uuid,
	"quote" text NOT NULL,
	"context_before" text,
	"context_after" text,
	"customer" text,
	"submitter" text,
	"speaker" text,
	"timestamp_label" text,
	"row_ref" text,
	"occurred_at" timestamp with time zone,
	"type" "feedback_type",
	"product_area_id" uuid,
	"severity" "priority",
	"sentiment" "sentiment",
	"confidence" "confidence",
	"review_status" "review_status" DEFAULT 'needs_review' NOT NULL,
	"review_reason" text,
	"merged_into_id" uuid,
	"demand_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"ai_proposed" boolean DEFAULT false NOT NULL,
	"approved" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "source_kind" NOT NULL,
	"filename" text NOT NULL,
	"storage_path" text,
	"status" "source_status" DEFAULT 'queued' NOT NULL,
	"auto_ingested" boolean DEFAULT false NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"note" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"type" "feedback_type",
	"sentiment" "sentiment",
	"priority" "priority",
	"delta_pct" integer DEFAULT 0 NOT NULL,
	"is_emerging" boolean DEFAULT false NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracker_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text DEFAULT 'jira' NOT NULL,
	"project_key" text,
	"issue_type" text DEFAULT 'Story',
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "role" DEFAULT 'owner' NOT NULL,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"forwarding_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_configs" ADD CONSTRAINT "ai_configs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digests" ADD CONSTRAINT "digests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhancements" ADD CONSTRAINT "enhancements_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhancements" ADD CONSTRAINT "enhancements_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_enhancement_id_enhancements_id_fk" FOREIGN KEY ("enhancement_id") REFERENCES "public"."enhancements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_feedback_item_id_feedback_items_id_fk" FOREIGN KEY ("feedback_item_id") REFERENCES "public"."feedback_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_items" ADD CONSTRAINT "feedback_items_product_area_id_product_areas_id_fk" FOREIGN KEY ("product_area_id") REFERENCES "public"."product_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_areas" ADD CONSTRAINT "product_areas_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "themes" ADD CONSTRAINT "themes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_connections" ADD CONSTRAINT "tracker_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_workspace_idx" ON "audit_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "enh_workspace_idx" ON "enhancements" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "items_workspace_idx" ON "feedback_items" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "items_theme_idx" ON "feedback_items" USING btree ("theme_id");--> statement-breakpoint
CREATE INDEX "items_review_idx" ON "feedback_items" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "sources_workspace_idx" ON "sources" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "themes_workspace_idx" ON "themes" USING btree ("workspace_id");

-- ============ WORKSPACE MEMBERSHIP (who can see which workspace) ============
CREATE TABLE "workspace_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" DEFAULT 'contributor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "members_ws_user_uq" ON "workspace_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "members_user_idx" ON "workspace_members" USING btree ("user_id");;

-- ============ PER-WORKSPACE AI SETTINGS ============
CREATE TABLE "workspace_ai_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'gemini' NOT NULL,
	"model" text,
	"encrypted_key" text,
	"key_last4" text,
	"allow_platform_key" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_ai_settings" ADD CONSTRAINT "workspace_ai_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_ai_settings" ADD CONSTRAINT "workspace_ai_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Same protection as every other table: nothing readable through Supabase's public API.
ALTER TABLE "workspace_ai_settings" ENABLE ROW LEVEL SECURITY;


-- ============ JIRA ============
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
-- (A brand-new database has no old rows to tidy, so no clean-up step is needed here.)
CREATE UNIQUE INDEX "tracker_ws_uq" ON "tracker_connections" USING btree ("workspace_id");

-- ============ INCOMING WEBHOOK ============
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


-- ============ DIGEST CHANNELS + SHARE LINKS ============
CREATE TABLE "digest_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"encrypted_url" text NOT NULL,
	"url_hint" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_posted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "digest_channels" ADD CONSTRAINT "digest_channels_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digest_channels" ADD CONSTRAINT "digest_channels_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "digest_channels_ws_kind_uq" ON "digest_channels" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_ws_kind_uq" ON "share_links" USING btree ("workspace_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_token_uq" ON "share_links" USING btree ("token_hash");--> statement-breakpoint
-- Same protection as every other table: nothing readable through Supabase's public API.
ALTER TABLE "digest_channels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "share_links" ENABLE ROW LEVEL SECURITY;


-- ============ ONE EMPTY WORKSPACE (the app needs this to exist) ============
INSERT INTO "tenants" ("name") VALUES ('Test Environment');
INSERT INTO "workspaces" ("tenant_id", "name", "description")
SELECT "id", 'Test Workspace', 'Testing' FROM "tenants" LIMIT 1;
