import type { OCRequestShareData } from "@/lib/ocRequestShare";
import { loadBudgetLineAmountsClp } from "@/lib/budgetTotals";
import { loadContractCebesByCompany } from "@/lib/contractCebe";
import { loadCebeRowLabels } from "@/lib/cebeRowLabels";

/**
 * Completa los datos del PDF "Solicitud de OC" con lo que sale del Control de Presupuesto y del
 * CEBE por empresa:
 *  - `authorizedClp` de cada línea: su monto autorizado en el control presupuestario (no lo imputado).
 *  - `cebeByCompany`: el CEBE de cada empresa del contrato, para la fila "CONTRATO(S)".
 *  - rótulo de cada fila de la distribución por CEBE: "Empresa / CEBE X / CO N" (una sola línea).
 *
 * Cada parte es independiente y tolerante a fallos: si algo no se puede leer, el PDF se genera igual
 * con los datos que ya traía (nunca debe impedir descargar la solicitud).
 *
 * `ufValue` es el valor UF con que se convierte el monto de las líneas a pesos (el mismo del control).
 */
export async function enrichShareData(
  data: OCRequestShareData,
  opts: { ufValue: number; contractId?: string | null },
): Promise<OCRequestShareData> {
  let out = data;

  try {
    const lineIds = data.lines.map((l) => l.lineId).filter((id): id is string => !!id);
    if (lineIds.length > 0 && opts.ufValue > 0) {
      const amounts = await loadBudgetLineAmountsClp(lineIds, opts.ufValue);
      out = {
        ...out,
        lines: out.lines.map((l) =>
          l.lineId && amounts.has(l.lineId) ? { ...l, authorizedClp: amounts.get(l.lineId) } : l,
        ),
      };
    }
  } catch (error) {
    console.error("No se pudo leer el monto autorizado de las líneas para el PDF:", error);
  }

  try {
    // Solo solicitudes de UN contrato (en multi-contrato cada línea ya trae su propio contrato y CEBE).
    if (opts.contractId && data.contractNames.length === 1 && data.cebeByCompany === undefined) {
      out = { ...out, cebeByCompany: await loadContractCebesByCompany(opts.contractId) };
    }
  } catch (error) {
    console.error("No se pudo leer el CEBE por empresa para el PDF:", error);
  }

  try {
    const dist = out.cebeDistribution;
    if (dist && dist.length >= 2 && dist.some((d) => d.cebeId)) {
      const labels = await loadCebeRowLabels(dist.map((d) => d.cebeId ?? ""));
      out = { ...out, cebeDistribution: dist.map((d) => ({ ...d, label: (d.cebeId && labels.get(d.cebeId)) || d.label })) };
    }
  } catch (error) {
    console.error("No se pudo rotular la distribución por CEBE para el PDF:", error);
  }

  return out;
}
