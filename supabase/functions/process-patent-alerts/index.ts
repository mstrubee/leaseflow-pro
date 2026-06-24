import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Secure CORS configuration - only allow explicit trusted origins
const ALLOWED_ORIGINS = [
  'https://tgxiqvfpirwvhktgqqfa.lovable.app',
  'https://id-preview--73a8d508-7010-4c00-aa8e-6eb117cc7286.lovable.app',
  'https://rental-flow-desk.lovable.app',
  'https://gplanet.vercel.app',
  'https://leaseflow-cx7iispoy-matias-strubes-projects-ad768903.vercel.app',
  'http://localhost:5173',
  'http://localhost:8080',
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  // Strict origin matching - no wildcard domain matching
  const isAllowed = ALLOWED_ORIGINS.includes(origin);
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Credentials': 'true',
  };
}

interface PatentAlert {
  id: string;
  patent_document_id: string;
  alert_column: string;
  alert_date: string;
  frequency_days: number | null;
  is_active: boolean;
  recipients: string[];
  last_sent_at: string | null;
}

interface PatentDocument {
  id: string;
  contract_id: string;
  checklist_item_id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const today = new Date().toISOString().split('T')[0];
    console.log(`Processing patent alerts for date: ${today}`);

    // Get active alerts due today
    const { data: alerts, error: alertsError } = await supabase
      .from("patent_document_alerts")
      .select(`
        *,
        patent_documents (
          id,
          contract_id,
          checklist_item_id,
          status,
          start_date,
          end_date,
          patent_checklist_items:checklist_item_id (name),
          contracts:contract_id (name)
        )
      `)
      .eq("is_active", true)
      .lte("alert_date", today);

    if (alertsError) {
      console.error("Error fetching alerts:", alertsError);
      throw alertsError;
    }

    console.log(`Found ${alerts?.length || 0} alerts to process`);

    const results = [];

    for (const alert of alerts || []) {
      // Check if already sent today
      if (alert.last_sent_at) {
        const lastSent = new Date(alert.last_sent_at).toISOString().split('T')[0];
        if (lastSent === today) {
          console.log(`Alert ${alert.id} already sent today, skipping`);
          continue;
        }
      }

      const doc = alert.patent_documents as any;
      if (!doc) {
        console.log(`No document found for alert ${alert.id}`);
        continue;
      }

      const contractName = doc.contracts?.name || 'Local desconocido';
      const itemName = doc.patent_checklist_items?.name || 'Documento';
      const referenceDate = alert.alert_column === 'start_date' ? doc.start_date : doc.end_date;

      // Send email to each recipient
      for (const recipient of alert.recipients || []) {
        try {
          const emailResponse = await resend.emails.send({
            from: "Patentes <onboarding@resend.dev>",
            to: [recipient],
            subject: `Alerta de Patente: ${contractName} - ${itemName}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Alerta de Documento de Patente</h2>
                <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p><strong>Local:</strong> ${contractName}</p>
                  <p><strong>Documento:</strong> ${itemName}</p>
                  <p><strong>Fecha de referencia (${alert.alert_column === 'start_date' ? 'Inicio' : 'Término'}):</strong> ${referenceDate || 'No definida'}</p>
                  <p><strong>Estado actual:</strong> ${doc.status}</p>
                </div>
                <p style="color: #666;">Este es un recordatorio automático configurado en el sistema de gestión de patentes.</p>
              </div>
            `,
          });

          console.log(`Email sent to ${recipient}:`, emailResponse);
          results.push({ alertId: alert.id, recipient, status: 'sent' });
        } catch (emailError) {
          console.error(`Error sending to ${recipient}:`, emailError);
          results.push({ alertId: alert.id, recipient, status: 'error', error: emailError });
        }
      }

      // Update last_sent_at
      await supabase
        .from("patent_document_alerts")
        .update({ last_sent_at: new Date().toISOString() })
        .eq("id", alert.id);

      // If no frequency, deactivate the alert
      if (!alert.frequency_days) {
        await supabase
          .from("patent_document_alerts")
          .update({ is_active: false })
          .eq("id", alert.id);
      } else {
        // Calculate next alert date
        const nextDate = new Date(alert.alert_date);
        nextDate.setDate(nextDate.getDate() + alert.frequency_days);
        await supabase
          .from("patent_document_alerts")
          .update({ alert_date: nextDate.toISOString().split('T')[0] })
          .eq("id", alert.id);
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error processing patent alerts:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...getCorsHeaders(req) } }
    );
  }
};

serve(handler);
