import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SendContractEmailRequest {
  recipientEmail: string;
  contractName: string;
  documentUrl: string;
  senderName?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY no está configurado" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const { recipientEmail, contractName, documentUrl, senderName }: SendContractEmailRequest = await req.json();

    if (!recipientEmail || !contractName || !documentUrl) {
      return new Response(
        JSON.stringify({ error: "Faltan campos requeridos" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Contratos <onboarding@resend.dev>",
        to: [recipientEmail],
        subject: `Contrato para firma: ${contractName}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #1a365d; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
              .content { background: #f7f7f7; padding: 30px; border-radius: 0 0 8px 8px; }
              .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
              .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Contrato para Firma</h1>
              </div>
              <div class="content">
                <p>Estimado/a,</p>
                <p>Se le ha enviado el siguiente contrato para su revisión y firma:</p>
                <p><strong>${contractName}</strong></p>
                ${senderName ? `<p>Enviado por: ${senderName}</p>` : ''}
                <p>Por favor, revise el documento y proceda con la firma según corresponda.</p>
                <a href="${documentUrl}" class="button">Ver Contrato</a>
                <div class="footer">
                  <p>Este es un mensaje automático. Por favor no responda directamente a este correo.</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `,
      }),
    });

    const result = await emailResponse.json();
    
    if (!emailResponse.ok) {
      throw new Error(result.message || "Error al enviar email");
    }

    console.log("Email sent successfully:", result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-contract-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
