-- FeedbackIQ bootstrap — schema + seed. Safe to re-run (wipes prior FeedbackIQ tables first).

-- ============ RESET (clears any previous run) ============
DROP TABLE IF EXISTS "incoming_webhooks" CASCADE;
DROP TABLE IF EXISTS "workspace_ai_settings" CASCADE;
DROP TABLE IF EXISTS "workspace_members" CASCADE;
DROP TABLE IF EXISTS "ai_configs" CASCADE;
DROP TABLE IF EXISTS "audit_events" CASCADE;
DROP TABLE IF EXISTS "digests" CASCADE;
DROP TABLE IF EXISTS "tracker_connections" CASCADE;
DROP TABLE IF EXISTS "evidence_links" CASCADE;
DROP TABLE IF EXISTS "enhancements" CASCADE;
DROP TABLE IF EXISTS "feedback_items" CASCADE;
DROP TABLE IF EXISTS "themes" CASCADE;
DROP TABLE IF EXISTS "sources" CASCADE;
DROP TABLE IF EXISTS "product_areas" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
DROP TABLE IF EXISTS "workspaces" CASCADE;
DROP TABLE IF EXISTS "tenants" CASCADE;
DROP TYPE IF EXISTS "role" CASCADE;
DROP TYPE IF EXISTS "source_kind" CASCADE;
DROP TYPE IF EXISTS "source_status" CASCADE;
DROP TYPE IF EXISTS "feedback_type" CASCADE;
DROP TYPE IF EXISTS "sentiment" CASCADE;
DROP TYPE IF EXISTS "priority" CASCADE;
DROP TYPE IF EXISTS "confidence" CASCADE;
DROP TYPE IF EXISTS "review_status" CASCADE;
DROP TYPE IF EXISTS "enhancement_status" CASCADE;

-- ============ SCHEMA ============
CREATE TYPE "public"."confidence" AS ENUM('High', 'Medium', 'Low');--> statement-breakpoint
CREATE TYPE "public"."enhancement_status" AS ENUM('review', 'planned', 'progress', 'shipped', 'wontdo');--> statement-breakpoint
CREATE TYPE "public"."feedback_type" AS ENUM('Feature', 'Bug', 'UX', 'Question', 'Praise');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('High', 'Medium', 'Low');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('needs_review', 'approved', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'contributor', 'executive', 'engineer');--> statement-breakpoint
CREATE TYPE "public"."sentiment" AS ENUM('Positive', 'Neutral', 'Negative');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('email', 'recording', 'transcript', 'spreadsheet', 'note', 'paste');--> statement-breakpoint
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

-- ============ SEED DATA ============
INSERT INTO "tenants" ("id", "name", "created_at") VALUES ('992c3303-12cf-4833-b978-c3b7c8a5158b', 'Acme Group', '2026-07-27 22:18:06.086+00') ON CONFLICT DO NOTHING;

INSERT INTO "workspaces" ("id", "tenant_id", "name", "description", "forwarding_address", "created_at") VALUES ('0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', '992c3303-12cf-4833-b978-c3b7c8a5158b', 'Acme App', 'Customer platform', 'feedback@acme.app', '2026-07-27 22:18:06.088+00') ON CONFLICT DO NOTHING;

INSERT INTO "users" ("id", "tenant_id", "email", "name", "role", "last_active_at", "created_at") VALUES ('f818d139-76c6-44ca-9498-33bc4e03b83a', '992c3303-12cf-4833-b978-c3b7c8a5158b', 'jamie@acme.test', 'Jamie Lee', 'owner', NULL, '2026-07-27 22:18:06.091+00') ON CONFLICT DO NOTHING;
INSERT INTO "users" ("id", "tenant_id", "email", "name", "role", "last_active_at", "created_at") VALUES ('c2685c43-cc7c-49d7-8f53-e8db21e4c81d', '992c3303-12cf-4833-b978-c3b7c8a5158b', 'tom@acme.test', 'Tom Becker', 'contributor', NULL, '2026-07-27 22:18:06.091+00') ON CONFLICT DO NOTHING;
INSERT INTO "users" ("id", "tenant_id", "email", "name", "role", "last_active_at", "created_at") VALUES ('95372c05-2b6a-44f7-943a-dd6e94247fcd', '992c3303-12cf-4833-b978-c3b7c8a5158b', 'riya@acme.test', 'Riya Shah', 'executive', NULL, '2026-07-27 22:18:06.091+00') ON CONFLICT DO NOTHING;
INSERT INTO "users" ("id", "tenant_id", "email", "name", "role", "last_active_at", "created_at") VALUES ('5d022743-d635-4b97-bdf6-131f2c2d8069', '992c3303-12cf-4833-b978-c3b7c8a5158b', 'ana@acme.test', 'Ana Costa', 'engineer', NULL, '2026-07-27 22:18:06.091+00') ON CONFLICT DO NOTHING;

