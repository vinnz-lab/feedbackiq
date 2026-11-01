import { FullLogo } from "@/components/brand";
import { redirect } from "next/navigation";
import { authMode } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { ChooseForm } from "./choose-form";

export const dynamic = "force-dynamic";

export default async function ChoosePasswordPage() {
  if (authMode() !== "supabase") redirect("/dashboard");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if ((data.user.app_metadata as { must_change_password?: unknown } | undefined)?.must_change_password !== true) {
    redirect("/dashboard");
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md">
        <div className="mb-7">
          <FullLogo />
        </div>
        <ChooseForm email={data.user.email ?? ""} />
        <form action={signOut} className="mt-4 text-center">
          <button className="text-[12px] font-semibold text-muted hover:text-fg">Sign out</button>
        </form>
      </div>
    </div>
  );
}
