import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  // Verify the caller is an authenticated admin via Bearer token
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Validate the token and check admin role
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: callerProfile } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerProfile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { email, full_name, company_name } = body as {
    email: string;
    full_name?: string;
    company_name?: string;
  };

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const redirectTo =
    (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000") + "/reset-password";

  // Invite user — this creates an auth.users entry and sends the email
  const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    { redirectTo }
  );
  if (inviteErr) {
    return NextResponse.json({ error: inviteErr.message }, { status: 400 });
  }

  const newUserId = inviteData.user.id;

  // Upsert profile with name/company/invited_at
  await supabaseAdmin.from("profiles").upsert(
    {
      id: newUserId,
      full_name: full_name ?? null,
      company_name: company_name ?? null,
      role: "client",
      invited_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  return NextResponse.json({ success: true, userId: newUserId });
}
