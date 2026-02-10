import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ContractInfo {
  id: string;
  name: string;
  cebe: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { unmatchedTexts, contracts } = await req.json() as {
      unmatchedTexts: string[];
      contracts: ContractInfo[];
    };

    if (!unmatchedTexts?.length || !contracts?.length) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build contract reference for the prompt
    const contractList = contracts.map(c => {
      const cebeDigits = c.cebe.length >= 5 ? c.cebe.substring(1, 5) : c.cebe;
      return `ID: ${c.id} | Nombre: "${c.name}" | CEBE: ${c.cebe} | Dígitos 2-5: ${cebeDigits}`;
    }).join("\n");

    const textsToMatch = unmatchedTexts.map((t, i) => `${i}: "${t}"`).join("\n");

    const systemPrompt = `Eres un sistema experto en matching de tiendas/locales comerciales con contratos de arriendo.

Tu tarea es emparejar textos de un Excel (columna "Tienda") con contratos existentes usando estas reglas:

REGLA 1 - Matching por código numérico:
- Extrae los primeros 4 dígitos del texto del Excel (ej: "0428 - 10 De Julio" → "0428")
- Compáralos con los dígitos en posiciones 2-5 del CEBE de cada contrato (ej: CEBE "H0428P1290" → "0428")
- Si coinciden, es un candidato fuerte

REGLA 2 - Validación por nombre:
- Verifica que el nombre de la tienda en el Excel tenga similitud con el nombre del contrato
- Ej: "10 De Julio" en Excel vs "10 De Julio" en contrato → match confirmado
- Permite variaciones menores (mayúsculas, acentos, abreviaciones)

Solo retorna matches con ALTA confianza (ambas reglas se cumplen o hay coincidencia muy clara).
Si no estás seguro, NO incluyas ese texto en los resultados.`;

    const userPrompt = `CONTRATOS DISPONIBLES:
${contractList}

TEXTOS DEL EXCEL SIN MATCH:
${textsToMatch}

Analiza cada texto y encuentra el contrato correspondiente usando las reglas de matching.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_matches",
              description: "Retorna los matches encontrados entre textos del Excel y contratos",
              parameters: {
                type: "object",
                properties: {
                  matches: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        textIndex: { type: "number", description: "Índice del texto en la lista" },
                        contractId: { type: "string", description: "ID UUID del contrato matcheado" },
                        contractName: { type: "string", description: "Nombre del contrato matcheado" },
                        confidence: { type: "string", enum: ["high", "medium"], description: "Nivel de confianza" },
                      },
                      required: ["textIndex", "contractId", "contractName", "confidence"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["matches"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_matches" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, intente nuevamente en unos segundos." }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA agotados." }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", status, text);
      return new Response(JSON.stringify({ error: "Error en servicio de IA", matches: [] }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = JSON.parse(toolCall.function.arguments);

    // Map back: textIndex → original text + contractId
    const mappedMatches = (result.matches || [])
      .filter((m: any) => m.textIndex >= 0 && m.textIndex < unmatchedTexts.length && m.contractId)
      .map((m: any) => ({
        text: unmatchedTexts[m.textIndex],
        contractId: m.contractId,
        contractName: m.contractName || "",
        confidence: m.confidence || "medium",
      }));

    return new Response(JSON.stringify({ matches: mappedMatches }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("match-contracts error:", error);
    return new Response(JSON.stringify({ error: error.message, matches: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
