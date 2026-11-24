// Purpose: server entry of the app frame. Passes the current user and the (server-rendered) system status chip to the
// client frame, which picks the public layout or the role workspace (sidebar) by route.
import type { User } from "@/lib/db/repositories";
import { AppFrame } from "./AppFrame";
import { StatusChip } from "./StatusChip";

export function AppShell({ user, children }: { user: User | null; children: React.ReactNode }) {
  return (
    <AppFrame user={user ? { id: user.id, name: user.name, role: user.role, department: user.department, trustScore: user.trustScore } : null} status={<StatusChip />}>
      {children}
    </AppFrame>
  );
}