INSERT INTO "product_areas" ("id", "workspace_id", "name", "ai_proposed", "approved", "created_at") VALUES ('3c9800cb-799f-4f81-92fa-9ee4f0341543', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'Reporting', FALSE, TRUE, '2026-07-27 22:18:06.093+00') ON CONFLICT DO NOTHING;
INSERT INTO "product_areas" ("id", "workspace_id", "name", "ai_proposed", "approved", "created_at") VALUES ('07d63371-b9b3-4112-8739-2921a2a00fe9', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'Performance', FALSE, TRUE, '2026-07-27 22:18:06.093+00') ON CONFLICT DO NOTHING;
INSERT INTO "product_areas" ("id", "workspace_id", "name", "ai_proposed", "approved", "created_at") VALUES ('3562955d-5d76-40f2-8ae1-ff19d8134858', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'Permissions', FALSE, TRUE, '2026-07-27 22:18:06.093+00') ON CONFLICT DO NOTHING;
INSERT INTO "product_areas" ("id", "workspace_id", "name", "ai_proposed", "approved", "created_at") VALUES ('d476bc14-8745-4ac4-b2f6-89a0f48b7f5a', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'Notifications', FALSE, TRUE, '2026-07-27 22:18:06.093+00') ON CONFLICT DO NOTHING;
INSERT INTO "product_areas" ("id", "workspace_id", "name", "ai_proposed", "approved", "created_at") VALUES ('6adb2f20-d737-48db-849f-57414af1ceb4', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'Planning', FALSE, TRUE, '2026-07-27 22:18:06.093+00') ON CONFLICT DO NOTHING;
INSERT INTO "product_areas" ("id", "workspace_id", "name", "ai_proposed", "approved", "created_at") VALUES ('706a32d9-4e4e-41e0-9182-8fc0b9f4f4b6', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'UI & theming', FALSE, TRUE, '2026-07-27 22:18:06.093+00') ON CONFLICT DO NOTHING;
INSERT INTO "product_areas" ("id", "workspace_id", "name", "ai_proposed", "approved", "created_at") VALUES ('83ba0f19-f4e2-41f3-aac9-f1a6035d5016', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'Search', FALSE, TRUE, '2026-07-27 22:18:06.093+00') ON CONFLICT DO NOTHING;
INSERT INTO "product_areas" ("id", "workspace_id", "name", "ai_proposed", "approved", "created_at") VALUES ('d1d800ca-9e30-42aa-8b76-b99311a29708', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'Billing', FALSE, TRUE, '2026-07-27 22:18:06.093+00') ON CONFLICT DO NOTHING;
INSERT INTO "product_areas" ("id", "workspace_id", "name", "ai_proposed", "approved", "created_at") VALUES ('d20fec89-d684-4c5e-8661-432069ac35a1', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'Onboarding', FALSE, TRUE, '2026-07-27 22:18:06.093+00') ON CONFLICT DO NOTHING;

INSERT INTO "sources" ("id", "workspace_id", "kind", "filename", "storage_path", "status", "auto_ingested", "item_count", "note", "meta", "created_at") VALUES ('7104193b-2d5b-4a72-b1ad-a0f687169be6', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'recording', 'customer_call_jul21.mp4', NULL, 'processed', FALSE, 3, '41 min · 2 speakers identified', NULL, '2026-07-27 22:18:06.095+00') ON CONFLICT DO NOTHING;
INSERT INTO "sources" ("id", "workspace_id", "kind", "filename", "storage_path", "status", "auto_ingested", "item_count", "note", "meta", "created_at") VALUES ('bc350a36-c9b7-429f-9bf5-3a0f0ce29b77', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'email', 'email_from_northwind.msg', NULL, 'processed', FALSE, 2, 'sender allow-listed', NULL, '2026-07-27 22:18:06.095+00') ON CONFLICT DO NOTHING;
INSERT INTO "sources" ("id", "workspace_id", "kind", "filename", "storage_path", "status", "auto_ingested", "item_count", "note", "meta", "created_at") VALUES ('4ea4e024-4590-4161-a929-8ba8c41ae272', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'transcript', 'qbr_skyline_transcript.vtt', NULL, 'processed', FALSE, 2, 'speaker labels preserved', NULL, '2026-07-27 22:18:06.095+00') ON CONFLICT DO NOTHING;
INSERT INTO "sources" ("id", "workspace_id", "kind", "filename", "storage_path", "status", "auto_ingested", "item_count", "note", "meta", "created_at") VALUES ('5f23861f-bed0-4eb4-9b1d-90c10ec16e8c', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'spreadsheet', 'q2_survey_results.xlsx', NULL, 'processed', FALSE, 38, '38/41 rows · 3 skipped (empty)', NULL, '2026-07-27 22:18:06.095+00') ON CONFLICT DO NOTHING;
INSERT INTO "sources" ("id", "workspace_id", "kind", "filename", "storage_path", "status", "auto_ingested", "item_count", "note", "meta", "created_at") VALUES ('63c6820e-d2be-4c62-a460-765c43a95195', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'email', 'RE: export formatting — Northwind', NULL, 'processed', TRUE, 1, 'via feedback@acme.app', NULL, '2026-07-27 22:18:06.095+00') ON CONFLICT DO NOTHING;
INSERT INTO "sources" ("id", "workspace_id", "kind", "filename", "storage_path", "status", "auto_ingested", "item_count", "note", "meta", "created_at") VALUES ('fa61087b-d574-4f6f-8f2f-b899b307e8b3', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'note', 'broken_upload.docx', NULL, 'failed', FALSE, 0, 'Unsupported encoding', NULL, '2026-07-27 22:18:06.095+00') ON CONFLICT DO NOTHING;
INSERT INTO "sources" ("id", "workspace_id", "kind", "filename", "storage_path", "status", "auto_ingested", "item_count", "note", "meta", "created_at") VALUES ('ab82e5a2-b3ff-49ad-82c5-08bb8f3dff78', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'recording', 'weekly_sync_jul22.m4a', NULL, 'processing', FALSE, 0, 'Transcribing + diarizing', NULL, '2026-07-27 22:18:06.095+00') ON CONFLICT DO NOTHING;

