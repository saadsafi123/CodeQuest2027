// /judge: the three judge actions, plainly and prominently.
import { UserRoundCog } from "lucide-react";
import { ContinueCard } from "@/components/ContinueCard";
import { CreateStudentCard, ResetCard } from "@/components/JudgeActions";
import { Card, CardBody, EmptyState, PageHeader } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { isDbConfigured } from "@/lib/db/supabase";
import { listUsers } from "@/lib/services/userService";

export const dynamic = "force-dynamic";

export default async function JudgePage() {
  const current = await getCurrentUser();
  const users = isDbConfigured() ? await listUsers().catch(() => []) : [];
  return (
    <div className="space-y-8">
      <PageHeader title="Judge access" description="Everything you need to test ReportFix in three moves. No passwords anywhere." />
      <div className="grid gap-4 md:grid-cols-2">
        <CreateStudentCard />
        <ResetCard />
      </div>
      <section aria-labelledby="switch" className="space-y-3">
        <div className="flex items-center gap-2">
          <UserRoundCog className="size-5 text-brand-600" aria-hidden />
          <h2 id="switch" className="text-xl font-semibold">1. Switch to any user</h2>
        </div>
        {users.length === 0 ? (
          <EmptyState title="No users found" description="Reset the data to load the demo users, or check the database status chip." />
        ) : (
          <Card>
            <CardBody>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {users.map((u) => <ContinueCard key={u.id} user={u} current={current?.id === u.id} />)}
              </div>
            </CardBody>
          </Card>
        )}
      </section>
    </div>
  );
}
