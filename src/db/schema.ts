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
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ============================ Enums ============================ */
export const roleEnum = pgEnum("role", [
  "owner", // Product Owner / admin — full access
  "contributor", // bulk-enters feedback, triages
  "executive", // dashboards, trends, roadmap (read + comment)
  "engineer", // browses themes + evidence (read)
  "viewer", // read-only: sees everything, changes nothing
]);

export const sourceKindEnum = pgEnum("source_kind", [
  "email",
  "recording",
  "transcript",
  "spreadsheet",
  "note",
  "paste",
  "webhook", // sent in by another app (Zapier, Make, Typeform…)
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

/**
 * Per-workspace AI settings: the workspace's OWN Gemini key (encrypted), and
 * whether it may fall back to the platform owner's key.
 *
 * No row = defaults: no own key, platform key allowed. The key is stored only
 * as AES-256-GCM ciphertext; the app never shows or logs it after saving, and
 * it is deliberately excluded from workspace backups.
 */
export const workspaceAiSettings = pgTable("workspace_ai_settings", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("gemini"),
  /** The provider's model to use; null = that provider's recommended default. */
  model: text("model"),
  encryptedKey: text("encrypted_key"),
  keyLast4: text("key_last4"),
  allowPlatformKey: boolean("allow_platform_key").notNull().default(true),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A workspace's incoming webhook: a private address other apps can send
 * feedback to. Only a SHA-256 hash of the secret is stored — the address is
 * shown once when created, like a password, and can be regenerated.
 */
export const incomingWebhooks = pgTable(
  "incoming_webhooks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    tokenHint: text("token_hint").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    receivedCount: integer("received_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    windowStart: timestamp("window_start", { withTimezone: true }),
    windowCount: integer("window_count").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("webhooks_ws_uq").on(t.workspaceId), uniqueIndex("webhooks_token_uq").on(t.tokenHash)],
);

/* ============================ Taxonomy ============================ */
/**
 * Where a workspace's digest can be posted: a Slack or Microsoft Teams channel,
 * by the channel's incoming-webhook address. The address lets anyone post to
 * that channel, so it's stored encrypted (lib/secret-box.ts) and only a short
 * hint is ever shown again.
 */
export const digestChannels = pgTable(
  "digest_channels",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // "slack" | "teams"
    encryptedUrl: text("encrypted_url").notNull(),
    urlHint: text("url_hint").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastPostedAt: timestamp("last_posted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("digest_channels_ws_kind_uq").on(t.workspaceId, t.kind)],
);

/**
 * A read-only link to a workspace's latest digest or its roadmap, for people
 * without an account. Looked up by a SHA-256 hash of the secret; the secret is
 * also kept encrypted so the owner can copy the link again. Turning a link off
 * deletes the row, so the old address stops working for good.
 */
export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // "digest" | "roadmap"
    tokenHash: text("token_hash").notNull(),
    encryptedToken: text("encrypted_token").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    viewCount: integer("view_count").default(0).notNull(),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("share_links_ws_kind_uq").on(t.workspaceId, t.kind), uniqueIndex("share_links_token_uq").on(t.tokenHash)],
);

/** Raw bytes (Postgres bytea). Used only for small, short-lived audio files. */
const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (v) => (Buffer.isBuffer(v) ? v : Buffer.from(v)),
});

/**
 * Podcast-style audio briefings: two AI hosts talking through the feedback
 * behind a few chosen themes. Only the 10 newest per workspace are kept, and
 * each expires 30 days after it was made (see lib/briefings.ts).
 */
export const audioBriefings = pgTable(
  "audio_briefings",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    themeIds: jsonb("theme_ids").notNull(),
    themeTitles: jsonb("theme_titles").notNull(),
    length: text("length").notNull().default("balanced"),
    nameMode: text("name_mode").notNull().default("mask"),
    /** writing → voicing → ready (or failed) */
    status: text("status").notNull().default("writing"),
    error: text("error"),
    script: jsonb("script"),
    hasAudio: boolean("has_audio").notNull().default(false),
    durationSec: integer("duration_sec"),
    sizeBytes: integer("size_bytes"),
    /** Which key voiced it: "workspace" | "platform" | null (script only). */
    voiceSource: text("voice_source"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("briefings_ws_idx").on(t.workspaceId, t.createdAt)],
);

/** The MP3 for a briefing, kept apart so listing briefings never loads audio. */
export const audioFiles = pgTable("audio_files", {
  briefingId: uuid("briefing_id")
    .primaryKey()
    .references(() => audioBriefings.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  mp3: bytea("mp3").notNull(),
});

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
    jiraUrl: text("jira_url"),
    jiraStatus: text("jira_status"),
    jiraStatusCategory: text("jira_status_category"),
    jiraSyncedAt: timestamp("jira_synced_at", { withTimezone: true }),
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
/**
 * A workspace's Jira Cloud connection (one per workspace).
 * The API token is stored only as AES-256-GCM ciphertext (lib/secret-box.ts),
 * never shown again after saving, and never included in backups.
 */
export const trackerConnections = pgTable(
  "tracker_connections",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("jira"),
    projectKey: text("project_key"),
    issueType: text("issue_type").default("Story"),
    config: jsonb("config"),
    siteUrl: text("site_url"),
    authEmail: text("auth_email"),
    encryptedToken: text("encrypted_token"),
    tokenLast4: text("token_last4"),
    /** How customer names appear in tickets: include | mask | remove. */
    nameMode: text("name_mode").notNull().default("include"),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("tracker_ws_uq").on(t.workspaceId)],
);

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
