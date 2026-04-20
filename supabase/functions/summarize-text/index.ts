import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders } from "../_shared/cors.ts";

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];

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
    console.error("Auth validation failed:", claimsError);
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { text, maxLength = 500 } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Se requiere un texto para resumir" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (text.trim().length < 30) {
      return new Response(
        JSON.stringify({ error: "El texto es muy corto para resumir (mínimo 30 caracteres)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY no configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `Eres un asistente que resume textos de manera concisa y profesional.
Resume el siguiente texto en español, manteniendo los puntos más importantes.
El resumen debe ser más corto que el original y no exceder ${maxLength} caracteres.
Responde SOLO con el resumen, sin explicaciones adicionales ni comillas.

Texto a resumir:
${text}`;

    let lastStatus = 0;
    let lastBody = "";
    let summary = "";

    for (const model of GEMINI_MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4 },
        }),
      });

      if (r.ok) {
        const data = await r.json();
        summary =
          data?.candidates?.[0]?.content?.parts
            ?.map((p: { text?: string }) => p.text || "")
            .join("")
            .trim() || "";
        if (summary) break;
        lastStatus = 500;
        lastBody = "Empty response";
        continue;
      }

      lastStatus = r.status;
      lastBody = await r.text();
      console.error(`Gemini error (${model}):`, r.status, lastBody);
      // Only retry on overload/unavailable
      if (r.status !== 503 && r.status !== 429 && r.status !== 500) break;
    }

    if (!summary) {
      if (lastStatus === 429) {
        return new Response(
          JSON.stringify({ error: "Demasiadas solicitudes, intente en unos segundos" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (lastStatus === 400 || lastStatus === 403) {
        return new Response(
          JSON.stringify({ error: `Error de Gemini (${lastStatus}): verifica tu GEMINI_API_KEY.` }),
          { status: lastStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "Error al generar resumen" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Summarize error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
