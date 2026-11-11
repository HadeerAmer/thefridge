import { requireUser } from "@/server/auth/session";
import { IssueInputSchema, reportIssue } from "@/server/feedback";
import { parseJson, route } from "@/server/http";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const session = await requireUser();
  return reportIssue(session.userId, (await params).id, await parseJson(req, IssueInputSchema));
});
