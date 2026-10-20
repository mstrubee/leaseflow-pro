import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, ChevronDown, ChevronRight, Lock, Undo2 } from "lucide-react";
import type { ApplyCategoriesResult, CategoryChangeBatch } from "@/components/opex/useOpexCategoryChanges";

interface OpexCategoryChangesPanelProps {
  planYear: number;
  baseYear: number;
  batches: CategoryChangeBatch[];
  locked: boolean;
  baseYearClosed: boolean;
  busy: boolean;
  applyError: string | null;
  lastApply: ApplyCategoriesResult | null;
  // Retiradas sin destino que ya tienen montos del año planificado: "Aplicar" se negaría.
  blockingRetirements: Array<{ batchId: string; categoryId: string }>;
  // Retiradas sin destino con presupuesto del año base: el cierre lo copiará y "Aplicar" fallaría.
  retirementsWithBaseBudget: Array<{ batchId: string; categoryId: string; amountClp: number }>;
  // Gasto del año base que dejará de proyectarse por categorías retiradas sin destino.
  droppedClp: number;
  categoryName: (id: string) => string;
  onUndo: (batchId: string) => void;
  onApply: () => Promise<boolean>;
  onReassign: (batchId: string, categoryId: string) => void;
}

const formatClp = (value: number) => `$ ${Math.round(value).toLocaleString("es-CL")}`;

const KIND_LABEL = { merge: "Fusión", rename: "Renombre", retire: "Retiro" } as const;

