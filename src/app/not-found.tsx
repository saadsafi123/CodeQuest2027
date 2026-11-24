import { SearchX } from "lucide-react";
import { EmptyState, LinkButton } from "@/components/ui";

export default function NotFound() {
  return <EmptyState title="Not found" description="That page does not exist, or you do not have access to it." icon={<SearchX className="size-6" aria-hidden />} action={<LinkButton href="/">Back to start</LinkButton>} />;
}
