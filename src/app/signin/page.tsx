// Sign in (no password): choose a role, then an account. Lands on that role's own dashboard.
import { Art } from "@/components/ui";
import { SignInFlow } from "@/components/SignInFlow";
import { getCurrentUser } from "@/lib/auth";
import { isDbConfigured } from "@/lib/db/supabase";
import { listUsers } from "@/lib/services/userService";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · ReportFix" };

export default async function SignInPage() {
  const current = await getCurrentUser();
  const users = isDbConfigured() ? await listUsers().catch(() => []) : [];
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">Welcome back</h1>
          <p className="mt-1 text-muted">Pick who you are. This demo has no passwords.</p>
        </div>
        <Art name="chat" className="hidden h-24 sm:block" />
      </div>
      <SignInFlow users={users.map((u) => ({ id: u.id, name: u.name, role: u.role, department: u.department, trustScore: u.trustScore }))} currentId={current?.id ?? null} />
      <p className="mt-8 text-center text-sm text-muted">New here? <Link href="/signup" className="font-semibold text-brand-700 hover:underline">Create a student account</Link></p>
    </div>
  );
}
