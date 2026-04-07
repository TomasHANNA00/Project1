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
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const claims = decodeJWT(token);
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const exp = claims.exp as number | undefined;
  if (exp && exp * 1000 < Date.now())
    return NextResponse.json({ error: "Token expirado" }, { status: 401 });

  const callerEmail = (claims.email as string | undefined) ?? "";
  const callerId = (claims.sub as string | undefined) ?? "";

  let isAdmin = ADMIN_EMAILS.includes(callerEmail);
  if (!isAdmin && callerId) {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", callerId)
      .single();
    isAdmin = p?.role === "admin";
  }
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY no está configurada. Agrégala en las variables de entorno (Vercel → Project Settings → Environment Variables).",
      },
      { status: 503 }
    );
  }

  const body = await req.json();
  const { raw_text, section_title, section_description, company_name } = body as {
    raw_text: string;
    section_title: string;
    section_description?: string;
    company_name?: string;
  };

  if (!raw_text?.trim()) {
    return NextResponse.json({ error: "No hay texto para depurar." }, { status: 400 });
  }

  const systemPrompt = `Eres un asistente experto en limpiar y estructurar información empresarial para configurar asistentes de IA.

Tu tarea es tomar texto crudo enviado por un cliente y convertirlo en texto limpio, organizado y listo para ser procesado.

Reglas estrictas:
- Elimina ruido de formato (símbolos extraños, saltos de línea excesivos, caracteres especiales innecesarios)
- Normaliza el texto en español claro y directo
- Mantén TODA la información factual sin inventar, añadir ni omitir datos importantes
- Organiza la información de forma lógica (usa listas numeradas o con guiones cuando sea apropiado)
- Elimina redundancias y repeticiones
- No añadas comentarios, títulos generales ni encabezados — solo el contenido estructurado
- Devuelve texto plano estructurado, sin markdown, sin HTML, sin asteriscos
- Si hay preguntas y respuestas (formato P:/R:), mantén ese formato limpio`;

  const userPrompt = `Empresa: ${company_name || "No especificado"}
Sección: ${section_title}
${section_description ? `Descripción: ${section_description}` : ""}

Texto crudo del cliente:
---
${raw_text}
---

Devuelve únicamente el texto depurado y estructurado:`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json(
      { error: `Error de la API de IA: ${response.status} — ${errText}` },
      { status: 502 }
    );
  }

  const data = await response.json();
  const depuredText = (data.content?.[0]?.text as string | undefined) ?? "";

  return NextResponse.json({ depured_text: depuredText });
}
