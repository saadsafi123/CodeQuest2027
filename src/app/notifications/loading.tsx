import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-56" />
      {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
    </div>
  );
}
