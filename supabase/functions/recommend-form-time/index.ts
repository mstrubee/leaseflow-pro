import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from "../_shared/cors.ts";

// Fase 3: estimación contextual de tiempo de una tarea de mantención con Gemini.
// Recibe descripciones + comentarios + la mediana estadística (Fase 2) como base
// y ajusta por la MAGNITUD real del trabajo. Devuelve { minutes, reason }.

const GEMINI_MODELS = ["gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-2.5-flash"];

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const {
      descriptions = [],
      comments = "",
      baseMinutes = 30,
      sampleCount = 0,
      formType = "",
    } = await req.json();

    const descText = (descriptions as { label?: string; text?: string }[])
      .filter((d) => d?.text?.trim())
      .map((d) => `- ${d.label ?? "Tarea"}: ${d.text!.trim()}`)
      .join("\n");

    if (!descText) {
      return new Response(JSON.stringify({ error: "Se requiere al menos una descripción" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY no configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseRef = sampleCount >= 3
      ? `El tiempo promedio histórico para tareas de tipo "${formType}" es de ${baseMinutes} minutos (basado en ${sampleCount} tareas reales). Úsalo como referencia base y AJÚSTALO según la magnitud del trabajo descrito.`
      : `Aún no hay suficiente historial para este tipo de tarea (referencia tentativa: ${baseMinutes} minutos). Estima según tu criterio y la magnitud del trabajo descrito.`;

    const prompt = `Eres un planificador experto de mantenimiento de locales comerciales en Chile.
Tu tarea es estimar cuántos MINUTOS toma ejecutar en terreno la siguiente tarea de mantención, considerando la MAGNITUD real del trabajo (cantidades, alcance), no solo el tipo.

${baseRef}

Descripción de la tarea:
${descText}
${comments?.trim() ? `\nComentarios del proveedor/supervisor:\n${comments.trim()}` : ""}

Reglas:
- Considera cantidades explícitas (ej. "cambiar 10 ampolletas" toma mucho menos que "200 luminarias").
- Si la descripción es genérica/pequeña, mantente cerca de la referencia base.
- Devuelve un tiempo realista de ejecución en terreno, en minutos (entero, múltiplo de 5 si es posible).
- Responde SOLO con un JSON válido, sin texto adicional, con esta forma exacta:
{"minutes": <entero>, "reason": "<motivo breve en español, máx 120 caracteres>"}`;

    let lastStatus = 0;
    let parsed: { minutes?: number; reason?: string } | null = null;

    for (const model of GEMINI_MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        }),
      });

      if (r.ok) {
        const data = await r.json();
        const raw = data?.candidates?.[0]?.content?.parts
          ?.map((p: { text?: string }) => p.text || "")
          .join("")
          .trim() || "";
        try {
          parsed = JSON.parse(raw);
        } catch {
          // intentar extraer el primer objeto JSON del texto
          const m = raw.match(/\{[\s\S]*\}/);
          if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
        }
        if (parsed && Number.isFinite(Number(parsed.minutes))) break;
        lastStatus = 500;
        continue;
      }

      lastStatus = r.status;
      console.error(`Gemini error (${model}):`, r.status, await r.text());
      if (r.status !== 503 && r.status !== 429 && r.status !== 500) break;
    }

    if (!parsed || !Number.isFinite(Number(parsed.minutes))) {
      if (lastStatus === 429) {
        return new Response(JSON.stringify({ error: "Demasiadas solicitudes, intente en unos segundos" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (lastStatus === 400 || lastStatus === 403) {
        return new Response(JSON.stringify({ error: `Error de Gemini (${lastStatus}): verifica tu GEMINI_API_KEY.` }), {
          status: lastStatus, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "No se pudo estimar el tiempo" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sanitizar: entero entre 5 y 480 minutos
    let minutes = Math.round(Number(parsed.minutes));
    minutes = Math.max(5, Math.min(480, minutes));
    const reason = String(parsed.reason ?? "").slice(0, 200);

    return new Response(JSON.stringify({ minutes, reason }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("recommend-form-time error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
