"use client";

import type { ReactNode } from "react";
import { Drawer } from "vaul";

/** Bottom sheet — the main overlay pattern on mobile. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-forest-ink/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] max-w-[480px] flex-col rounded-t-[28px] bg-paper outline-none">
          <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-line" />
          <div className="px-5 pt-3">
            <Drawer.Title className="font-display text-2xl tracking-wide text-forest-dark uppercase">{title}</Drawer.Title>
            <Drawer.Description className={description ? "mt-1 text-sm text-muted" : "sr-only"}>{description ?? title}</Drawer.Description>
          </div>
          <div className="overflow-y-auto px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
