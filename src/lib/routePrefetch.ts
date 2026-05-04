// Route chunk prefetcher.
// Triggers the same dynamic import() that React.lazy uses in App.tsx,
// so by the time the user actually clicks the navigation, the chunk is
// already in the browser cache and the route mounts instantly.
//
// Idempotent: each route is prefetched at most once per page load.

const started = new Set<string>();

const loaders: Record<string, () => Promise<unknown>> = {
  ContractDetail: () => import("@/pages/ContractDetail"),
  EditContract: () => import("@/pages/EditContract"),
  NewContract: () => import("@/pages/NewContract"),
  Contracts: () => import("@/pages/Contracts"),
  AlertsDashboard: () => import("@/pages/AlertsDashboard"),
  ReportsDashboard: () => import("@/pages/ReportsDashboard"),
  Dashboard: () => import("@/pages/Dashboard"),
  KPIDashboard: () => import("@/pages/KPIDashboard"),
  OpexDashboard: () => import("@/pages/OpexDashboard"),
  CapexDashboard: () => import("@/pages/CapexDashboard"),
  PurchaseOrdersDashboard: () => import("@/pages/PurchaseOrdersDashboard"),
  MaintenanceDashboard: () => import("@/pages/MaintenanceDashboard"),
  PatentsDashboard: () => import("@/pages/PatentsDashboard"),
  SuppliersDashboard: () => import("@/pages/SuppliersDashboard"),
  SpecialAttentionPage: () => import("@/pages/SpecialAttentionPage"),
  AdminPanel: () => import("@/pages/AdminPanel"),
  DeletedContracts: () => import("@/pages/DeletedContracts"),
  GeoLocPage: () => import("@/pages/GeoLocPage"),
};

export type PrefetchableRoute = keyof typeof loaders;

export function prefetchRoute(name: PrefetchableRoute) {
  if (started.has(name)) return;
  started.add(name);
  const loader = loaders[name];
  if (!loader) return;
  // Fire and forget. Errors are non-fatal (the real navigation will retry).
  loader().catch(() => started.delete(name));
}

/**
 * Hover/focus handler bundle for navigation buttons/links.
 *
 * Usage:
 *   <Button {...prefetchOn("ContractDetail")} onClick={...}>...</Button>
 */
export function prefetchOn(name: PrefetchableRoute) {
  const handler = () => prefetchRoute(name);
  return {
    onMouseEnter: handler,
    onFocus: handler,
    onTouchStart: handler,
  };
}
