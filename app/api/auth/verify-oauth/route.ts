import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const { userId, email } = await req.json();
  if (!userId || !email) {
    return NextResponse.json({ allowed: false, reason: "missing_params" });
  }

  const adminEmails = [
    "tomashanna17@gmail.com",
    "tomas.hanna@vambe.ai",
  ];
  if (adminEmails.includes(email.toLowerCase())) {
    return NextResponse.json({ allowed: true });
  }

  const supabaseAdmin = getAdminClient();

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, project_id, role")
    .eq("id", userId)
    .single();

  if (!profile) {
    return NextResponse.json({ allowed: false, reason: "no_profile" });
  }

  const { count } = await supabaseAdmin
    .from("project_members")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (!profile.project_id && (count ?? 0) === 0) {
    return NextResponse.json({ allowed: false, reason: "not_invited" });
  }

  return NextResponse.json({ allowed: true });
}
