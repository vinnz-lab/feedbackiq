import type { Metadata } from "next";
import Link from "next/link";
import { FullLogo } from "@/components/brand";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Insight Hub handles your data, in plain English.",
};

const UPDATED = "1 November 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-[16px] font-bold tracking-tight">{title}</h2>
      <div className="mt-2 flex flex-col gap-2 text-[14px] leading-relaxed text-[var(--fg)]">{children}</div>
    </section>
  );
}

/** Public privacy summary — readable without signing in. */
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-bg px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Link href="/login" aria-label="Insight Hub — sign in" className="inline-block">
          <FullLogo size={30} />
        </Link>
        <h1 className="mt-8 text-[30px] font-bold leading-9 tracking-tight">Privacy</h1>
        <p className="mt-2 text-[14px] text-muted">How Insight Hub handles your data, in plain English. Last updated {UPDATED}.</p>
        <p className="mt-3 rounded-[10px] border border-border bg-surface px-4 py-3 text-[13px] text-muted">
          Insight Hub is an early-stage product being tested with a small group of people. This page is an honest summary of how it works today —
          not a full legal policy. It will be updated as the product grows.
        </p>

        <Section title="What we store">
          <p>Only what's needed to run the app:</p>
          <ul className="ml-5 list-disc">
            <li><b>The feedback you add</b> — text you paste, files you upload (spreadsheets, emails, documents, transcripts) and anything sent in by an app you connect — plus the themes, roadmap items, digests and audio briefings made from it.</li>
            <li><b>Your account</b> — your name, email address and which workspaces you belong to. Passwords are handled by our sign-in provider and are never visible to us.</li>
            <li><b>Settings and connections</b> — for example an AI key, a Jira connection or a Slack/Teams link. These are stored encrypted and are never shown again after saving, only their last few characters.</li>
            <li><b>An activity record</b> — who did what in a workspace (for example “approved an item” or “sent to Jira”), so the team can see what happened.</li>
          </ul>
        </Section>

        <Section title="Where it's kept">
          <p>
            The database and the app run in the European Union, in Stockholm, Sweden (database by Supabase, hosting by Vercel). Pages may be
            delivered through Vercel&apos;s worldwide network so they load quickly.
          </p>
        </Section>

        <Section title="Who can see it">
          <p>
            Each workspace is completely separate. Only the people who have been added to a workspace can see what&apos;s in it — not other
            customers, and not people in other workspaces. Owners decide who is in their workspace and what each person can do.
          </p>
          <p>
            Something leaves your workspace only when someone in it chooses: creating a read-only share link, posting a digest to Slack or
            Teams, or sending a roadmap item to Jira. Share links can be turned off at any time, and Jira tickets can mask or leave out customer
            names.
          </p>
        </Section>

        <Section title="How AI is used">
          <p>
            To sort feedback, find themes and write summaries, digests and audio briefings, the relevant feedback text is sent to an AI
            provider: Google Gemini by default, or OpenAI or Anthropic (Claude) if your workspace owner adds their own key. Audio voices are made
            by Google Gemini.
          </p>
          <p>
            On their paid plans, these providers say they don&apos;t use what&apos;s sent through their APIs to train their models. If a
            workspace uses its own Google key on Google&apos;s <i>free</i> tier, Google may use that data to improve its products — use a paid
            key if that matters to you.
          </p>
          <p>The AI suggests; people decide. Nothing counts in themes, the roadmap or digests until a person approves it.</p>
        </Section>

        <Section title="Cookies and tracking">
          <p>
            We use only the cookies needed to keep you signed in and remember which workspace you&apos;re in. Your browser also remembers small
            preferences, such as dark mode. There are no advertising cookies and no third-party tracking.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>
            Your data stays until it&apos;s deleted. Audio briefings are deleted automatically after 30 days (and only the 10 newest are kept).
            When something is deleted it&apos;s removed from the live database straight away; it may remain in our providers&apos; routine
            backups for a short time.
          </p>
        </Section>

        <Section title="You're in control">
          <ul className="ml-5 list-disc">
            <li>Workspace owners can download everything in a workspace as one file, at any time, from Settings.</li>
            <li>They can also clear all feedback, delete a workspace entirely, and remove people.</li>
            <li>Turn off share links, Slack/Teams posting, Jira and AI keys whenever you like.</li>
            <li>To have your account removed, or with any question about your data, use the contact options below.</li>
          </ul>
        </Section>

        <Section title="Contact">
          <p>
            If you can sign in, use the <b>💬 Feedback</b> button at the top of any page — it goes straight to the Insight Hub team. Otherwise,
            contact the person who invited you to Insight Hub and they&apos;ll pass it on.
          </p>
        </Section>

        <p className="mt-10 border-t border-border pt-4 text-[12px] text-muted">
          Insight Hub · <Link href="/login" className="font-semibold text-indigo hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
