"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { creditCustomerAction } from "@/app/admin/actions";
import { Button } from "../ui/button";

export function CreditButton({ userId, name }: { userId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      loading={pending}
      onClick={() => {
        const amount = Number(window.prompt(`Wallet credit for ${name} (EGP):`, "50"));
        if (!amount || amount <= 0) return;
        const reason = window.prompt("Reason (the customer sees this):", "Sorry about your last order") ?? "";
        start(async () => {
          const result = await creditCustomerAction(userId, Math.round(amount), reason);
          if (result.ok) toast.success(result.message ?? "Credited");
          else toast.error(result.message);
        });
      }}
    >
      + Credit
    </Button>
  );
}
