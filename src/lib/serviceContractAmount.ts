export type PricingMode = "total" | "per_branch";

/**
 * Monto efectivo del contrato:
 * - "total": el monto ingresado es el total del contrato.
 * - "per_branch": el monto ingresado es por sucursal; se multiplica por
 *   la cantidad de locales/sucursales asociados.
 */
export function effectiveAmount(base: number, mode: PricingMode, branchCount: number): number {
  return mode === "per_branch" ? base * branchCount : base;
}
