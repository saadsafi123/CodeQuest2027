// Sign up: creates a student instantly (no password) and lands on the student dashboard.
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui";
import { SignUpForm } from "@/components/SignUpForm";
import { config } from "@/lib/config";

export const metadata = { title: "Get started · ReportFix" };

export default function SignUpPage() {
  return (
    <div className="mx-auto grid max-w-4xl items-center gap-10 md:grid-cols-[1fr_1fr]">
      <div>
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">Create your student account</h1>
        <p className="mt-2 text-muted">It takes a few seconds. No password and no email.</p>
        <ul className="mt-6 space-y-3 text-sm text-ink-soft">
          {[
            "Report a problem in your own words",
            "Watch it move from reported to confirmed",
            `Start with a trust score of ${config.trust.base}. It rises when your reports and votes prove right`,
            "Vote on whether a fix really worked when it affects you",
          ].map((t) => (
            <li key={t} className="flex gap-2.5"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok-600" aria-hidden />{t}</li>
          ))}
        </ul>
      </div>
      <Card>
        <CardBody className="p-6">
          <SignUpForm />
          <p className="mt-4 text-center text-sm text-muted">Already have an account? <Link href="/signin" className="font-semibold text-brand-700 hover:underline">Sign in</Link></p>
        </CardBody>
      </Card>
    </div>
  );
}
