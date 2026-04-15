import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = ["tomashanna17@gmail.com", "tomas.hanna@vambe.ai"];

function decodeJWT(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(
      parts[1].replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf-8");
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

  // Verify caller is admin via JWT
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const claims = decodeJWT(token);
  if (!claims) {
    return NextResponse.json({ error: "No autorizado: token inválido" }, { status: 401 });
  }

  const exp = claims.exp as number | undefined;
  if (exp && exp * 1000 < Date.now()) {
    return NextResponse.json({ error: "No autorizado: token expirado" }, { status: 401 });
  }

  const callerEmail = (claims.email as string | undefined) ?? "";
  const callerId = (claims.sub as string | undefined) ?? "";

  let isAdmin = ADMIN_EMAILS.includes(callerEmail);
  if (!isAdmin && callerId) {
    const supabaseForCheck = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: p } = await supabaseForCheck
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .single();
    isAdmin = p?.role === "admin";
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "No autorizado — solo admins" }, { status: 403 });
  }

  const { email } = await req.json();
  if (!email) {
    return NextResponse.json({ error: "email requerido" }, { status: 400 });
  }

  // Find user by email via auth admin API
  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) {
    return NextResponse.json({ error: "Error al buscar usuario" }, { status: 500 });
  }

  const foundUser = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!foundUser) {
    return NextResponse.json({ error: `No se encontró ningún usuario con email: ${email}` }, { status: 404 });
  }

  // Fetch profile for full_name
  const supabaseForProfile = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: profileData } = await supabaseForProfile
    .from("profiles")
    .select("full_name, company_name")
    .eq("id", foundUser.id)
    .maybeSingle();

  return NextResponse.json({
    userId: foundUser.id,
    email: foundUser.email,
    fullName: profileData?.full_name ?? null,
    companyName: profileData?.company_name ?? null,
  });
}
