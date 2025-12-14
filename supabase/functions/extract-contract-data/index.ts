import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractedField {
  field: string;
  label: string;
  value: string;
  confidence: 'alta' | 'media';
  category: 'contractual' | 'ubicacion' | 'partes';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentContent, documentUrl } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Starting contract data extraction...");

    const systemPrompt = `Eres un experto en extracción de datos de contratos de arriendo comercial en Chile. 
Tu tarea es analizar el contenido de un contrato y extraer información estructurada.

Para cada dato que encuentres, debes asignar un nivel de confianza:
- "alta": El dato está claramente especificado en el contrato
- "media": El dato se infiere del contexto o no está completamente claro

Extrae los siguientes campos cuando estén disponibles:
- nombre_contrato: Nombre o título del contrato
- fecha_inicio: Fecha de inicio del contrato (formato DD-MM-YYYY)
- fecha_termino: Fecha de término del contrato (formato DD-MM-YYYY)
- duracion_meses: Duración del contrato en meses
- canon_arriendo: Monto del canon de arriendo (solo número)
- moneda: Moneda del arriendo (UF o CLP)
- arriendo_escalonado: Si existe arriendo escalonado (sí/no y detalle)
- arriendo_variable_porcentaje: Porcentaje de arriendo variable
- garantia: Monto o descripción de la garantía
- meses_aviso_termino: Meses de anticipación para aviso de término
- direccion: Dirección completa del inmueble
- comuna: Comuna del inmueble
- region: Región del inmueble
- pais: País (generalmente Chile)
- empresa: Nombre de la empresa arrendataria
- representante_nombre: Nombre del representante legal
- representante_telefono: Teléfono de contacto
- representante_email: Email de contacto

Responde SOLO con un JSON válido con el siguiente formato:
{
  "fields": [
    {
      "field": "nombre_campo",
      "label": "Etiqueta legible",
      "value": "valor extraído",
      "confidence": "alta" o "media",
      "category": "contractual" o "ubicacion" o "partes"
    }
  ],
  "success": true,
  "message": "Mensaje opcional"
}

Si no puedes extraer datos relevantes, responde:
{
  "fields": [],
  "success": false,
  "message": "No se detectaron datos suficientes para importar desde el contrato."
}`;

    const userPrompt = documentContent 
      ? `Analiza el siguiente contenido de contrato y extrae todos los datos relevantes:\n\n${documentContent}`
      : `No se pudo obtener el contenido del documento. Por favor indica que no hay datos disponibles.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: "Límite de solicitudes excedido, intente de nuevo más tarde.",
          success: false,
          fields: []
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: "Se requiere agregar créditos para continuar usando esta función.",
          success: false,
          fields: []
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    console.log("AI response received:", content?.substring(0, 200));

    // Parse the JSON response
    let extractedData;
    try {
      // Clean up the response if it has markdown code blocks
      let cleanContent = content;
      if (content.includes("```json")) {
        cleanContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      } else if (content.includes("```")) {
        cleanContent = content.replace(/```\n?/g, "");
      }
      extractedData = JSON.parse(cleanContent.trim());
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      extractedData = {
        fields: [],
        success: false,
        message: "Error al procesar la respuesta del análisis."
      };
    }

    console.log("Extraction completed. Fields found:", extractedData.fields?.length || 0);

    return new Response(JSON.stringify(extractedData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in extract-contract-data function:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Error desconocido",
      success: false,
      fields: []
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
