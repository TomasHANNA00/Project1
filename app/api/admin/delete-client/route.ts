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
    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .single();
    isAdmin = p?.role === "admin";
  }

  if (!isAdmin) {
    return NextResponse.json({ error: "No autorizado — solo admins" }, { status: 403 });
  }

  // Parse body
  const { clientId } = await req.json();
  if (!clientId) {
    return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  }

  // Prevent deleting self or other admins
  if (clientId === callerId) {
    return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 403 });
  }

  const { data: targetProfile } = await supabaseAdmin
    .from("profiles")
    .select("role, full_name, email")
    .eq("id", clientId)
    .single();

  if (!targetProfile) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  if (targetProfile.role === "admin") {
    return NextResponse.json({ error: "No puedes eliminar un administrador" }, { status: 403 });
  }

  try {
    // ── Cascade delete ────────────────────────────────────────────

    const { data: projects } = await supabaseAdmin
      .from("client_projects")
      .select("id")
      .eq("client_id", clientId);

    for (const project of projects ?? []) {
      const { data: phases } = await supabaseAdmin
        .from("client_phases")
        .select("id")
        .eq("project_id", project.id);

      const phaseIds = (phases ?? []).map((p) => p.id);

      if (phaseIds.length > 0) {
        const { data: tasks } = await supabaseAdmin
          .from("client_tasks")
          .select("id")
          .in("phase_id", phaseIds);

        const taskIds = (tasks ?? []).map((t) => t.id);

        if (taskIds.length > 0) {
          const { data: questions } = await supabaseAdmin
            .from("task_questions")
            .select("id")
            .in("task_id", taskIds);

          const questionIds = (questions ?? []).map((q) => q.id);

          if (questionIds.length > 0) {
            await supabaseAdmin.from("task_files").delete().in("question_id", questionIds);
            await supabaseAdmin.from("task_responses").delete().in("question_id", questionIds);
          }

          await supabaseAdmin.from("task_questions").delete().in("task_id", taskIds);
          await supabaseAdmin.from("task_validations").delete().in("task_id", taskIds);
        }

        await supabaseAdmin.from("phase_files").delete().in("phase_id", phaseIds);
        await supabaseAdmin.from("client_tasks").delete().in("phase_id", phaseIds);
        await supabaseAdmin.from("client_phases").delete().eq("project_id", project.id);
      }

      await supabaseAdmin.from("client_projects").delete().eq("id", project.id);
    }

    // Legacy data
    await supabaseAdmin.from("submission_files").delete().eq("client_id", clientId);
    await supabaseAdmin.from("submissions").delete().eq("client_id", clientId);
    await supabaseAdmin.from("pipeline_items").delete().eq("client_id", clientId);
    await supabaseAdmin.from("client_sections").delete().eq("client_id", clientId);

    // Storage cleanup (best-effort, non-blocking)
    try {
      const { data: storageFiles } = await supabaseAdmin.storage
        .from("submissions")
        .list(clientId, { limit: 1000 });

      if (storageFiles && storageFiles.length > 0) {
        const paths = storageFiles.map((f) => `${clientId}/${f.name}`);
        await supabaseAdmin.storage.from("submissions").remove(paths);
      }
    } catch (storageErr) {
      console.error("[delete-client] Storage cleanup error:", storageErr);
    }

    // Delete profile
    await supabaseAdmin.from("profiles").delete().eq("id", clientId);

    // Delete auth user
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(clientId);
    if (authError) {
      console.error("[delete-client] Auth delete error:", authError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[delete-client] Error:", error);
    return NextResponse.json(
      { error: "Error al eliminar el cliente." },
      { status: 500 }
    );
  }
}
