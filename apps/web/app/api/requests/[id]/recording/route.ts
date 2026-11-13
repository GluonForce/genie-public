import { isUuid } from "@/lib/format";
import { apiUser, discardRecording } from "@/lib/requests";
import { getClientIp } from "@/lib/users";

/** Record again (BR-5): deletes the uploaded chunks. Refused once Generate has locked them. */
export async function DELETE(_request: Request, { params }: RouteContext<"/api/requests/[id]/recording">) {
  const user = await apiUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!isUuid(id) || !(await discardRecording(user.id, id, await getClientIp()))) {
    return Response.json({ error: "This recording can no longer be changed." }, { status: 409 });
  }
  return new Response(null, { status: 204 });
}
