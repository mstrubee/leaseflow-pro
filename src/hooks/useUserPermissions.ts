import { useAuth } from "./useAuth";

/**
 * Lightweight wrapper over useAuth — uses already-loaded permissions
 * from AuthContext to avoid duplicate queries to user_permissions.
 */
export const useUserPermissions = () => {
  const { user, isAdmin, permissions: authPermissions, roleLoaded } = useAuth();

  const permissions = authPermissions.map((p) => ({
    resource: p.resource,
    permission: p.permission as string,
  }));

  const canView = (elementId: string): boolean => {
    if (isAdmin) return true;
    const perm = permissions.find((p) => p.resource === elementId);
    if (!perm) return true;
    return perm.permission === "view" || perm.permission === "edit" || perm.permission === "all";
  };

  const canEdit = (elementId: string): boolean => {
    if (isAdmin) return true;
    const perm = permissions.find((p) => p.resource === elementId);
    if (!perm) return true;
    return perm.permission === "edit" || perm.permission === "all";
  };

  const hasRestriction = (elementId: string): boolean =>
    permissions.some((p) => p.resource === elementId);

  const getPermission = (elementId: string): string | null => {
    const perm = permissions.find((p) => p.resource === elementId);
    return perm?.permission || null;
  };

  const isHidden = (elementId: string): boolean => {
    if (isAdmin) return false;
    if (permissions.length === 0) return false;

    const contractSectionIds = [
      "contract_address", "contract_contact", "contract_commercial",
      "contract_renegotiation", "contract_surfaces", "contract_documents",
      "contract_repository", "contract_gantt",
      "contract_alerts", "contract_patents",
    ];
    const dashboardSectionIds = [
      "dashboard_stats", "dashboard_map", "dashboard_economic", "dashboard_patents",
    ];

    const hasContractPermissions = permissions.some((p) =>
      contractSectionIds.includes(p.resource)
    );
    const hasDashboardPermissions = permissions.some((p) =>
      dashboardSectionIds.includes(p.resource)
    );

    if (hasContractPermissions && contractSectionIds.includes(elementId)) {
      return !permissions.some((p) => p.resource === elementId);
    }
    if (hasDashboardPermissions && dashboardSectionIds.includes(elementId)) {
      return !permissions.some((p) => p.resource === elementId);
    }
    return false;
  };

  return {
    permissions,
    loading: !roleLoaded,
    canView,
    canEdit,
    hasRestriction,
    getPermission,
    isHidden,
    refetch: () => {
      // No-op: data is owned by AuthProvider. Kept for backwards compatibility.
    },
  };
};
