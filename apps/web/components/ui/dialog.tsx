"use client";

import { useEffect, useRef } from "react";

type DialogProps = Omit<React.ComponentProps<"dialog">, "open" | "onClose"> & {
  open: boolean;
  /** Called when the dialog closes, including by the Escape key */
  onClose: () => void;
};

/**
 * A modal dialog built on the native <dialog> element, which handles focus,
 * the Escape key and blocking the page behind it. Label it with aria-labelledby.
 */
export function Dialog({ open, onClose, className = "", children, ...props }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={`m-auto w-[calc(100%-32px)] max-w-[640px] rounded-[28px] bg-white p-6 text-navy backdrop:bg-backdrop sm:p-10 ${className}`}
      {...props}
    >
      {children}
    </dialog>
  );
}
