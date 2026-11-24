import { cn } from "./cn";

/** Flat data table. Scrolls inside its own box on small screens (never the page); the header stays visible while the box scrolls. */
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("max-h-[70vh] overflow-auto rounded-[var(--radius-card)] border border-line bg-surface", className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}
export const THead = ({ children }: { children: React.ReactNode }) => <thead className="sticky top-0 z-[1] border-b border-line bg-sunken text-xs text-muted">{children}</thead>;
export const TH = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <th scope="col" className={cn("whitespace-nowrap px-4 py-2.5 font-medium", className)}>
    {children}
  </th>
);
export const TBody = ({ children }: { children: React.ReactNode }) => <tbody className="divide-y divide-line">{children}</tbody>;
export const TR = ({ children, className }: { children: React.ReactNode; className?: string }) => <tr className={cn("hover:bg-page", className)}>{children}</tr>;
export const TD = ({ children, className }: { children?: React.ReactNode; className?: string }) => <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
