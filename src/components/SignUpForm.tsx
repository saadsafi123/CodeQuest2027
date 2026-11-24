"use client";
// Purpose: sign up = create a brand-new student instantly (POST /api/users) and sign in. No password, no email.
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, useToast } from "@/components/ui";

export function SignUpForm() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (clean.length < 2) return setError("Please enter your name (at least 2 letters).");
    setError(null);
    setBusy(true);
    const res = await fetch("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: clean }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast({ tone: "error", title: "Could not create your account", body: "Is the database connected? Open the judge tools to check." });
    const { user } = await res.json();
    toast({ tone: "success", title: `Welcome, ${user.name.split(" ")[0]}`, body: "Your student account is ready." });
    router.push("/student");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Your name" htmlFor="signup-name" hint="Shown on your dashboard. Your name is never shown to other students or on reports." error={error}>
        <Input id="signup-name" value={name} onChange={(e) => { setName(e.target.value); setError(null); }} maxLength={60} placeholder="e.g. Maryam Ali" autoComplete="name" aria-invalid={!!error} />
      </Field>
      <Button type="submit" size="lg" loading={busy} className="w-full">Create my account <ArrowRight className="size-4" aria-hidden /></Button>
    </form>
  );
}
