import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Secure CORS configuration - only allow trusted origins
const ALLOWED_ORIGINS = [
  'https://tgxiqvfpirwvhktgqqfa.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const isAllowed = ALLOWED_ORIGINS.some(allowed => 
    origin === allowed || origin.endsWith('.lovable.app')
  );
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

interface Alert {
  id: string;
  title: string;
  message: string | null;
  due_date: string;
  channels: string[];
  days_before: number[];
  repeat_every_days: number | null;
  contract_id: string | null;
  item_type: string | null;
  contracts?: {
    name: string;
    id: string;
  } | null;
}

interface AdminProfile {
  email: string;
  full_name: string | null;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { action } = await req.json().catch(() => ({ action: "process" }));

    if (action === "process") {
      return await processAlerts(supabase, resendApiKey, corsHeaders);
    } else if (action === "test") {
      const { alertId } = await req.json();
      return await testAlert(supabase, resendApiKey, alertId, corsHeaders);
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error processing alerts:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

async function processAlerts(supabase: any, resendApiKey: string | undefined, corsHeaders: Record<string, string>): Promise<Response> {
  console.log("Starting alert processing...");

  // Obtener alertas pendientes
  const { data: alerts, error: alertsError } = await supabase
    .from("alerts")
    .select(`
      *,
      contracts (
        id,
        name
      )
    `)
    .eq("is_active", true)
    .lte("next_send_at", new Date().toISOString());

  if (alertsError) {
    console.error("Error fetching alerts:", alertsError);
    throw alertsError;
  }

  console.log(`Found ${alerts?.length || 0} alerts to process`);

  if (!alerts || alerts.length === 0) {
    return new Response(JSON.stringify({ processed: 0, message: "No alerts to process" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Obtener todos los admins
  const { data: adminRoles, error: rolesError } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");

  if (rolesError) {
    console.error("Error fetching admin roles:", rolesError);
    throw rolesError;
  }

  const adminUserIds = adminRoles?.map((r: any) => r.user_id) || [];
  
  // Obtener perfiles de admins
  const { data: adminProfiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", adminUserIds);

  if (profilesError) {
    console.error("Error fetching admin profiles:", profilesError);
    throw profilesError;
  }

  const adminEmails = adminProfiles?.map((p: AdminProfile) => p.email).filter(Boolean) || [];
  console.log(`Sending to ${adminEmails.length} admin emails`);

  let processed = 0;
  let failed = 0;

  for (const alert of alerts as Alert[]) {
    try {
      const daysUntilDue = Math.ceil(
        (new Date(alert.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );

      // Enviar por cada canal configurado
      for (const channel of alert.channels) {
        if (channel === "email" && resendApiKey && adminEmails.length > 0) {
          await sendEmailAlert(resendApiKey, alert, adminEmails, daysUntilDue);
          
          // Registrar en historial
          for (const email of adminEmails) {
            await supabase.from("alert_history").insert({
              alert_id: alert.id,
              channel: "email",
              recipient_email: email,
              status: "sent",
              days_before_due: daysUntilDue,
            });
          }
        }
        // WhatsApp se implementará en el futuro
      }

      // Actualizar alerta
      const updates: any = {
        last_sent_at: new Date().toISOString(),
      };

      // Calcular próximo envío
      const dueDate = new Date(alert.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (dueDate < today) {
        // Fecha ya pasó
        if (alert.repeat_every_days) {
          // Continuar repitiendo
          const nextSend = new Date();
          nextSend.setDate(nextSend.getDate() + alert.repeat_every_days);
          updates.next_send_at = nextSend.toISOString();
        } else {
          // Desactivar
          updates.is_active = false;
          updates.next_send_at = null;
        }
      } else {
        // Buscar próximo día de aviso
        const sortedDays = [...alert.days_before].sort((a, b) => b - a);
        let nextSendDate: Date | null = null;

        for (const daysBefore of sortedDays) {
          const checkDate = new Date(dueDate);
          checkDate.setDate(checkDate.getDate() - daysBefore);
          if (checkDate > today) {
            nextSendDate = checkDate;
          }
        }

        if (nextSendDate) {
          updates.next_send_at = nextSendDate.toISOString();
        } else if (dueDate >= today) {
          // Enviar el mismo día del vencimiento
          updates.next_send_at = dueDate.toISOString();
        } else {
          updates.is_active = false;
          updates.next_send_at = null;
        }
      }

      await supabase.from("alerts").update(updates).eq("id", alert.id);
      processed++;
    } catch (error: any) {
      console.error(`Error processing alert ${alert.id}:`, error);
      
      await supabase.from("alert_history").insert({
        alert_id: alert.id,
        channel: "email",
        status: "failed",
        error_message: error.message,
      });
      
      failed++;
    }
  }

  console.log(`Processed: ${processed}, Failed: ${failed}`);

  return new Response(
    JSON.stringify({ processed, failed, total: alerts.length }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

async function sendEmailAlert(
  resendApiKey: string,
  alert: Alert,
  recipients: string[],
  daysUntilDue: number
): Promise<void> {
  
  const contractName = alert.contracts?.name || "Sin nombre";
  const contractId = alert.contract_id;
  const appUrl = Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovable.app") || "";
  const contractUrl = contractId ? `${appUrl}/contracts/${contractId}` : appUrl;

  let urgencyText = "";
  if (daysUntilDue <= 0) {
    urgencyText = "⚠️ VENCIDO";
  } else if (daysUntilDue === 1) {
    urgencyText = "⚠️ Vence mañana";
  } else if (daysUntilDue <= 7) {
    urgencyText = `⚠️ Vence en ${daysUntilDue} días`;
  } else {
    urgencyText = `Vence en ${daysUntilDue} días`;
  }

  const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #1a365d 0%, #2563eb 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 24px; }
        .urgency { background: ${daysUntilDue <= 7 ? '#fef2f2' : '#f0f9ff'}; color: ${daysUntilDue <= 7 ? '#dc2626' : '#1d4ed8'}; padding: 15px; text-align: center; font-weight: bold; font-size: 18px; }
        .content { background: #f7f7f7; padding: 30px; }
        .info-box { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #2563eb; }
        .info-row { display: flex; margin-bottom: 10px; }
        .info-label { font-weight: bold; width: 150px; color: #666; }
        .info-value { flex: 1; }
        .message-box { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
        .button { display: inline-block; background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; }
        .button:hover { background: #1d4ed8; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; border-top: 1px solid #ddd; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔔 Alerta de Vencimiento</h1>
        </div>
        <div class="urgency">${urgencyText}</div>
        <div class="content">
          <div class="info-box">
            <h2 style="margin-top: 0; color: #1a365d;">${alert.title}</h2>
            <div class="info-row">
              <span class="info-label">Contrato:</span>
              <span class="info-value">${contractName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Fecha de vencimiento:</span>
              <span class="info-value">${new Date(alert.due_date).toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Días restantes:</span>
              <span class="info-value">${daysUntilDue <= 0 ? 'Vencido' : daysUntilDue + ' días'}</span>
            </div>
          </div>
          ${alert.message ? `
          <div class="message-box">
            <strong>📝 Mensaje:</strong>
            <p style="margin-bottom: 0;">${alert.message}</p>
          </div>
          ` : ''}
          <div style="text-align: center; margin-top: 25px;">
            <a href="${contractUrl}" class="button">Ver Contrato</a>
          </div>
        </div>
        <div class="footer">
          <p>Este es un mensaje automático del sistema de gestión de contratos.</p>
          <p>No responda directamente a este correo.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: "Alertas de Contratos <onboarding@resend.dev>",
      to: recipients,
      subject: `${urgencyText} - ${alert.title}`,
      html: emailHtml,
    }),
  });

  if (!emailResponse.ok) {
    const errorData = await emailResponse.json();
    throw new Error(errorData.message || "Error sending email");
  }

  console.log(`Email sent to ${recipients.length} recipients for alert: ${alert.title}`);
}

async function testAlert(supabase: any, resendApiKey: string | undefined, alertId: string, corsHeaders: Record<string, string>): Promise<Response> {
  if (!resendApiKey) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: alert, error } = await supabase
    .from("alerts")
    .select(`*, contracts (id, name)`)
    .eq("id", alertId)
    .single();

  if (error || !alert) {
    return new Response(JSON.stringify({ error: "Alert not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Obtener admins
  const { data: adminRoles } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");

  const adminUserIds = adminRoles?.map((r: any) => r.user_id) || [];
  
  const { data: adminProfiles } = await supabase
    .from("profiles")
    .select("email")
    .in("id", adminUserIds);

  const adminEmails = adminProfiles?.map((p: any) => p.email).filter(Boolean) || [];

  if (adminEmails.length === 0) {
    return new Response(JSON.stringify({ error: "No admin emails found" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const daysUntilDue = Math.ceil(
    (new Date(alert.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );

  await sendEmailAlert(resendApiKey, alert, adminEmails, daysUntilDue);

  return new Response(JSON.stringify({ success: true, sentTo: adminEmails }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(handler);
