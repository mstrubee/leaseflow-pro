import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface ProtectedRouteProps {
  children: ReactNode;
  resource?: string;
}

export function ProtectedRoute({ children, resource }: ProtectedRouteProps) {
  const { user, loading, roleLoaded, hasPermission, isAdmin } = useAuth();

  const decision =
    loading || !roleLoaded ? "SPINNER" :
    !user ? "→/auth" :
    resource && !hasPermission(resource, "view") ? "→/" :
    "ALLOW";
  console.log(`[PR] resource=${resource ?? "-"} decision=${decision} loading=${loading} roleLoaded=${roleLoaded} user=${!!user} isAdmin=${isAdmin} path=${window.location.pathname}`);

  // Show loading spinner while checking authentication
  if (loading || !roleLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Redirect to auth if not authenticated
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Redirect to dashboard if user lacks permission for this resource
  if (resource && !hasPermission(resource, "view")) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