// Estado de los cambios de categorías del año planificado: avisos, lista con "Deshacer" y el paso "Aplicar categorías".
export const OpexCategoryChangesPanel = ({
  planYear,
  baseYear,
  batches,
  locked,
  baseYearClosed,
  busy,
  applyError,
  lastApply,
  blockingRetirements,
  retirementsWithBaseBudget,
  droppedClp,
  categoryName,
  onUndo,
  onApply,
  onReassign,
}: OpexCategoryChangesPanelProps) => {
  const [listOpen, setListOpen] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const pending = batches.filter((b) => !b.applied);
  // Los retiros se muestran aparte de las fusiones y los renombres.
  const mergeBatches = batches.filter((b) => b.kind !== "retire");
  const retireBatches = batches.filter((b) => b.kind === "retire");

  if (batches.length === 0 && !lastApply) return null;

  return (
    <div className="space-y-3 mb-4">
      {retirementsWithBaseBudget.length > 0 && (
        <Alert className="border-amber-500">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Retiradas con presupuesto {baseYear}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              El cierre de {baseYear} copiará su presupuesto a {planYear} y "Aplicar categorías {planYear}" no podrá
              ejecutarse hasta fusionarlas con otra categoría.
            </p>
            {retirementsWithBaseBudget.map((r) => (
              <div key={r.batchId} className="flex items-center justify-between gap-2">
                <span>
                  {categoryName(r.categoryId)} — presupuesto {baseYear}: {formatClp(r.amountClp)}
                </span>
                <Button size="sm" variant="outline" disabled={locked || busy} onClick={() => onReassign(r.batchId, r.categoryId)}>
                  Fusionar con...
                </Button>
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {blockingRetirements.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Estas categorías se retiraron sin destino, pero tienen montos para {planYear}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>No se borran presupuestos en silencio: para poder aplicar, fusiónalas con otra categoría.</p>
            {blockingRetirements.map((r) => (
              <div key={r.batchId} className="flex items-center justify-between gap-2">
                <span>{categoryName(r.categoryId)}</span>
                <Button size="sm" variant="outline" disabled={locked || busy} onClick={() => onReassign(r.batchId, r.categoryId)}>
                  Fusionar con...
                </Button>
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {droppedClp > 0 && (
        <Alert>
          <AlertDescription>
            El gasto {baseYear} de las categorías retiradas sin destino ({formatClp(droppedClp)}) ya no se proyecta en {planYear}.
          </AlertDescription>
        </Alert>
      )}

      {pending.length > 0 && !locked && (
        <Alert className="border-primary">
          <AlertTitle>
            {pending.length} cambio(s) de categorías para {planYear} sin aplicar
          </AlertTitle>
          <AlertDescription className="space-y-2">
            {baseYearClosed ? (
              <>
                <p>
                  El cierre de {baseYear} ya creó las filas de {planYear} con las categorías antiguas. Aplica los cambios
                  para pasarlas a las nuevas.
                </p>
                <Button size="sm" disabled={busy || blockingRetirements.length > 0} onClick={() => setConfirmApply(true)}>
                  Aplicar categorías {planYear}
                </Button>
              </>
            ) : (
              <p>
                Esta planificación ya los considera. Se aplican al presupuesto {planYear} después de cerrar {baseYear}:
                mientras tanto, el presupuesto que cree el cierre usará las categorías antiguas.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {applyError && blockingRetirements.length === 0 && (
        <Alert variant="destructive">
          <AlertDescription>{applyError}</AlertDescription>
        </Alert>
      )}

      {locked && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertTitle>Categorías {planYear} aplicadas</AlertTitle>
          <AlertDescription>
            Ya no se pueden fusionar, renombrar, retirar ni deshacer cambios de {planYear}.
            {lastApply && (
              <span className="block mt-1">
                Se unieron {lastApply.budget_rows_merged} filas de presupuesto y {lastApply.additional_rows_merged} de
                adicionales por local, y se movieron {lastApply.plan_items_moved} líneas de OPEX agregado.
                {lastApply.purchase_orders_with_old_category > 0 &&
                  ` Hay ${lastApply.purchase_orders_with_old_category} OC de ${planYear} que siguen con una categoría que cambió (no se modificaron).`}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {batches.length > 0 && (
        <Collapsible open={listOpen} onOpenChange={setListOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="justify-start">
              {listOpen ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
              Cambios de categorías {planYear} ({batches.length})
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3">
            <ChangeList
              title="Fusiones y renombres"
              batches={mergeBatches}
              emptyText="No hay fusiones ni renombres."
              categoryName={categoryName}
              busy={busy}
              locked={locked}
              onUndo={onUndo}
            />
            <ChangeList
              title="Retiros"
              batches={retireBatches}
              emptyText="No hay categorías retiradas."
              categoryName={categoryName}
              busy={busy}
              locked={locked}
              onUndo={onUndo}
            />
          </CollapsibleContent>
        </Collapsible>
      )}

      <AlertDialog open={confirmApply} onOpenChange={setConfirmApply}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar categorías {planYear}</AlertDialogTitle>
            <AlertDialogDescription>
              Pasa el presupuesto {planYear}, los adicionales por local y el OPEX agregado a las categorías nuevas,
              sumando las fusionadas. Es todo o nada y puede repetirse sin riesgo. No modifica ninguna OC ni el año{" "}
              {baseYear}. Después ya no se podrán fusionar, retirar ni deshacer cambios de {planYear}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirmApply(false);
                await onApply();
              }}
            >
              Aplicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

interface ChangeListProps {
  title: string;
  batches: CategoryChangeBatch[];
  emptyText: string;
  categoryName: (id: string) => string;
  busy: boolean;
  locked: boolean;
  onUndo: (batchId: string) => void;
}

export const ChangeList = ({ title, batches, emptyText, categoryName, busy, locked, onUndo }: ChangeListProps) => (
  <div className="space-y-1">
    <h4 className="text-sm font-medium">
      {title} ({batches.length})
    </h4>
    {batches.length === 0 ? (
      <p className="text-xs text-muted-foreground">{emptyText}</p>
    ) : (
      <ul className="space-y-1 text-sm">
        {batches.map((b) => (
          <li key={b.batchId} className="flex items-center justify-between gap-2 border rounded-md px-2 py-1">
            <span>
              <Badge variant="secondary" className="mr-2">{KIND_LABEL[b.kind]}</Badge>
              {b.fromIds.map(categoryName).join(" + ")}
              {b.toId && ` → ${categoryName(b.toId)}`}
              {b.kind === "retire" && " (retirada, sin destino)"}
            </span>
            {b.applied ? (
              <Badge variant="outline">Aplicado</Badge>
            ) : (
              <Button size="sm" variant="ghost" disabled={busy || locked} onClick={() => onUndo(b.batchId)}>
                <Undo2 className="h-4 w-4 mr-1" />
                Deshacer
              </Button>
            )}
          </li>
        ))}
      </ul>
    )}
  </div>
);
