import { listUsers, ROLE_LABEL, initials } from "@/lib/auth";
import { signInAs } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const users = await listUsers();

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md">
        <div className="mb-7 flex items-center justify-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
            style={{ background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }}
          >
            ✦
          </div>
          <span className="text-[22px] font-extrabold tracking-tight">FeedbackIQ</span>
        </div>

        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow)]">
          <h1 className="text-[17px] font-semibold">Choose a profile</h1>
          <p className="mt-1 mb-4 text-[13px] text-muted">
            Dev sign-in for the POC — pick a role to explore the permission model.
            Real email + SSO login arrives at deploy.
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
        <p className="mt-4 text-center text-[11.5px] text-muted">
          FeedbackIQ · POC build · simulated data
        </p>
      </div>
    </div>
  );
}
