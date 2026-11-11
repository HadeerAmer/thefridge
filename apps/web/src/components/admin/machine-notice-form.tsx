"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setNoticeAction } from "@/app/admin/actions";
import { Button } from "../ui/button";

/** Pushes a notice to the machine screen + every app (e.g. "Power outage today"). */
export function MachineNoticeForm({ machineId, notice }: { machineId: string; notice: string | null }) {
  const [value, setValue] = useState(notice ?? "");
  const [pending, start] = useTransition();

  const submit = (message: string | null) =>
    start(async () => {
      const result = await setNoticeAction(machineId, message);
      if (result.ok) toast.success(result.message ?? "Saved");
      else toast.error(result.message);
      if (!message) setValue("");
    });

  return (
    <div className="mt-3 flex gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={280}
        placeholder="Notice for this fridge (shown in the app and on the screen)"
        className="h-9 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-forest"
      />
      <Button size="sm" loading={pending} onClick={() => submit(value)} disabled={!value.trim()}>
        Post
      </Button>
      {notice && (
        <Button size="sm" variant="outline" onClick={() => submit(null)}>
          Clear
        </Button>
      )}
    </div>
  );
}
