/**
 * SDK de proteccion-datos-cl para el FRONTEND (React/Vite) de cada proyecto.
 *
 * Modelo embebido: usa el cliente Supabase del proyecto. La Edge Function
 * `proteccion-datos` corre en el MISMO Supabase, así que no hay secretos en el
 * navegador: la llamada viaja con el JWT del usuario logueado y la función
 * usa la service_role internamente para cifrar y escribir.
 *
 * Uso:
 *   import { createClient } from '@supabase/supabase-js';
 *   import { ProteccionDatos } from './proteccion-datos/sdk';
 *   const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);
 *   const pd = new ProteccionDatos(supabase);
 *   await pd.registrarConsentimiento({ purposeCodigo: 'marketing', otorgado: true });
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const FN = 'proteccion-datos';

export type TipoArcop =
  | 'acceso' | 'rectificacion' | 'cancelacion' | 'oposicion' | 'portabilidad' | 'bloqueo';

export class ProteccionDatos {
  constructor(private supabase: SupabaseClient) {}

  private async call<T>(path: string, method: 'GET' | 'POST' | 'PATCH', body?: unknown): Promise<T> {
    const { data, error } = await this.supabase.functions.invoke(`${FN}/${path}`, {
      method,
      body: body ?? undefined,
    });
    if (error) throw error;
    return data as T;
  }

  // ── Consentimiento (usuario logueado, sobre sus propios datos) ──────
  registrarConsentimiento(input: {
    purposeCodigo: string; otorgado: boolean;
    versionTexto?: string; textoMostrado?: string; canal?: string;
  }) {
    return this.call<{ id: string; subjectId: string; otorgado: boolean }>('consentimiento', 'POST', input);
  }

  revocarConsentimiento(purposeCodigo: string) {
    return this.call<{ ok: boolean }>('consentimiento/revocar', 'POST', { purposeCodigo });
  }

  misConsentimientos() {
    return this.call<{ consents: unknown[] }>('consentimiento', 'GET');
  }

  // ── Derechos ARCOP ─────────────────────────────────────────────────
  crearSolicitud(tipo: TipoArcop, detalle?: string) {
    return this.call<{ id: string; tipo: string; estado: string; venceEn: string }>('arcop', 'POST', { tipo, detalle });
  }

  misSolicitudes() {
    return this.call<{ requests: unknown[] }>('arcop/mias', 'GET');
  }

  // ── Panel de cumplimiento (requiere rol DPO/admin) ─────────────────
  listarSolicitudes(estado?: string) {
    return this.call<{ requests: unknown[] }>(`arcop${estado ? `?estado=${estado}` : ''}`, 'GET');
  }
  actualizarSolicitud(id: string, cambios: { estado?: string; respuesta?: string }) {
    return this.call<{ ok: boolean }>(`arcop/${id}`, 'PATCH', cambios);
  }
  exportarDatos(requestId: string) {
    return this.call<{ titular: unknown; consentimientos: unknown[] }>(`arcop/${requestId}/export`, 'GET');
  }

  registrarActividad(actividad: Record<string, unknown>) {
    return this.call<{ id: string }>('rat', 'POST', actividad);
  }
  listarActividades() {
    return this.call<{ actividades: unknown[] }>('rat', 'GET');
  }

  reportarBrecha(brecha: {
    titulo: string; descripcion?: string;
    severidad?: 'baja' | 'media' | 'alta' | 'critica';
    categoriasAfectadas?: string[]; nTitularesAfectados?: number; datosSensiblesAfectados?: boolean;
  }) {
    return this.call<{ id: string; recordatorio: string }>('brechas', 'POST', brecha);
  }
  notificarBrechaAgencia(id: string) {
    return this.call<{ ok: boolean }>(`brechas/${id}/notificar-agencia`, 'POST', {});
  }
  notificarBrechaTitulares(id: string) {
    return this.call<{ ok: boolean }>(`brechas/${id}/notificar-titulares`, 'POST', {});
  }

  bitacora(limit = 100) {
    return this.call<{ eventos: unknown[] }>(`auditoria?limit=${limit}`, 'GET');
  }
  verificarBitacora() {
    return this.call<{ ok: boolean; roto_en?: number }>('auditoria/verify', 'GET');
  }
}
