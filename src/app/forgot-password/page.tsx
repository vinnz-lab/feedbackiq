import { PrivacyLink } from "@/components/privacy-link";
import { FullLogo } from "@/components/brand";
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
        <div className="mb-7">
          <FullLogo />
        </div>
        <ForgotForm linkProblem={error === "link"} />
        <PrivacyLink className="mt-6" />
      </div>
    </div>
  );
}
