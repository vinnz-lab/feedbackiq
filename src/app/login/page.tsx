import { PrivacyLink } from "@/components/privacy-link";
import { FullLogo } from "@/components/brand";
import { listUsers, ROLE_LABEL, initials } from "@/lib/auth";
import { authMode } from "@/lib/supabase/env";
import { signInAs } from "./actions";
import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const mode = authMode();

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md">
        <div className="mb-7">
          <FullLogo />
        </div>

        {mode === "supabase" && <PasswordForm />}
        {mode === "dev" && <DevPicker />}
        {mode === "unconfigured" && <NotConfigured />}

        <p className="mt-4 text-center text-[11.5px] text-muted">Every customer voice. One clear roadmap.</p>
        <PrivacyLink className="mt-2" />
      </div>
    </div>
  );
}

async function DevPicker() {
  const users = await listUsers();
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow)]">
      <h1 className="text-[17px] font-semibold">Choose a profile</h1>
      <p className="mt-1 mb-4 text-[13px] text-muted">
        Development sign-in — pick a role to explore the permission model. Real email and
        password sign-in is active once Supabase Auth is configured.
      </p>

      <div className="flex flex-col gap-2.5">
        {users.map((u) => {
          const signIn = signInAs.bind(null, u.id);
          return (
            <form key={u.id} action={signIn}>
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-[var(--radius-btn)] border border-border bg-surface px-4 py-3 text-left transition hover:border-indigo hover:bg-hover"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo text-[12px] font-bold text-white">
                  {initials(u.name)}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold">{u.name}</span>
                  <span className="text-[12px] text-muted">{ROLE_LABEL[u.role]}</span>
                </span>
                <span className="text-muted">→</span>
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}

/** Deployed without auth settings. Fail closed and say exactly what's missing. */
function NotConfigured() {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow)]">
      <h1 className="text-[17px] font-semibold">Sign-in isn&apos;t configured</h1>
      <p className="mt-1 text-[13px] text-muted">
        This deployment has no authentication settings, so it can&apos;t let anyone in.
      </p>
      <div className="mt-4 rounded-[10px] border border-border bg-bg p-3.5 text-[12px] leading-relaxed">
        Add these to your hosting environment variables:
        <ul className="mt-2 flex flex-col gap-1 font-mono text-[11.5px]">
          <li>NEXT_PUBLIC_SUPABASE_URL</li>
          <li>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</li>
          <li>SUPABASE_SERVICE_ROLE_KEY</li>
        </ul>
      </div>
    </div>
  );
}