INSERT INTO "themes" ("id", "workspace_id", "title", "summary", "type", "sentiment", "priority", "delta_pct", "is_emerging", "pinned", "created_at") VALUES ('8765afb9-7ec4-4ebd-b573-047ff9a1ca04', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'Slow dashboard loading', 'Users report 15–25s dashboard loads on quarter-filtered views. Two accounts say their teams have stopped using it.', 'Bug', 'Negative', 'High', 32, FALSE, FALSE, '2026-07-27 22:18:06.098+00') ON CONFLICT DO NOTHING;
INSERT INTO "themes" ("id", "workspace_id", "title", "summary", "type", "sentiment", "priority", "delta_pct", "is_emerging", "pinned", "created_at") VALUES ('95ae0e00-f5f0-4416-a376-3592b7faeb28', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'Export to Excel', 'Consistent demand for native .xlsx/CSV export of dashboards — copy-paste workflows destroy formatting at month-end.', 'Feature', 'Neutral', 'Medium', 18, FALSE, FALSE, '2026-07-27 22:18:06.098+00') ON CONFLICT DO NOTHING;
INSERT INTO "themes" ("id", "workspace_id", "title", "summary", "type", "sentiment", "priority", "delta_pct", "is_emerging", "pinned", "created_at") VALUES ('7f97fb5a-acf1-4be4-86ce-8f9e2994c69d', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'Dashboard UX confusing', 'New users cannot find key views; totals and filters are misread. Confusion clusters around the analytics area.', 'UX', 'Negative', 'Medium', -11, FALSE, FALSE, '2026-07-27 22:18:06.098+00') ON CONFLICT DO NOTHING;
INSERT INTO "themes" ("id", "workspace_id", "title", "summary", "type", "sentiment", "priority", "delta_pct", "is_emerging", "pinned", "created_at") VALUES ('4f28291c-5b9a-49b2-8ceb-75bad123f6fb', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'Praise: new timeline view', 'Unprompted praise for the timeline view — “saves our PM hours each week”. Strong candidate for the changelog.', 'Praise', 'Positive', 'Low', 40, FALSE, FALSE, '2026-07-27 22:18:06.098+00') ON CONFLICT DO NOTHING;
INSERT INTO "themes" ("id", "workspace_id", "title", "summary", "type", "sentiment", "priority", "delta_pct", "is_emerging", "pinned", "created_at") VALUES ('fe6327cb-c6c3-43b7-a8ce-8b3f94579283', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'Granular permissions & roles', 'Enterprise accounts want view-only contractor seats, per-project guests and admin-configurable roles.', 'Feature', 'Neutral', 'High', 25, FALSE, FALSE, '2026-07-27 22:18:06.098+00') ON CONFLICT DO NOTHING;
INSERT INTO "themes" ("id", "workspace_id", "title", "summary", "type", "sentiment", "priority", "delta_pct", "is_emerging", "pinned", "created_at") VALUES ('d7441aa0-f99a-4b63-b646-b8cdb3053efb', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'Notification overload', 'Default alerts fire on every minor change. Users want per-project and per-event preferences plus a daily summary.', 'UX', 'Negative', 'Medium', -8, FALSE, FALSE, '2026-07-27 22:18:06.098+00') ON CONFLICT DO NOTHING;
INSERT INTO "themes" ("id", "workspace_id", "title", "summary", "type", "sentiment", "priority", "delta_pct", "is_emerging", "pinned", "created_at") VALUES ('ee104520-da50-46b3-9693-4a53a02f5773', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'API rate limits', 'Integration partners hit 429s during nightly syncs — the fastest-accelerating negative theme this month.', 'Bug', 'Negative', 'High', 66, TRUE, FALSE, '2026-07-27 22:18:06.098+00') ON CONFLICT DO NOTHING;
INSERT INTO "themes" ("id", "workspace_id", "title", "summary", "type", "sentiment", "priority", "delta_pct", "is_emerging", "pinned", "created_at") VALUES ('2e762d32-902b-4df3-b7f3-012aeb982a14', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'Search results relevance', 'Search misses archived projects and attachment contents; users work around with manual tags.', 'UX', 'Neutral', 'Medium', 15, FALSE, FALSE, '2026-07-27 22:18:06.098+00') ON CONFLICT DO NOTHING;

