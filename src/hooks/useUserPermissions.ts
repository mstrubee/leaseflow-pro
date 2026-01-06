import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface UserPermission {
  resource: string;
  permission: string;
}

export const useUserPermissions = () => {
  const { user, isAdmin } = useAuth();
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      loadPermissions();
    } else {
      setPermissions([]);
      setLoading(false);
    }
  }, [user?.id]);

  const loadPermissions = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from("user_permissions")
        .select("resource, permission")
        .eq("user_id", user.id);

      if (error) throw error;
      setPermissions(data || []);
    } catch (error) {
      console.error("Error loading user permissions:", error);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  };

  // Check if user can view/access a specific element
  const canView = (elementId: string): boolean => {
    if (isAdmin) return true;
    
    const perm = permissions.find(p => p.resource === elementId);
    if (!perm) return true; // If no specific permission set, allow by default
    
    return perm.permission === "view" || perm.permission === "edit" || perm.permission === "all";
  };

  // Check if user can edit a specific element
  const canEdit = (elementId: string): boolean => {
    if (isAdmin) return true;
    
    const perm = permissions.find(p => p.resource === elementId);
    if (!perm) return true;
    
    return perm.permission === "edit" || perm.permission === "all";
  };

  // Check if element has any restriction set for this user
  const hasRestriction = (elementId: string): boolean => {
    return permissions.some(p => p.resource === elementId);
  };

  // Get the specific permission level for an element
  const getPermission = (elementId: string): string | null => {
    const perm = permissions.find(p => p.resource === elementId);
    return perm?.permission || null;
  };

  // Check if this element is hidden for the user
  // An element is hidden if there's NO permission record for it when other elements exist
  const isHidden = (elementId: string): boolean => {
    if (isAdmin) return false;
    if (permissions.length === 0) return false; // No restrictions at all
    
    // Check if there are any contract section permissions
    const contractSectionIds = [
      "contract_address", "contract_contact", "contract_commercial", 
      "contract_surfaces", "contract_documents", "contract_repository",
      "contract_budget", "contract_gantt", "contract_alerts", "contract_patents"
    ];
    
    // Dashboard section IDs
    const dashboardSectionIds = [
      "dashboard_stats", "dashboard_map", "dashboard_economic", "dashboard_patents"
    ];
    
    // Main resource IDs
    const mainResourceIds = ["contracts", "dashboard", "repository", "suppliers"];
    
    const hasContractPermissions = permissions.some(p => 
      contractSectionIds.includes(p.resource)
    );
    
    const hasDashboardPermissions = permissions.some(p => 
      dashboardSectionIds.includes(p.resource)
    );
    
    // If user has any contract section permissions, check if this element is included
    if (hasContractPermissions && contractSectionIds.includes(elementId)) {
      return !permissions.some(p => p.resource === elementId);
    }
    
    // If user has any dashboard section permissions, check if this element is included
    if (hasDashboardPermissions && dashboardSectionIds.includes(elementId)) {
      return !permissions.some(p => p.resource === elementId);
    }
    
    return false;
  };

  return {
    permissions,
    loading,
    canView,
    canEdit,
    hasRestriction,
    getPermission,
    isHidden,
    refetch: loadPermissions,
  };
};
