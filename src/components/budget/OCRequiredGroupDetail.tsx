import { Button } from "@/components/ui/button";
import { Download, Loader2, ShoppingCart } from "lucide-react";
import type { OCRequiredGroup } from "@/lib/ocRequiredGroups";

/** Campos del grupo que el detalle necesita (la vista global usa su propio tipo de grupo). */
type OCRequiredGroupDetailData = Pick<
  OCRequiredGroup,
  "projectName" | "filePath" | "fileName" | "converted" | "solicitudes" | "lines"
>;

interface OCRequiredGroupDetailProps<T extends OCRequiredGroupDetailData> {
  group: T;
  /** Muestra el botón "Solicitar OC" (solo aplica a requerimientos Pendientes). */
  canRequest: boolean;
  /** true mientras se arma el prellenado de la solicitud. */
  requesting?: boolean;
  onRequest: (group: T) => void;
  onOpenFile: (filePath: string) => void;
  /** Muestra "Proyecto: …" (útil en la vista global, redundante dentro de un contrato). */
  showProject?: boolean;
}

const formatUFAmount = (value: number) =>
  `UF ${value.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const lineStatusLabel = (status: string) =>
  status === "autorizado" ? "Autorizado" : status === "solicita_autorizar" ? "Solicita Autorizar" : "No autorizado";

/**
 * Detalle desplegable de un Requerimiento de OC (compartido entre
 * /purchase-orders y la sección "OC Requeridas" de cada contrato):
 * - Pendiente: líneas a las que se imputa el requerimiento + botón "Solicitar OC".
 * - Convertida: líneas a las que quedó imputada la Solicitud de OC.
 */
export function OCRequiredGroupDetail<T extends OCRequiredGroupDetailData>({
  group,
  canRequest,
  requesting = false,
  onRequest,
  onOpenFile,
  showProject = false,
}: OCRequiredGroupDetailProps<T>) {
  const solicitudes = group.solicitudes ?? [];

  return (
    <div className="py-2 px-2 space-y-2" onClick={(e) => e.stopPropagation()}>
      {(showProject || group.filePath) && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{showProject ? `Proyecto: ${group.projectName}` : ""}</span>
          {group.filePath && (
            <Button variant="outline" size="sm" className="h-6 px-2 gap-1" onClick={() => onOpenFile(group.filePath!)}>
              <Download className="h-3 w-3" />
              {group.fileName || "Ver archivo"}
            </Button>
          )}
        </div>
      )}

      {group.converted ? (
        solicitudes.length > 0 ? (
          solicitudes.map((solicitud) => (
            <div key={solicitud.requestId} className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Solicitud de OC: <span className="font-mono">{solicitud.requestNumber}</span> — líneas imputadas
              </p>
              <div className="rounded-md border divide-y bg-background">
                {solicitud.lines.length === 0 ? (
                  <div className="px-3 py-1.5 text-sm text-muted-foreground">Sin líneas imputadas</div>
                ) : (
                  solicitud.lines.map((line) => (
                    <div key={line.budgetLineId} className="flex items-center justify-between px-3 py-1.5 text-sm">
                      <span className="truncate">{line.lineName}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{formatUFAmount(line.amountUf)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">
            Convertida a Solicitud de OC (no se encontró el detalle de la solicitud).
          </p>
        )
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Líneas a las que se imputa el requerimiento</p>
          <div className="rounded-md border divide-y bg-background">
            {group.lines.map((line) => (
              <div key={line.budgetLineId} className="flex items-center justify-between px-3 py-1.5 text-sm">
                <span className="truncate">{line.lineName}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{formatUFAmount(line.amountUf)}</span>
                  <span className="text-[10px] uppercase text-muted-foreground">{lineStatusLabel(line.status)}</span>
                </div>
              </div>
            ))}
          </div>
          {canRequest && (
            <div className="flex justify-end">
              <Button size="sm" className="gap-1" disabled={requesting} onClick={() => onRequest(group)}>
                {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                Solicitar OC
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