INSERT INTO "feedback_items" ("id", "workspace_id", "source_id", "theme_id", "quote", "context_before", "context_after", "customer", "submitter", "speaker", "timestamp_label", "row_ref", "occurred_at", "type", "product_area_id", "severity", "sentiment", "confidence", "review_status", "review_reason", "merged_into_id", "demand_count", "created_at") VALUES ('7d07f8cf-f117-4f07-a9bb-6def99999a26', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', '7104193b-2d5b-4a72-b1ad-a0f687169be6', '8765afb9-7ec4-4ebd-b573-047ff9a1ca04', 'The dashboard takes maybe twenty seconds to load when we filter by quarter — my team just gave up using it.', NULL, NULL, 'Skyline Ltd', NULL, 'M. Torres', '00:14:32', NULL, NULL, 'Bug', '07d63371-b9b3-4112-8739-2921a2a00fe9', 'High', 'Negative', 'High', 'approved', NULL, NULL, 1, '2026-07-27 22:18:06.102+00') ON CONFLICT DO NOTHING;
INSERT INTO "feedback_items" ("id", "workspace_id", "source_id", "theme_id", "quote", "context_before", "context_after", "customer", "submitter", "speaker", "timestamp_label", "row_ref", "occurred_at", "type", "product_area_id", "severity", "sentiment", "confidence", "review_status", "review_reason", "merged_into_id", "demand_count", "created_at") VALUES ('a680cd76-2162-4dfc-804e-2c5b61200567', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', '5f23861f-bed0-4eb4-9b1d-90c10ec16e8c', '8765afb9-7ec4-4ebd-b573-047ff9a1ca04', 'Dashboard timeouts weekly for our 40-seat account.', NULL, NULL, 'Northwind', NULL, NULL, NULL, 'row 23', NULL, 'Bug', '07d63371-b9b3-4112-8739-2921a2a00fe9', 'High', 'Negative', 'Medium', 'approved', NULL, NULL, 1, '2026-07-27 22:18:06.102+00') ON CONFLICT DO NOTHING;
INSERT INTO "feedback_items" ("id", "workspace_id", "source_id", "theme_id", "quote", "context_before", "context_after", "customer", "submitter", "speaker", "timestamp_label", "row_ref", "occurred_at", "type", "product_area_id", "severity", "sentiment", "confidence", "review_status", "review_reason", "merged_into_id", "demand_count", "created_at") VALUES ('ecfbccf5-49c7-4aed-8439-804cc8b665ca', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'bc350a36-c9b7-429f-9bf5-3a0f0ce29b77', '8765afb9-7ec4-4ebd-b573-047ff9a1ca04', 'Honestly it is fine on small ranges, it is the quarter view that dies.', NULL, NULL, 'Skyline Ltd', 'R. Patel', NULL, NULL, NULL, NULL, 'UX', '07d63371-b9b3-4112-8739-2921a2a00fe9', 'Medium', 'Neutral', 'Medium', 'approved', NULL, NULL, 1, '2026-07-27 22:18:06.102+00') ON CONFLICT DO NOTHING;
INSERT INTO "feedback_items" ("id", "workspace_id", "source_id", "theme_id", "quote", "context_before", "context_after", "customer", "submitter", "speaker", "timestamp_label", "row_ref", "occurred_at", "type", "product_area_id", "severity", "sentiment", "confidence", "review_status", "review_reason", "merged_into_id", "demand_count", "created_at") VALUES ('6f6a1583-c9db-404d-931d-fc314a5d3120', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'bc350a36-c9b7-429f-9bf5-3a0f0ce29b77', '95ae0e00-f5f0-4416-a376-3592b7faeb28', 'Please add a real Export to Excel button — copy-pasting into a sheet destroys our column formatting every single time.', NULL, NULL, 'Northwind', 'J. Rivera', NULL, NULL, NULL, NULL, 'Feature', '3c9800cb-799f-4f81-92fa-9ee4f0341543', 'High', 'Negative', 'High', 'approved', NULL, NULL, 1, '2026-07-27 22:18:06.102+00') ON CONFLICT DO NOTHING;
INSERT INTO "feedback_items" ("id", "workspace_id", "source_id", "theme_id", "quote", "context_before", "context_after", "customer", "submitter", "speaker", "timestamp_label", "row_ref", "occurred_at", "type", "product_area_id", "severity", "sentiment", "confidence", "review_status", "review_reason", "merged_into_id", "demand_count", "created_at") VALUES ('475109f2-fe63-4f64-bfe0-b2cd82700721', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', '4ea4e024-4590-4161-a929-8ba8c41ae272', '95ae0e00-f5f0-4416-a376-3592b7faeb28', 'The team spends 20 minutes a day reformatting exported data. A native xlsx export would be a lifesaver.', NULL, NULL, 'Skyline Ltd', NULL, 'Ops team', '00:12:40', NULL, NULL, 'Feature', '3c9800cb-799f-4f81-92fa-9ee4f0341543', 'Medium', 'Neutral', 'High', 'approved', NULL, NULL, 1, '2026-07-27 22:18:06.102+00') ON CONFLICT DO NOTHING;
INSERT INTO "feedback_items" ("id", "workspace_id", "source_id", "theme_id", "quote", "context_before", "context_after", "customer", "submitter", "speaker", "timestamp_label", "row_ref", "occurred_at", "type", "product_area_id", "severity", "sentiment", "confidence", "review_status", "review_reason", "merged_into_id", "demand_count", "created_at") VALUES ('72e23da5-56ce-4d16-bc02-a0e8b22c8564', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', '5f23861f-bed0-4eb4-9b1d-90c10ec16e8c', '95ae0e00-f5f0-4416-a376-3592b7faeb28', 'Need raw CSV of the utilisation table.', NULL, NULL, 'Globex', NULL, NULL, NULL, 'row 7', NULL, 'Feature', '3c9800cb-799f-4f81-92fa-9ee4f0341543', 'Low', 'Neutral', 'Medium', 'approved', NULL, NULL, 1, '2026-07-27 22:18:06.102+00') ON CONFLICT DO NOTHING;
INSERT INTO "feedback_items" ("id", "workspace_id", "source_id", "theme_id", "quote", "context_before", "context_after", "customer", "submitter", "speaker", "timestamp_label", "row_ref", "occurred_at", "type", "product_area_id", "severity", "sentiment", "confidence", "review_status", "review_reason", "merged_into_id", "demand_count", "created_at") VALUES ('4f621e88-ede2-4770-927f-c95a3ff119c2', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', '5f23861f-bed0-4eb4-9b1d-90c10ec16e8c', '7f97fb5a-acf1-4be4-86ce-8f9e2994c69d', 'Dashboard is confusing, I can never find the saved views.', NULL, NULL, 'Initech', NULL, NULL, NULL, 'row 17', NULL, 'UX', '706a32d9-4e4e-41e0-9182-8fc0b9f4f4b6', 'Medium', 'Negative', 'Medium', 'approved', NULL, NULL, 1, '2026-07-27 22:18:06.102+00') ON CONFLICT DO NOTHING;
INSERT INTO "feedback_items" ("id", "workspace_id", "source_id", "theme_id", "quote", "context_before", "context_after", "customer", "submitter", "speaker", "timestamp_label", "row_ref", "occurred_at", "type", "product_area_id", "severity", "sentiment", "confidence", "review_status", "review_reason", "merged_into_id", "demand_count", "created_at") VALUES ('280db840-a129-4b4c-9a2a-4898cc1b8aed', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'bc350a36-c9b7-429f-9bf5-3a0f0ce29b77', '4f28291c-5b9a-49b2-8ceb-75bad123f6fb', 'The new timeline view is fantastic — it saves our PM a couple of hours every single week.', NULL, NULL, 'Northwind', 'PMO', NULL, NULL, NULL, NULL, 'Praise', '6adb2f20-d737-48db-849f-57414af1ceb4', 'Low', 'Positive', 'High', 'approved', NULL, NULL, 1, '2026-07-27 22:18:06.102+00') ON CONFLICT DO NOTHING;
INSERT INTO "feedback_items" ("id", "workspace_id", "source_id", "theme_id", "quote", "context_before", "context_after", "customer", "submitter", "speaker", "timestamp_label", "row_ref", "occurred_at", "type", "product_area_id", "severity", "sentiment", "confidence", "review_status", "review_reason", "merged_into_id", "demand_count", "created_at") VALUES ('efd6503f-fed3-4308-a82e-87fed5a08488', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', '5f23861f-bed0-4eb4-9b1d-90c10ec16e8c', 'fe6327cb-c6c3-43b7-a8ce-8b3f94579283', 'Customer wants view-only access for external contractors without a full licence.', NULL, NULL, 'Initech', NULL, NULL, NULL, 'row 18', NULL, 'Feature', '3562955d-5d76-40f2-8ae1-ff19d8134858', 'Medium', 'Neutral', 'High', 'approved', NULL, NULL, 1, '2026-07-27 22:18:06.102+00') ON CONFLICT DO NOTHING;
INSERT INTO "feedback_items" ("id", "workspace_id", "source_id", "theme_id", "quote", "context_before", "context_after", "customer", "submitter", "speaker", "timestamp_label", "row_ref", "occurred_at", "type", "product_area_id", "severity", "sentiment", "confidence", "review_status", "review_reason", "merged_into_id", "demand_count", "created_at") VALUES ('91e9d373-9162-4fbf-8a8f-d588797c3cae', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', '4ea4e024-4590-4161-a929-8ba8c41ae272', 'fe6327cb-c6c3-43b7-a8ce-8b3f94579283', 'Security team needs role scoping before we can expand seats.', NULL, NULL, 'Initech', NULL, 'IT lead', '00:31:02', NULL, NULL, 'Feature', '3562955d-5d76-40f2-8ae1-ff19d8134858', 'High', 'Neutral', 'Medium', 'approved', NULL, NULL, 1, '2026-07-27 22:18:06.102+00') ON CONFLICT DO NOTHING;
INSERT INTO "feedback_items" ("id", "workspace_id", "source_id", "theme_id", "quote", "context_before", "context_after", "customer", "submitter", "speaker", "timestamp_label", "row_ref", "occurred_at", "type", "product_area_id", "severity", "sentiment", "confidence", "review_status", "review_reason", "merged_into_id", "demand_count", "created_at") VALUES ('62214cf8-c85e-4495-8494-62f550dd4b3a', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', '4ea4e024-4590-4161-a929-8ba8c41ae272', 'd7441aa0-f99a-4b63-b646-b8cdb3053efb', 'Push notifications are way too noisy — I get pinged for every tiny change anyone makes.', NULL, NULL, 'Skyline Ltd', NULL, 'D. Wolf', '00:23:11', NULL, NULL, 'UX', 'd476bc14-8745-4ac4-b2f6-89a0f48b7f5a', 'Medium', 'Negative', 'High', 'approved', NULL, NULL, 1, '2026-07-27 22:18:06.102+00') ON CONFLICT DO NOTHING;
INSERT INTO "feedback_items" ("id", "workspace_id", "source_id", "theme_id", "quote", "context_before", "context_after", "customer", "submitter", "speaker", "timestamp_label", "row_ref", "occurred_at", "type", "product_area_id", "severity", "sentiment", "confidence", "review_status", "review_reason", "merged_into_id", "demand_count", "created_at") VALUES ('3252db8c-da8d-462a-b563-23b623413749', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'bc350a36-c9b7-429f-9bf5-3a0f0ce29b77', 'd7441aa0-f99a-4b63-b646-b8cdb3053efb', 'Can I mute project-level noise but keep mentions?', NULL, NULL, 'Globex', 'A. Reyes', NULL, NULL, NULL, NULL, 'Feature', 'd476bc14-8745-4ac4-b2f6-89a0f48b7f5a', 'Low', 'Neutral', 'Medium', 'approved', NULL, NULL, 1, '2026-07-27 22:18:06.102+00') ON CONFLICT DO NOTHING;
INSERT INTO "feedback_items" ("id", "workspace_id", "source_id", "theme_id", "quote", "context_before", "context_after", "customer", "submitter", "speaker", "timestamp_label", "row_ref", "occurred_at", "type", "product_area_id", "severity", "sentiment", "confidence", "review_status", "review_reason", "merged_into_id", "demand_count", "created_at") VALUES ('b363e689-c6df-4c09-a39b-4c0e8bdbabc6', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'bc350a36-c9b7-429f-9bf5-3a0f0ce29b77', 'ee104520-da50-46b3-9693-4a53a02f5773', 'Nightly sync fails at 2am with rate-limit errors — we retry for an hour.', NULL, NULL, 'Umbrella', 'Integration eng', NULL, NULL, NULL, NULL, 'Bug', '07d63371-b9b3-4112-8739-2921a2a00fe9', 'High', 'Negative', 'High', 'approved', NULL, NULL, 1, '2026-07-27 22:18:06.102+00') ON CONFLICT DO NOTHING;
INSERT INTO "feedback_items" ("id", "workspace_id", "source_id", "theme_id", "quote", "context_before", "context_after", "customer", "submitter", "speaker", "timestamp_label", "row_ref", "occurred_at", "type", "product_area_id", "severity", "sentiment", "confidence", "review_status", "review_reason", "merged_into_id", "demand_count", "created_at") VALUES ('b06641b9-087e-48f1-be86-e2f7eb60e9bf', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', '7104193b-2d5b-4a72-b1ad-a0f687169be6', 'ee104520-da50-46b3-9693-4a53a02f5773', 'API limits block our reporting pull every Monday.', NULL, NULL, 'Umbrella', NULL, 'Support', '00:19:05', NULL, NULL, 'Bug', '07d63371-b9b3-4112-8739-2921a2a00fe9', 'High', 'Negative', 'High', 'approved', NULL, NULL, 1, '2026-07-27 22:18:06.102+00') ON CONFLICT DO NOTHING;
INSERT INTO "feedback_items" ("id", "workspace_id", "source_id", "theme_id", "quote", "context_before", "context_after", "customer", "submitter", "speaker", "timestamp_label", "row_ref", "occurred_at", "type", "product_area_id", "severity", "sentiment", "confidence", "review_status", "review_reason", "merged_into_id", "demand_count", "created_at") VALUES ('6b159269-158b-488c-bd12-17eaf80fff6a', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', '7104193b-2d5b-4a72-b1ad-a0f687169be6', '2e762d32-902b-4df3-b7f3-012aeb982a14', 'Search cannot find archived projects at all — took us twenty minutes to locate last year’s audit.', NULL, NULL, 'Skyline Ltd', NULL, 'M. Torres', '00:19:05', NULL, NULL, 'UX', '83ba0f19-f4e2-41f3-aac9-f1a6035d5016', 'Medium', 'Negative', 'Medium', 'approved', NULL, NULL, 1, '2026-07-27 22:18:06.102+00') ON CONFLICT DO NOTHING;
INSERT INTO "feedback_items" ("id", "workspace_id", "source_id", "theme_id", "quote", "context_before", "context_after", "customer", "submitter", "speaker", "timestamp_label", "row_ref", "occurred_at", "type", "product_area_id", "severity", "sentiment", "confidence", "review_status", "review_reason", "merged_into_id", "demand_count", "created_at") VALUES ('62a22fac-3f7d-4c22-9bc6-d669f4fc75f9', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'bc350a36-c9b7-429f-9bf5-3a0f0ce29b77', '2e762d32-902b-4df3-b7f3-012aeb982a14', 'Would love search inside attachments.', NULL, NULL, 'Northwind', 'Analyst', NULL, NULL, NULL, NULL, 'Feature', '83ba0f19-f4e2-41f3-aac9-f1a6035d5016', 'Low', 'Neutral', 'Medium', 'approved', NULL, NULL, 1, '2026-07-27 22:18:06.102+00') ON CONFLICT DO NOTHING;
INSERT INTO "feedback_items" ("id", "workspace_id", "source_id", "theme_id", "quote", "context_before", "context_after", "customer", "submitter", "speaker", "timestamp_label", "row_ref", "occurred_at", "type", "product_area_id", "severity", "sentiment", "confidence", "review_status", "review_reason", "merged_into_id", "demand_count", "created_at") VALUES ('46d518c9-f9b1-40a2-a710-7a26663bcb73', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', '63c6820e-d2be-4c62-a460-765c43a95195', NULL, 'Your invoice PDFs render with broken fonts in Windows preview.', NULL, NULL, 'Northwind', 'billing ops', NULL, NULL, NULL, NULL, 'Bug', NULL, 'Medium', 'Negative', 'Medium', 'needs_review', 'arrived unattended', NULL, 1, '2026-07-27 22:18:06.107+00') ON CONFLICT DO NOTHING;
INSERT INTO "feedback_items" ("id", "workspace_id", "source_id", "theme_id", "quote", "context_before", "context_after", "customer", "submitter", "speaker", "timestamp_label", "row_ref", "occurred_at", "type", "product_area_id", "severity", "sentiment", "confidence", "review_status", "review_reason", "merged_into_id", "demand_count", "created_at") VALUES ('e683bdfd-86d5-4d7d-b5cc-0011a49afe90', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', '63c6820e-d2be-4c62-a460-765c43a95195', 'fe6327cb-c6c3-43b7-a8ce-8b3f94579283', 'Can you support SSO for our external auditors?', NULL, NULL, 'Initech', 'IT lead', NULL, NULL, NULL, NULL, 'Feature', NULL, 'High', 'Neutral', 'High', 'needs_review', 'arrived unattended', NULL, 1, '2026-07-27 22:18:06.107+00') ON CONFLICT DO NOTHING;
INSERT INTO "feedback_items" ("id", "workspace_id", "source_id", "theme_id", "quote", "context_before", "context_after", "customer", "submitter", "speaker", "timestamp_label", "row_ref", "occurred_at", "type", "product_area_id", "severity", "sentiment", "confidence", "review_status", "review_reason", "merged_into_id", "demand_count", "created_at") VALUES ('6de5ce49-a09c-4909-a405-e3e6c818def3', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', '4ea4e024-4590-4161-a929-8ba8c41ae272', '7f97fb5a-acf1-4be4-86ce-8f9e2994c69d', 'The numbers feel off sometimes… but maybe it is how we set it up.', NULL, NULL, 'Skyline Ltd', NULL, 'QBR', NULL, NULL, NULL, 'Question', NULL, 'Low', 'Neutral', 'Low', 'needs_review', 'low confidence', NULL, 1, '2026-07-27 22:18:06.107+00') ON CONFLICT DO NOTHING;

INSERT INTO "enhancements" ("id", "workspace_id", "theme_id", "title", "description", "benefit", "effort", "demand", "score", "status", "jira_key", "created_at") VALUES ('59f745cf-f5b5-46d5-b53a-b4e122e19a98', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', '95ae0e00-f5f0-4416-a376-3592b7faeb28', 'Excel & CSV export for dashboards', NULL, 9, 4, 12, '8.7', 'planned', NULL, '2026-07-27 22:18:06.109+00') ON CONFLICT DO NOTHING;
INSERT INTO "enhancements" ("id", "workspace_id", "theme_id", "title", "description", "benefit", "effort", "demand", "score", "status", "jira_key", "created_at") VALUES ('34fb5b24-c570-4a2b-837d-9514e725e9f6', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', '8765afb9-7ec4-4ebd-b573-047ff9a1ca04', 'Dashboard performance overhaul', NULL, 9, 7, 14, '7.9', 'progress', 'ACME-231', '2026-07-27 22:18:06.109+00') ON CONFLICT DO NOTHING;
INSERT INTO "enhancements" ("id", "workspace_id", "theme_id", "title", "description", "benefit", "effort", "demand", "score", "status", "jira_key", "created_at") VALUES ('da6375ea-8117-4f1c-b5cd-21a1791eebd7', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'fe6327cb-c6c3-43b7-a8ce-8b3f94579283', 'View-only contractor role', NULL, 7, 5, 6, '6.4', 'review', NULL, '2026-07-27 22:18:06.109+00') ON CONFLICT DO NOTHING;
INSERT INTO "enhancements" ("id", "workspace_id", "theme_id", "title", "description", "benefit", "effort", "demand", "score", "status", "jira_key", "created_at") VALUES ('fef32d2b-8cf5-4f4d-8f41-dd1eb1792d36', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'd7441aa0-f99a-4b63-b646-b8cdb3053efb', 'Notification preferences centre', NULL, 6, 4, 6, '5.8', 'review', NULL, '2026-07-27 22:18:06.109+00') ON CONFLICT DO NOTHING;
INSERT INTO "enhancements" ("id", "workspace_id", "theme_id", "title", "description", "benefit", "effort", "demand", "score", "status", "jira_key", "created_at") VALUES ('10587541-d52b-49da-acaa-dfe57ee5045c', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'ee104520-da50-46b3-9693-4a53a02f5773', 'API rate-limit tiering', NULL, 7, 6, 5, '6.9', 'review', NULL, '2026-07-27 22:18:06.109+00') ON CONFLICT DO NOTHING;
INSERT INTO "enhancements" ("id", "workspace_id", "theme_id", "title", "description", "benefit", "effort", "demand", "score", "status", "jira_key", "created_at") VALUES ('b3a93616-f504-4629-8154-0ddd017e2f89', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', '4f28291c-5b9a-49b2-8ceb-75bad123f6fb', 'Timeline view improvements', NULL, 8, 3, 8, '7.1', 'shipped', 'ACME-198', '2026-07-27 22:18:06.109+00') ON CONFLICT DO NOTHING;

INSERT INTO "tracker_connections" ("id", "workspace_id", "provider", "project_key", "issue_type", "config", "created_at") VALUES ('22bbe5fa-db9a-46f6-8edd-9900e82ce245', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', 'jira', 'ACME', 'Story', NULL, '2026-07-27 22:18:06.112+00') ON CONFLICT DO NOTHING;

INSERT INTO "ai_configs" ("id", "workspace_id", "scoring_weights", "tagging_prompt", "summary_prompt", "rules", "updated_at") VALUES ('1f1d85a5-6f84-4f51-90a0-fd9428f0dbf4', '0f47c845-a4b2-49f7-83f0-ebb3cc53d0fa', '{"demand":0.4,"effort":0.1,"benefit":0.3,"sentiment":0.2}'::jsonb, 'Classify each feedback item by type (Feature/Bug/UX/Question/Praise), product area, severity and sentiment.', 'Summarise the theme in two sentences, citing verbatim quotes. Never invent detail.', '["Treat mentions of ''invoice'' or ''billing'' as the Billing area","Escalate anything from an enterprise account to High severity"]'::jsonb, '2026-07-27 22:18:06.113+00') ON CONFLICT DO NOTHING;

-- ============ WORKSPACE MEMBERSHIP ============
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
CREATE INDEX "members_user_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
-- Backfill: keep today's access exactly as it is. Until now every user could see
-- every workspace of their tenant, with their user-level role; record that.
INSERT INTO "workspace_members" ("workspace_id", "user_id", "role")
SELECT w."id", u."id", u."role"
FROM "users" u
JOIN "workspaces" w ON w."tenant_id" = u."tenant_id"
ON CONFLICT ("workspace_id", "user_id") DO NOTHING;

-- ============ PER-WORKSPACE AI SETTINGS ============
CREATE TABLE "workspace_ai_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'gemini' NOT NULL,
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
-- One connection per workspace. Only credential-less demo placeholders can
-- exist today (nothing has ever saved a real connection), so if a workspace
-- somehow has more than one, keep the newest.
DELETE FROM "tracker_connections" a USING "tracker_connections" b
WHERE a."workspace_id" = b."workspace_id" AND (a."created_at", a."id") < (b."created_at", b."id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracker_ws_uq" ON "tracker_connections" USING btree ("workspace_id");

-- ============ VIEWER ROLE ============
ALTER TYPE "public"."role" ADD VALUE IF NOT EXISTS 'viewer';

-- ============ INCOMING WEBHOOK ============
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

