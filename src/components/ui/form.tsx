import { cn } from "./cn";

// 16px text on phones prevents iOS zoom-on-focus; 14px from the sm breakpoint up. Border uses the >=3:1 control token.
const control =
  "rounded-[var(--radius-ctl)] border border-control bg-surface px-3 text-base text-ink placeholder:text-muted disabled:bg-sunken disabled:cursor-not-allowed sm:text-sm";

export function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
      {children}
    </label>
  );
}

export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="[&_input]:w-full [&_select]:w-full [&_textarea]:w-full">{children}</div>
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-priority-critical-fg">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "min-h-11 sm:min-h-10", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-28 resize-y py-2.5 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, "min-h-11 pr-8 sm:min-h-10", className)} {...rest}>
      {children}
    </select>
  );
}
