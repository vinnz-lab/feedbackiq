import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireWorkspace } from "@/lib/workspace";
import { getAiKeyStatus } from "@/lib/ai/workspace-key";
import { canEncrypt } from "@/lib/secret-box";
import { appOrigin, connectionView, getJiraConnection } from "@/lib/jira-workspace";
import { AiConnection } from "../settings/ai-connection";
import { JiraConnection } from "../settings/jira-connection";
import { WebhookCard } from "./webhook-card";
import { DigestChannelsCard } from "@/components/digest-channels-card";
import { getChannels } from "@/lib/sharing-data";

export const dynamic = "force-dynamic";

/** Every connection to another app, in one place. Owners connect; everyone sees the status. */
export default async function IntegrationsPage() {
  const ctx = await requireWorkspace();
  const isOwner = ctx.role === "owner";
  const db = await getDb();
  const [aiStatus, jira, [hook], origin, channels] = await Promise.all([
    getAiKeyStatus(ctx.workspace.id),
    getJiraConnection(ctx.workspace.id),
    db.select().from(schema.incomingWebhooks).where(eq(schema.incomingWebhooks.workspaceId, ctx.workspace.id)).limit(1),
    appOrigin(),
    getChannels(ctx.workspace.id),
  ]);

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-[30px] font-bold leading-9 tracking-tight">Integrations</h1>
        <p className="mt-1 text-[13px] text-muted">
          Connect {ctx.workspace.name} to other apps — to bring feedback in, and to send work out.
          {!isOwner && " Only the workspace owner can change these."}
        </p>
      </div>

      <Group title="Bring feedback in">
        <Card icon="🔌" title="Incoming webhook" subtitle="Feedback sent in automatically by other apps — Zapier, Make, Typeform, Google Forms and more.">
          <WebhookCard
            isOwner={isOwner}
            origin={origin}
            view={{
              exists: Boolean(hook),
              enabled: hook?.enabled ?? false,
              hint: hook?.tokenHint ?? null,
              receivedCount: hook?.receivedCount ?? 0,
              lastUsedAt: hook?.lastUsedAt?.toISOString() ?? null,
              createdAt: hook?.createdAt?.toISOString() ?? null,
            }}
          />
        </Card>
        <Soon icon="📧" title="Email forwarding" text="Forward customer emails to the workspace's own address." />
        <Soon icon="💬" title="Collect feedback from Slack" text="Pick up messages from a channel such as #customer-feedback. Works today via Zapier → Incoming webhook." />
      </Group>

      <Group title="Send work out">
        <div id="jira">
          <JiraConnection view={connectionView(jira)} isOwner={isOwner} canSave={canEncrypt()} />
        </div>
        <div id="channels">
          <Card icon="📣" title="Slack & Teams digests" subtitle="Post the weekly digest to a channel with one click from the Digest page — no app to install.">
            <DigestChannelsCard channels={channels} isOwner={isOwner} canSave={canEncrypt()} />
          </Card>
        </div>
        <Soon icon="🧭" title="Linear, Azure DevOps & GitHub Issues" text="Send roadmap items to other delivery tools, like Jira." />
      </Group>

      <Group title="AI">
        <div id="ai">
          <AiConnection
            status={{ ...aiStatus, updatedAt: aiStatus.updatedAt ? aiStatus.updatedAt.toISOString() : null }}
            isOwner={isOwner}
            canSave={canEncrypt()}
          />
        </div>
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-muted">{title}</h2>
      <div className="flex flex-col gap-0">{children}</div>
    </div>
  );
}

function Card({ icon, title, subtitle, children }: { icon: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow)]">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold">
        <span>{icon}</span> {title}
      </h3>
      <p className="mt-1 mb-3 text-[13px] text-muted">{subtitle}</p>
      {children}
    </section>
  );
}

function Soon({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="mb-3 flex items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-border px-4 py-3 text-[13px]">
      <span>{icon}</span>
      <span className="font-semibold">{title}</span>
      <span className="text-muted">{text}</span>
      <span className="ml-auto rounded-[var(--radius-pill)] bg-[var(--slate-soft)] px-2 py-0.5 text-[10.5px] font-bold text-slate">COMING SOON</span>
    </div>
  );
}
