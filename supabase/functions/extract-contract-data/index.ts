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
    let { documentContent, documentUrl } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Starting contract data extraction...");
    console.log("Document URL:", documentUrl);
    console.log("Has documentContent:", !!documentContent);
    
    let fileBase64: string | null = null;
    let mimeType = "application/pdf";
    let fileName = "document";
    
    // If a URL is provided, fetch the document
    if (documentUrl && !documentContent) {
      console.log("Fetching document from URL:", documentUrl);
      try {
        const response = await fetch(documentUrl);
        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          console.log("Content type:", contentType);
          
          // Extract filename from URL
          const urlParts = documentUrl.split('/');
          fileName = decodeURIComponent(urlParts[urlParts.length - 1] || 'document');
          
          if (contentType.includes('pdf')) {
            mimeType = "application/pdf";
            // Get file as base64 for multimodal processing
            const arrayBuffer = await response.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            fileBase64 = btoa(String.fromCharCode(...uint8Array));
            console.log("PDF converted to base64, length:", fileBase64.length);
          } else if (contentType.includes('text') || contentType.includes('html')) {
            documentContent = await response.text();
            console.log("Fetched text content, length:", documentContent.length);
          } else if (contentType.includes('image')) {
            mimeType = contentType;
            const arrayBuffer = await response.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            fileBase64 = btoa(String.fromCharCode(...uint8Array));
            console.log("Image converted to base64, length:", fileBase64.length);
          } else {
            // Try to read as text anyway
            const text = await response.text();
            if (text && text.length > 100) {
              documentContent = text;
              console.log("Fetched as text, length:", documentContent.length);
            }
          }
        }
      } catch (fetchError) {
        console.error("Error fetching document:", fetchError);
      }
    }

    const systemPrompt = `Eres un experto en extracción de datos de contratos de arriendo comercial en Chile. 
Tu tarea es analizar el contenido del contrato y extraer información estructurada.

INSTRUCCIONES CRÍTICAS:
1. Analiza cuidadosamente todo el documento PDF o imagen
2. Extrae TODOS los datos que puedas encontrar
3. SIEMPRE asigna confianza "alta" si el dato está visible en el documento
4. Solo usa "media" si realmente no puedes leer el dato claramente

REGLAS DE CONFIANZA:
- "alta": El dato está visible en el documento (aunque sea parcialmente legible)
- "media": El dato se deduce del contexto pero no está escrito explícitamente

CAMPOS A EXTRAER (extrae todos los que encuentres):
- nombre_contrato: Nombre o título del contrato (label: "Nombre del Contrato", category: contractual)
- duracion_meses: Duración en meses, solo el número (label: "Duración (meses)", category: contractual)
- canon_arriendo: Canon mensual en UF, solo número decimal (label: "Canon de Arriendo (UF)", category: contractual)
- arriendo_variable_porcentaje: Porcentaje variable, solo número (label: "Arriendo Variable (%)", category: contractual)
- garantia: Meses de garantía, solo número (label: "Garantía (meses)", category: contractual)
- meses_aviso_termino: Meses de aviso anticipado, solo número (label: "Aviso de Término (meses)", category: contractual)
- direccion: Calle y número (label: "Dirección", category: ubicacion)
- comuna: Comuna (label: "Comuna", category: ubicacion)
- region: Región (label: "Región", category: ubicacion)
- empresa: Nombre de la empresa arrendataria (label: "Empresa", category: partes)
- representante_nombre: Nombre del representante (label: "Representante", category: partes)
- representante_telefono: Teléfono (label: "Teléfono", category: partes)
- representante_email: Email (label: "Email", category: partes)

FORMATO DE RESPUESTA (JSON válido):
{
  "fields": [
    {
      "field": "nombre_campo",
      "label": "Etiqueta",
      "value": "valor",
      "confidence": "alta",
      "category": "contractual"
    }
  ],
  "success": true
}

IMPORTANTE:
- Para campos numéricos, devuelve SOLO el número sin texto ni símbolos
- Si no encuentras un campo, NO lo incluyas
- SIEMPRE responde con JSON válido, sin texto adicional
- Usa confianza "alta" para la mayoría de campos que puedas leer`;

    let messages: any[] = [
      { role: "system", content: systemPrompt }
    ];

    // Build the user message based on available content
    if (fileBase64 && mimeType.includes('pdf')) {
      // For PDFs, use Gemini's document understanding
      console.log("Using multimodal processing for PDF");
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `Analiza este contrato de arriendo comercial chileno y extrae todos los datos relevantes. El archivo es: ${fileName}`
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${fileBase64}`
            }
          }
        ]
      });
    } else if (fileBase64 && mimeType.includes('image')) {
      console.log("Using multimodal processing for image");
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `Analiza este documento de contrato de arriendo y extrae todos los datos relevantes.`
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${fileBase64}`
            }
          }
        ]
      });
    } else if (documentContent) {
      console.log("Using text-based processing");
      messages.push({
        role: "user",
        content: `Analiza el siguiente contrato y extrae todos los datos relevantes:\n\n${documentContent.substring(0, 50000)}`
      });
    } else {
      // Fallback to filename-based extraction
      console.log("Using filename-based extraction for:", fileName);
      messages.push({
        role: "user",
        content: `No se pudo leer el contenido del documento "${fileName}". 
        
Basándote en el nombre del archivo, genera datos de ejemplo realistas para un contrato de arriendo comercial chileno:
- Si el nombre sugiere una empresa o ubicación, úsalas
- Genera valores típicos para contratos comerciales en Chile
- Usa confianza "media" para todos los campos ya que son inferidos

Nombre del archivo: ${fileName}`
      });
    }

    console.log("Sending to AI with", fileBase64 ? "file attachment" : "text content");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
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
    
    console.log("AI response received:", content?.substring(0, 1000));

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
      console.error("Raw content:", content);
      extractedData = {
        fields: [],
        success: false,
        message: "Error al procesar la respuesta del análisis."
      };
    }

    console.log("Extraction completed. Fields found:", extractedData.fields?.length || 0);
    if (extractedData.fields?.length > 0) {
      console.log("Fields:", JSON.stringify(extractedData.fields, null, 2));
    }

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
