"use client";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/** Accessible dialog (native <dialog>): focus trap, Escape to close, backdrop click to close. */
export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="rf-modal-title"
      className="m-auto w-[min(92vw,30rem)] text-left rounded-[var(--radius-card)] border border-line bg-surface p-0 text-ink shadow-[var(--shadow-pop)] backdrop:bg-scrim"
    >
      {open && (
        <div className="rf-pop-in">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 id="rf-modal-title" className="text-base font-semibold">
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 place-items-center rounded-[var(--radius-ctl)] text-muted hover:bg-sunken hover:text-ink sm:size-9">
              <X className="size-5" />
            </button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line bg-page px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
