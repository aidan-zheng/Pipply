import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/api-auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const eventIdNum = Number(id);
  if (!Number.isInteger(eventIdNum)) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  let body: { value_text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { value_text } = body;

  const auth = await requireAuth(request);
  if (auth.errorResponse) return auth.errorResponse;
  const { user, admin } = auth;

  // Validate ownership
  const { data: event, error: eventError } = await admin
    .from("application_field_events")
    .select("application_id, applications!inner(user_id)")
    .eq("id", eventIdNum)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const apps = event.applications as unknown as { user_id: string } | { user_id: string }[];
  const ownerUserId = Array.isArray(apps) ? apps[0]?.user_id : apps?.user_id;

  if (ownerUserId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: updateError } = await admin
    .from("application_field_events")
    .update({ value_text: value_text || null })
    .eq("id", eventIdNum);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
