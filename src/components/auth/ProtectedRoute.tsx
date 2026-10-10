import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Un recurso único, o una lista de recursos donde basta con tener "view"
   *  sobre CUALQUIERA de ellos (OR) — útil para páginas como /reports cuya
   *  visibilidad puede otorgarse a través de un permiso general o de
   *  cualquiera de sus sub-secciones. */
  resource?: string | string[];
  /** Rol exigido a nivel de ruta (no solo ocultar la card) -- p.ej. /usuarios
   *  es exclusivo de gerente, igual que /admin ya lo era para admin. */
  requireRole?: "admin" | "gerente";
}

// Allowlist de rutas para equipo_gerencia: default-deny, no depende de que
// cada ruta nueva recuerde declarar el `resource` correcto (así se coló antes
// /dashboard, sin ningún gate, exponiendo estadísticas globales). Solo puede
// llegar a Home, listado/detalle de Contratos (nunca /new, /edit ni
// /bulk-upload) e Informes.
const EQUIPO_GERENCIA_ALLOWED_PATHS = [
  /^\/$/,
  /^\/contracts$/,
  /^\/contracts\/(?!new$|bulk-upload$)[^/]+$/,
  /^\/reports$/,
];

export function ProtectedRoute({ children, resource, requireRole }: ProtectedRouteProps) {
  const { user, loading, roleLoaded, hasPermission, isAdmin, isGerente, isEquipoGerencia } = useAuth();
  const location = useLocation();

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

  if (isEquipoGerencia && !EQUIPO_GERENCIA_ALLOWED_PATHS.some((re) => re.test(location.pathname))) {
    return <Navigate to="/" replace />;
  }

  if (requireRole === "admin" && !isAdmin) return <Navigate to="/" replace />;
  if (requireRole === "gerente" && !isGerente) return <Navigate to="/" replace />;

  // Redirect to dashboard if user lacks permission for this resource
  if (resource) {
    const resources = Array.isArray(resource) ? resource : [resource];
    const hasAny = resources.some(r => hasPermission(r, "view"));
    if (!hasAny) return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
