"use client";
import { Alert, Button } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Alert tone="danger" title="Something went wrong">We could not load this page. Check the status chip at the top (database / AI), then try again.</Alert>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
