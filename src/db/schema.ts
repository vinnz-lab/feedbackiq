import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ============================ Enums ============================ */
export const roleEnum = pgEnum("role", [
  "owner", // Product Owner / admin — full access
  "contributor", // bulk-enters feedback, triages
  "executive", // dashboards, trends, roadmap (read + comment)
  "engineer", // browses themes + evidence (read)
]);

export const sourceKindEnum = pgEnum("source_kind", [
  "email",
  "recording",
  "transcript",
  "spreadsheet",
  "note",
  "paste",
]);

export const sourceStatusEnum = pgEnum("source_status", [
  "queued",
  "processing",
  "processed",
  "failed",
]);

export const feedbackTypeEnum = pgEnum("feedback_type", [
  "Feature",
  "Bug",
  "UX",
  "Question",
  "Praise",
]);

export const sentimentEnum = pgEnum("sentiment", ["Positive", "Neutral", "Negative"]);
export const priorityEnum = pgEnum("priority", ["High", "Medium", "Low"]);
export const confidenceEnum = pgEnum("confidence", ["High", "Medium", "Low"]);

// Convenience literal-union types derived from the enums
export type FeedbackTypeT = (typeof feedbackTypeEnum.enumValues)[number];
export type SentimentT = (typeof sentimentEnum.enumValues)[number];
export type PriorityT = (typeof priorityEnum.enumValues)[number];
export type ConfidenceT = (typeof confidenceEnum.enumValues)[number];
export type EnhancementStatusT = (typeof enhancementStatusEnum.enumValues)[number];
export type RoleT = (typeof roleEnum.enumValues)[number];

export const reviewStatusEnum = pgEnum("review_status", [
  "needs_review", // unattended arrival or low-confidence — awaiting a human
  "approved", // confirmed as fact; counts in themes/dashboards/digests
  "discarded",
]);

export const enhancementStatusEnum = pgEnum("enhancement_status", [
  "review",
  "planned",
  "progress",
  "shipped",
  "wontdo",
]);

/* ============================ Tenancy ============================ */
// Tenant = a customer org (SaaS-ready). Workspace = one product ("Acme App").
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  forwardingAddress: text("forwarding_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull().default("owner"),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Who may see which workspace, and with what role there.
 *
 * Access is decided ONLY by this table. A user with no row here for a workspace
 * cannot see anything in it — including the platform owner, by design: testers
 * and (later) clients must be able to trust that their feedback is private.
 * users.role is legacy and no longer used for permissions.
 */
export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("contributor"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("members_ws_user_uq").on(t.workspaceId, t.userId),
    index("members_user_idx").on(t.userId),
  ],
);

/* ============================ Taxonomy ============================ */
export const productAreas = pgTable("product_areas", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  aiProposed: boolean("ai_proposed").default(false).notNull(),
  approved: boolean("approved").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ============================ Sources ============================ */
export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    kind: sourceKindEnum("kind").notNull(),
    filename: text("filename").notNull(),
    storagePath: text("storage_path"), // object-storage key for the raw file
    status: sourceStatusEnum("status").notNull().default("queued"),
    autoIngested: boolean("auto_ingested").default(false).notNull(),
    itemCount: integer("item_count").default(0).notNull(),
    note: text("note"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("sources_workspace_idx").on(t.workspaceId)],
);

/* ============================ Themes ============================ */
export const themes = pgTable(
  "themes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary"),
    type: feedbackTypeEnum("type"),
    sentiment: sentimentEnum("sentiment"),
    priority: priorityEnum("priority"),
    deltaPct: integer("delta_pct").default(0).notNull(), // week-over-week trend
    isEmerging: boolean("is_emerging").default(false).notNull(),
    pinned: boolean("pinned").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("themes_workspace_idx").on(t.workspaceId)],
);

/* ============================ Feedback items ============================ */
export const feedbackItems = pgTable(
  "feedback_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "cascade" }),
    themeId: uuid("theme_id").references(() => themes.id, { onDelete: "set null" }),

    quote: text("quote").notNull(),
    contextBefore: text("context_before"),
    contextAfter: text("context_after"),

    // provenance / source locator (citations are first-class)
    customer: text("customer"),
    submitter: text("submitter"),
    speaker: text("speaker"), // meeting diarization
    timestampLabel: text("timestamp_label"), // e.g. 00:14:32
    rowRef: text("row_ref"), // e.g. spreadsheet row 23
    occurredAt: timestamp("occurred_at", { withTimezone: true }),

    // AI classification (suggestion vs confirmed captured via reviewStatus)
    type: feedbackTypeEnum("type"),
    productAreaId: uuid("product_area_id").references(() => productAreas.id, { onDelete: "set null" }),
    severity: priorityEnum("severity"),
    sentiment: sentimentEnum("sentiment"),
    confidence: confidenceEnum("confidence"),
    reviewStatus: reviewStatusEnum("review_status").notNull().default("needs_review"),
    reviewReason: text("review_reason"), // "arrived unattended" | "low confidence"

    // dedup / demand
    mergedIntoId: uuid("merged_into_id"),
    demandCount: integer("demand_count").default(1).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("items_workspace_idx").on(t.workspaceId),
    index("items_theme_idx").on(t.themeId),
    index("items_review_idx").on(t.reviewStatus),
  ],
);

/* ============================ Enhancements + evidence ============================ */
export const enhancements = pgTable(
  "enhancements",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    themeId: uuid("theme_id").references(() => themes.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    benefit: integer("benefit").default(5).notNull(),
    effort: integer("effort").default(5).notNull(),
    demand: integer("demand").default(0).notNull(),
    score: numeric("score", { precision: 4, scale: 1 }).default("0").notNull(),
    status: enhancementStatusEnum("status").notNull().default("review"),
    jiraKey: text("jira_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("enh_workspace_idx").on(t.workspaceId)],
);

export const evidenceLinks = pgTable("evidence_links", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  enhancementId: uuid("enhancement_id").notNull().references(() => enhancements.id, { onDelete: "cascade" }),
  feedbackItemId: uuid("feedback_item_id").notNull().references(() => feedbackItems.id, { onDelete: "cascade" }),
});

/* ============================ Integrations, digests, audit, config ============================ */
export const trackerConnections = pgTable("tracker_connections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("jira"),
  projectKey: text("project_key"),
  issueType: text("issue_type").default("Story"),
  config: jsonb("config"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const digests = pgTable("digests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  content: jsonb("content"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorLabel: text("actor_label"), // "AI" or a person's name
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("audit_workspace_idx").on(t.workspaceId)],
);

// The editable AI "brain" the user tunes without a deploy (prompts, rules, weights).
export const aiConfigs = pgTable("ai_configs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  scoringWeights: jsonb("scoring_weights"), // {demand, sentiment, benefit, effort}
  taggingPrompt: text("tagging_prompt"),
  summaryPrompt: text("summary_prompt"),
  rules: jsonb("rules"), // e.g. ["treat 'invoice' as Billing"]
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
