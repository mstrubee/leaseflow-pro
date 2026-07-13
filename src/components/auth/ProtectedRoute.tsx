import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Un recurso único, o una lista de recursos donde basta con tener "view"
   *  sobre CUALQUIERA de ellos (OR) — útil para páginas como /reports cuya
   *  visibilidad puede otorgarse a través de un permiso general o de
   *  cualquiera de sus sub-secciones. */
  resource?: string | string[];
}

export function ProtectedRoute({ children, resource }: ProtectedRouteProps) {
  const { user, loading, roleLoaded, hasPermission } = useAuth();

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
  if (resource) {
    const resources = Array.isArray(resource) ? resource : [resource];
    const hasAny = resources.some(r => hasPermission(r, "view"));
    if (!hasAny) return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
