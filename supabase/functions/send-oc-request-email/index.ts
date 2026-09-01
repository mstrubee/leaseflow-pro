import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Mismo allowlist que send-contract-email — mantener sincronizados si cambia.
const ALLOWED_ORIGINS = [
  'https://tgxiqvfpirwvhktgqqfa.lovable.app',
  'https://id-preview--73a8d508-7010-4c00-aa8e-6eb117cc7286.lovable.app',
  'https://rental-flow-desk.lovable.app',
  'https://gplanet.vercel.app',
  'https://leaseflow-cx7iispoy-matias-strubes-projects-ad768903.vercel.app',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://localhost:3000',
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const isAllowed = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

interface SendOCRequestEmailRequest {
  recipientEmail: string;
  subject: string;
  /** Texto plano; se escapa antes de insertarse en el HTML del correo. */
  bodyText: string;
  /** Contenido del PDF en base64, sin el prefijo data:. */
  pdfBase64: string;
  fileName: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Tamaño típico de una Solicitud de OC de pocas páginas; Resend limita el
// payload total a 40MB, pero no tiene sentido aceptar adjuntos enormes acá.
const MAX_PDF_BASE64_LENGTH = 8 * 1024 * 1024; // ~6MB de PDF real

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);

  if (claimsError || !claimsData?.claims) {
    console.error("Auth validation failed:", claimsError);
    return new Response(JSON.stringify({ error: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const userId = claimsData.claims.sub;
  console.log("Authenticated user:", userId);

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      return new Response(JSON.stringify({ error: "RESEND_API_KEY no está configurado" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body = await req.json();
    const { recipientEmail, subject, bodyText, pdfBase64, fileName }: SendOCRequestEmailRequest = body;

    if (!recipientEmail || !subject || !pdfBase64 || !fileName) {
      return new Response(JSON.stringify({ error: "Faltan campos requeridos" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!EMAIL_REGEX.test(recipientEmail)) {
      return new Response(JSON.stringify({ error: "Formato de email inválido" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (pdfBase64.length > MAX_PDF_BASE64_LENGTH) {
      return new Response(JSON.stringify({ error: "El PDF es demasiado grande para enviarlo por correo" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const sanitizedSubject = escapeHtml(subject).substring(0, 200);
    const sanitizedBody = escapeHtml(bodyText || "").substring(0, 2000).replace(/\n/g, "<br>");
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 150);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Solicitudes OC <onboarding@resend.dev>",
        to: [recipientEmail],
        subject: sanitizedSubject,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #1e3a5f; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f7f7f7; padding: 30px; border-radius: 0 0 8px 8px; }
              .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header"><h1>Solicitud de OC</h1></div>
              <div class="content">
                <p>${sanitizedBody}</p>
                <p>Se adjunta el detalle en PDF.</p>
                <div class="footer">
                  <p>Este es un mensaje automático. Por favor no responda directamente a este correo.</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
        attachments: [
          {
            filename: sanitizedFileName,
            content: pdfBase64,
          },
        ],
      }),
    });

    const result = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Resend API error:", result);
      throw new Error(result.message || "Error al enviar email");
    }

    console.log("OC request email sent to:", recipientEmail);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-oc-request-email:", error);
    return new Response(JSON.stringify({ error: error?.message || "Error al enviar el correo" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
