import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = ["tomashanna17@gmail.com", "tomas.hanna@vambe.ai"];

function decodeJWT(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Extract + decode the caller's JWT
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const claims = decodeJWT(token);
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized: invalid token" }, { status: 401 });
  }

  // Check expiry
  const exp = claims.exp as number | undefined;
  if (exp && exp * 1000 < Date.now()) {
    return NextResponse.json({ error: "Unauthorized: token expired" }, { status: 401 });
  }

  const callerEmail = (claims.email as string | undefined) ?? "";
  const callerId = (claims.sub as string | undefined) ?? "";

  // Verify admin via email (fast path) or profiles table (fallback)
  let isAdmin = ADMIN_EMAILS.includes(callerEmail);
  if (!isAdmin && callerId) {
    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .single();
    isAdmin = p?.role === "admin";
  }

  if (!isAdmin) {
    return NextResponse.json({ error: `Forbidden (email: ${callerEmail})` }, { status: 403 });
  }

  const body = await req.json();
  const { email, full_name, company_name, template_id, section_ids } = body as {
    email: string;
    full_name?: string;
    company_name?: string;
    template_id?: number | null;
    section_ids?: number[] | null;
  };

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const redirectTo =
    (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000") + "/reset-password";

  const { data: inviteData, error: inviteErr } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (inviteErr) {
    return NextResponse.json({ error: inviteErr.message }, { status: 400 });
  }

  const newUserId = inviteData.user.id;

  await supabaseAdmin.from("profiles").upsert(
    {
      id: newUserId,
      full_name: full_name ?? null,
      company_name: company_name ?? null,
      role: "client",
      invited_at: new Date().toISOString(),
      template_id: template_id ?? null,
    },
    { onConflict: "id" }
  );

  // Assign sections from template if provided
  if (template_id) {
    let query = supabaseAdmin.from("template_sections").select("*").eq("template_id", template_id);
    const { data: ts } = await query;
    const rows = (ts ?? [])
      .filter((row) => !section_ids || section_ids.includes(row.section_id))
      .map((row) => ({
        client_id: newUserId,
        section_id: row.section_id,
        custom_description: row.custom_description,
        display_order: row.display_order,
      }));
    if (rows.length > 0) {
      await supabaseAdmin.from("client_sections").insert(rows);
    }
  }

  return NextResponse.json({ success: true, userId: newUserId });
}
