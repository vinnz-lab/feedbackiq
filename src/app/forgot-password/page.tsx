import { ForgotForm } from "./forgot-form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md">
        <div className="mb-7 flex items-center justify-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ background: "linear-gradient(135deg,#4F46E5,#7C3AED)" }}>✦</div>
          <span className="text-[22px] font-extrabold tracking-tight">FeedbackIQ</span>
        </div>
        <ForgotForm linkProblem={error === "link"} />
      </div>
    </div>
  );
}
