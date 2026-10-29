/**
 * proteccion-datos-cl · Edge Function única (router) para embeber en un proyecto.
 * Ley N° 21.719 (Chile).
 *
 * Autenticación: usa el JWT de Supabase Auth del proyecto.
 *   - Rutas de usuario: cualquier usuario autenticado (actúa sobre SUS datos).
 *   - Rutas de administración/DPO: requieren estar en pd.compliance_admins.
 *
 * Deploy:   supabase functions deploy proteccion-datos
 * Secretos: PD_KEK_MASTER_KEY, PD_BLIND_INDEX_KEY, PD_CORS_ORIGINS
 *           (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY las
 *            inyecta Supabase automáticamente)
 */
import { adminClient, getUser, isComplianceAdmin } from './lib/supabase.ts';
import { corsHeaders, json } from './lib/cors.ts';
import { audit, verifyChain } from './lib/audit.ts';
import { upsertSubject, getSubjectDecrypted } from './lib/subjects.ts';
import { encrypt, sha256 } from './lib/crypto.ts';

const PLAZO_RESPUESTA_DIAS = 30;

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });

  // Normaliza el path quitando el prefijo del nombre de la función
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/proteccion-datos/, '').replace(/\/$/, '') || '/';
  const seg = path.split('/').filter(Boolean); // ej: ['arcop','<id>','export']

  const user = await getUser(req);
  if (!user) return json({ error: 'No autenticado' }, 401, origin);

  const db = adminClient();
  const actor = user.email ?? user.id;
  const body = req.method === 'POST' || req.method === 'PATCH' ? await req.json().catch(() => ({})) : {};

  const admin = () => isComplianceAdmin(user.id);
  const forbidden = () => json({ error: 'Requiere rol de cumplimiento (DPO/admin)' }, 403, origin);

  try {
    // ── CONSENTIMIENTO (usuario sobre sus propios datos) ──────────────
    if (seg[0] === 'consentimiento') {
      if (req.method === 'POST' && seg[1] === 'revocar') {
        const subjectId = await upsertSubject(db, { externalRef: user.id, email: user.email });
        await db.from('consents').update({ vigente: false, revocado_en: new Date().toISOString() })
          .eq('subject_id', subjectId).eq('purpose_codigo', body.purposeCodigo).eq('vigente', true);
        await audit(db, { actor, accion: 'consent.revoke', entidad: 'consent', entidadId: subjectId, metadata: { purposeCodigo: body.purposeCodigo } });
        return json({ ok: true }, 200, origin);
      }
      if (req.method === 'POST') {
        if (!body.purposeCodigo || typeof body.otorgado !== 'boolean') {
          return json({ error: 'purposeCodigo y otorgado (boolean) requeridos' }, 400, origin);
        }
        const subjectId = await upsertSubject(db, { externalRef: user.id, email: user.email });
        await db.from('consents').update({ vigente: false })
          .eq('subject_id', subjectId).eq('purpose_codigo', body.purposeCodigo).eq('vigente', true);
        const { data: purpose } = await db.from('processing_purposes').select('id').eq('codigo', body.purposeCodigo).maybeSingle();
        const { data: row } = await db.from('consents').insert({
          subject_id: subjectId,
          purpose_id: purpose?.id ?? null,
          purpose_codigo: body.purposeCodigo,
          otorgado: body.otorgado,
          version_texto: body.versionTexto ?? null,
          texto_hash: body.textoMostrado ? await sha256(body.textoMostrado) : null,
          canal: body.canal ?? 'web',
          ip_origen: req.headers.get('x-forwarded-for'),
          user_agent: req.headers.get('user-agent'),
        }).select('id').single();
        await audit(db, { actor, accion: body.otorgado ? 'consent.grant' : 'consent.deny', entidad: 'consent', entidadId: row!.id, metadata: { purposeCodigo: body.purposeCodigo } });
        return json({ id: row!.id, subjectId, otorgado: body.otorgado }, 201, origin);
      }
      if (req.method === 'GET') {
        const { data: subject } = await db.from('data_subjects').select('id').eq('external_ref', user.id).maybeSingle();
        if (!subject) return json({ consents: [] }, 200, origin);
        const { data } = await db.from('consents')
          .select('id, purpose_codigo, otorgado, vigente, version_texto, otorgado_en, revocado_en, canal')
          .eq('subject_id', subject.id).order('otorgado_en', { ascending: false });
        return json({ consents: data ?? [] }, 200, origin);
      }
    }

    // ── ARCOP ─────────────────────────────────────────────────────────
    if (seg[0] === 'arcop') {
      // Usuario crea una solicitud sobre sus propios datos
      if (req.method === 'POST' && !seg[1]) {
        const tipos = ['acceso', 'rectificacion', 'cancelacion', 'oposicion', 'portabilidad', 'bloqueo'];
        if (!tipos.includes(body.tipo)) return json({ error: 'tipo ARCOP inválido' }, 400, origin);
        const subjectId = await upsertSubject(db, { externalRef: user.id, email: user.email });
        const vence = new Date(); vence.setDate(vence.getDate() + PLAZO_RESPUESTA_DIAS);
        const { data: row } = await db.from('arcop_requests').insert({
          subject_id: subjectId, tipo: body.tipo, detalle: body.detalle ?? null,
          vence_en: vence.toISOString(), solicitante_verificado: true, // viene autenticado
        }).select('id, vence_en').single();
        await audit(db, { actor, accion: `arcop.create.${body.tipo}`, entidad: 'arcop_request', entidadId: row!.id, metadata: { tipo: body.tipo } });
        return json({ id: row!.id, tipo: body.tipo, estado: 'recibida', venceEn: row!.vence_en }, 201, origin);
      }
      // Usuario ve sus propias solicitudes
      if (req.method === 'GET' && seg[1] === 'mias') {
        const { data: subject } = await db.from('data_subjects').select('id').eq('external_ref', user.id).maybeSingle();
        if (!subject) return json({ requests: [] }, 200, origin);
        const { data } = await db.from('arcop_requests').select('id, tipo, estado, detalle, recibida_en, vence_en, resuelta_en')
          .eq('subject_id', subject.id).order('recibida_en', { ascending: false });
        return json({ requests: data ?? [] }, 200, origin);
      }
      // ── El resto es solo administración/DPO ──
      if (!(await admin())) return forbidden();

      if (req.method === 'GET' && !seg[1]) {
        const estado = url.searchParams.get('estado');
        let q = db.from('arcop_requests').select('id, tipo, estado, detalle, recibida_en, vence_en, resuelta_en').order('recibida_en', { ascending: false });
        if (estado) q = q.eq('estado', estado);
        const { data } = await q;
        return json({ requests: data ?? [] }, 200, origin);
      }
      if (req.method === 'PATCH' && seg[1]) {
        const resuelta = body.estado === 'completada' || body.estado === 'rechazada';
        const patch: Record<string, unknown> = {};
        if (body.estado) patch.estado = body.estado;
        if (body.respuesta) patch.respuesta = body.respuesta;
        if (resuelta) patch.resuelta_en = new Date().toISOString();
        await db.from('arcop_requests').update(patch).eq('id', seg[1]);
        await audit(db, { actor, accion: 'arcop.update', entidad: 'arcop_request', entidadId: seg[1], metadata: { estado: body.estado } });
        return json({ ok: true }, 200, origin);
      }
      if (req.method === 'GET' && seg[1] && seg[2] === 'export') {
        const { data: reqRow } = await db.from('arcop_requests').select('subject_id').eq('id', seg[1]).maybeSingle();
        if (!reqRow?.subject_id) return json({ error: 'Solicitud o titular no encontrado' }, 404, origin);
        const subject = await getSubjectDecrypted(db, reqRow.subject_id);
        const { data: consents } = await db.from('consents').select('purpose_codigo, otorgado, vigente, otorgado_en, revocado_en').eq('subject_id', reqRow.subject_id);
        await audit(db, { actor, accion: 'arcop.export', entidad: 'data_subject', entidadId: reqRow.subject_id, metadata: { requestId: seg[1] } });
        return json({ titular: subject, consentimientos: consents ?? [] }, 200, origin);
      }
    }

    // ── A partir de acá, todo es administración/DPO ───────────────────
    if (!(await admin())) return forbidden();

    // ── RAT ────────────────────────────────────────────────────────────
    if (seg[0] === 'rat') {
      if (req.method === 'POST') {
        const { data: row } = await db.from('processing_activities').insert({
          nombre: body.nombre, finalidad: body.finalidad, base_licitud: body.baseLicitud,
          categorias_datos: body.categoriasDatos ?? [], categorias_titulares: body.categoriasTitulares ?? [],
          destinatarios: body.destinatarios ?? [], transferencia_internacional: !!body.transferenciaInternacional,
          pais_transferencia: body.paisTransferencia ?? null, plazo_conservacion: body.plazoConservacion ?? null,
          medidas_seguridad: body.medidasSeguridad ?? null,
        }).select('id').single();
        await audit(db, { actor, accion: 'rat.create', entidad: 'processing_activity', entidadId: row!.id, metadata: { nombre: body.nombre } });
        return json({ id: row!.id }, 201, origin);
      }
      if (req.method === 'GET') {
        const { data } = await db.from('processing_activities').select('*').eq('activa', true).order('creado_en', { ascending: false });
        return json({ actividades: data ?? [] }, 200, origin);
      }
    }

    // ── Brechas ─────────────────────────────────────────────────────────
    if (seg[0] === 'brechas') {
      if (req.method === 'POST' && !seg[1]) {
        const { data: row } = await db.from('breaches').insert({
          titulo: body.titulo, descripcion: body.descripcion ?? null, severidad: body.severidad ?? 'media',
          categorias_afectadas: body.categoriasAfectadas ?? [], n_titulares_afectados: body.nTitularesAfectados ?? null,
          datos_sensibles_afectados: !!body.datosSensiblesAfectados,
        }).select('id').single();
        await audit(db, { actor, accion: 'breach.create', entidad: 'breach', entidadId: row!.id, metadata: { severidad: body.severidad } });
        return json({ id: row!.id, recordatorio: 'Notificá a la Agencia y a los titulares sin dilaciones indebidas.' }, 201, origin);
      }
      if (req.method === 'GET') {
        const { data } = await db.from('breaches').select('*').order('detectada_en', { ascending: false });
        return json({ brechas: data ?? [] }, 200, origin);
      }
      if (req.method === 'POST' && seg[1] && seg[2] === 'notificar-agencia') {
        await db.from('breaches').update({ notificada_agencia: true, notificada_agencia_en: new Date().toISOString(), actualizado_en: new Date().toISOString() }).eq('id', seg[1]);
        await audit(db, { actor, accion: 'breach.notify_agencia', entidad: 'breach', entidadId: seg[1] });
        return json({ ok: true }, 200, origin);
      }
      if (req.method === 'POST' && seg[1] && seg[2] === 'notificar-titulares') {
        await db.from('breaches').update({ notificados_titulares: true, notificados_titulares_en: new Date().toISOString(), actualizado_en: new Date().toISOString() }).eq('id', seg[1]);
        await audit(db, { actor, accion: 'breach.notify_titulares', entidad: 'breach', entidadId: seg[1] });
        return json({ ok: true }, 200, origin);
      }
      if (req.method === 'PATCH' && seg[1]) {
        const patch: Record<string, unknown> = { actualizado_en: new Date().toISOString() };
        if (body.estado) patch.estado = body.estado;
        if (body.medidasAdoptadas) patch.medidas_adoptadas = body.medidasAdoptadas;
        await db.from('breaches').update(patch).eq('id', seg[1]);
        await audit(db, { actor, accion: 'breach.update', entidad: 'breach', entidadId: seg[1], metadata: { estado: body.estado } });
        return json({ ok: true }, 200, origin);
      }
    }

    // ── Auditoría ───────────────────────────────────────────────────────
    if (seg[0] === 'auditoria') {
      if (req.method === 'GET' && seg[1] === 'verify') {
        return json(await verifyChain(db), 200, origin);
      }
      if (req.method === 'GET') {
        const limit = Math.min(Number(url.searchParams.get('limit') ?? '100'), 500);
        const { data } = await db.from('audit_log').select('id, actor, accion, entidad, entidad_id, metadata, creado_en')
          .order('id', { ascending: false }).limit(limit);
        return json({ eventos: data ?? [] }, 200, origin);
      }
    }

    return json({ error: `Ruta no encontrada: ${req.method} ${path}` }, 404, origin);
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500, origin);
  }
});
