// Purpose: the thin utility bar and the institutional footer, shared by the public pages and the signed-in workspace.
import Link from "next/link";
import { DEPARTMENT_NAMES } from "@/lib/departments";
import { BRAND } from "@/lib/brand";

/** One-line footer for every page except the landing page. */
export function SlimFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3 text-xs text-muted">
        <p>
          {BRAND.universityName} · {BRAND.serviceName} · Made by Team {BRAND.teamName}
        </p>
        <nav aria-label="Footer" className="flex gap-4">
          <Link href="/help" className="hover:text-ink">Help</Link>
          <Link href="/how-decisions-are-made" className="hover:text-ink">How decisions are made</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}

export function SiteFooter() {
  const depts = Object.entries(DEPARTMENT_NAMES);
  return (
    <footer className="border-t border-line bg-surface text-sm">
      <div className="mx-auto grid max-w-[90rem] gap-8 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-serif text-base font-semibold">{BRAND.universityName}</p>
          <p className="text-muted">{BRAND.unitName}</p>
          <address className="mt-2 not-italic text-muted">
            {BRAND.address.map((l) => (
              <span key={l} className="block">{l}</span>
            ))}
          </address>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">Departments</h2>
          <ul className="space-y-1 text-muted">
            {depts.map(([code, name]) => (
              <li key={code}>{name}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">Help and contact</h2>
          <ul className="space-y-1 text-muted">
            <li><Link href="/help" className="text-brand hover:underline">Help and guides</Link></li>
            <li>{BRAND.email}</li>
            <li>{BRAND.phone}</li>
            <li>{BRAND.hours}</li>
          </ul>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">About this service</h2>
          <ul className="space-y-1">
            <li><Link href="/how-decisions-are-made" className="text-brand hover:underline">How decisions are made</Link></li>
            <li><Link href="/privacy" className="text-brand hover:underline">Privacy</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-[90rem] px-4 py-3 text-xs text-muted">
          © {BRAND.universityName}. {BRAND.serviceName}, powered by {BRAND.productName}. Made by Team {BRAND.teamName}.
        </p>
      </div>
    </footer>
  );
}
