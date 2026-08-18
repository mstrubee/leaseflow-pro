import { supabase } from "@/integrations/supabase/client";
import {
  buildInformeDirectorioPptx,
  PPTX_MIME,
  type InformeDirectorioParams,
} from "@/components/reports/InformeDirectorioPPT";

// Compartir el Informe Directorio por link.
//
// El archivo vive en el bucket PRIVADO `board-reports` y se entrega por signed
// URL: el destinatario típico es un director sin cuenta en la aplicación, así
// que no sirve un link que exija sesión, pero tampoco corresponde un bucket
// público —el informe lleva los Business Case completos—.

const BUCKET = "board-reports";

/** Vencimiento por defecto del link, en días. */
export const DEFAULT_SHARE_DAYS = 30;

export interface BoardReportShare {
  id: string;
  year: string;
  fileName: string;
  storagePath: string;
  contractCount: number;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  createdBy: string | null;
}

const rowToShare = (r: any): BoardReportShare => ({
  id: r.id,
  year: r.year,
  fileName: r.file_name,
  storagePath: r.storage_path,
  contractCount: r.contract_count ?? 0,
  expiresAt: r.expires_at,
  revokedAt: r.revoked_at ?? null,
  createdAt: r.created_at,
  createdBy: r.created_by ?? null,
});

/**
 * Genera el informe, lo sube y devuelve el link firmado.
 *
 * Usa `buildInformeDirectorioPptx`, el mismo constructor que la descarga, para
 * que el archivo compartido sea idéntico al que baja el usuario.
 */
export async function shareInformeDirectorio(params: {
  report: InformeDirectorioParams;
  contractIds: string[];
  userId: string;
  days?: number;
}): Promise<{ url: string; share: BoardReportShare }> {
  const { report, contractIds, userId, days = DEFAULT_SHARE_DAYS } = params;

  const { blob, fileName } = await buildInformeDirectorioPptx(report);

  // El path lleva un sufijo aleatorio: sin él, dos informes del mismo año y día
  // colisionarían y el segundo pisaría el link ya repartido del primero.
  const suffix = crypto.randomUUID().slice(0, 8);
  const storagePath = `${report.year}/${fileName.replace(/\.pptx$/, "")}_${suffix}.pptx`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, blob, { contentType: PPTX_MIME, upsert: false });
  if (upErr) throw new Error(`No se pudo subir el informe: ${upErr.message}`);

  const expiresIn = days * 24 * 60 * 60;
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresIn, { download: fileName });
  if (signErr || !signed?.signedUrl) {
    // Sin link el objeto subido sería basura invisible: se limpia.
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw new Error(`No se pudo generar el link: ${signErr?.message ?? "desconocido"}`);
  }

  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const { data: row, error: insErr } = await supabase
    .from("board_report_shares" as any)
    .insert({
      year: report.year,
      file_name: fileName,
      storage_path: storagePath,
      contract_ids: contractIds,
      contract_count: contractIds.length,
      expires_at: expiresAt,
      created_by: userId,
    })
    .select()
    .single();
  if (insErr) {
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw new Error(`No se pudo registrar el link: ${insErr.message}`);
  }

  return { url: signed.signedUrl, share: rowToShare(row) };
}

/** Links emitidos, del más nuevo al más viejo. */
export async function listBoardReportShares(): Promise<BoardReportShare[]> {
  const { data, error } = await supabase
    .from("board_report_shares" as any)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToShare);
}

/**
 * Revoca un link.
 *
 * Una signed URL no se puede invalidar: sigue siendo válida hasta que vence.
 * Lo único que la corta de verdad es BORRAR el objeto al que apunta, así que
 * eso es lo que se hace, y recién después se marca la fila.
 */
export async function revokeBoardReportShare(share: BoardReportShare): Promise<void> {
  const { error: rmErr } = await supabase.storage.from(BUCKET).remove([share.storagePath]);
  if (rmErr) throw new Error(`No se pudo borrar el archivo: ${rmErr.message}`);
  const { error } = await supabase
    .from("board_report_shares" as any)
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", share.id);
  if (error) throw error;
}
