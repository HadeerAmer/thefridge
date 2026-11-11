import { ActionButton, AdminTitle, Panel } from "@/components/admin/ui";
import { Badge } from "@/components/ui/primitives";
import { relativeTime } from "@/lib/dates";
import { formatEgp } from "@/lib/money";
import { connectDb } from "@/server/db/mongo";
import { listIssues, listProductRequests } from "@/server/feedback";
import { refundIssueAction, resolveIssueAction } from "../actions";

export const metadata = { title: "Issues & requests" };

export default async function AdminFeedback() {
  await connectDb();
  const [issues, requests] = await Promise.all([listIssues(), listProductRequests()]);
  const open = issues.filter((i) => i.status === "open");
  const closed = issues.filter((i) => i.status !== "open");

  return (
    <div className="grid gap-6">
      <AdminTitle title="Issues & requests" subtitle="Refunds go straight to the member's wallet. Requests guide the next restock." />
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Panel title={`Open issues (${open.length})`}>
          {open.length === 0 && <p className="text-sm text-muted">No open issues. 🎉</p>}
          <ul className="grid gap-3">
            {open.map((i) => (
              <li key={i.id} className="rounded-2xl border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {i.kindLabel} · {i.orderNumber}
                  </p>
                  <span className="text-xs text-muted">{relativeTime(i.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm">“{i.message}”</p>
                <p className="mt-1 text-xs text-muted">
                  {i.customer} {i.phone} · {i.items} · {formatEgp(i.orderTotalCents)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton action={refundIssueAction.bind(null, i.id)} variant="primary" confirm={`Refund ${formatEgp(i.orderTotalCents)} to ${i.customer}'s wallet?`}>
                    Refund {formatEgp(i.orderTotalCents)} to wallet
                  </ActionButton>
                  <ActionButton action={resolveIssueAction.bind(null, i.id, "resolved")}>Resolved, no refund</ActionButton>
                  <ActionButton action={resolveIssueAction.bind(null, i.id, "rejected")} variant="ghost">
                    Reject
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
          {closed.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-muted">Closed ({closed.length})</summary>
              <ul className="mt-2 grid gap-1">
                {closed.map((i) => (
                  <li key={i.id} className="flex justify-between gap-2">
                    <span>
                      {i.orderNumber} · {i.kindLabel}
                    </span>
                    <Badge tone={i.status === "refunded" ? "green" : "neutral"}>
                      {i.status}
                      {i.refundCents > 0 && ` ${formatEgp(i.refundCents)}`}
                    </Badge>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Panel>
        <Panel title="What members want next">
          <ol className="grid gap-2">
            {requests.map((r, idx) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl bg-cream px-3 py-2 text-sm">
                <span className="font-display text-lg text-forest">{idx + 1}</span>
                <span className="flex-1">
                  {r.name}
                  {r.note && <span className="block text-xs text-muted">{r.note}</span>}
                </span>
                <span className="font-semibold">👍 {r.votes}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </div>
  );
}
