import { useParams, Navigate } from "react-router-dom";
import { RouteExecutionView } from "@/components/maintenance/routes/RouteExecutionView";
import { useAuth } from "@/hooks/useAuth";

export default function RouteExecutionPage() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin, hasPermission, loading } = useAuth();

  if (loading) return null;
  if (!isAdmin && !hasPermission("maintenance_ejecutar_rutas", "edit")) return <Navigate to="/maintenance" replace />;
  if (!id) return <Navigate to="/maintenance/routes" replace />;

  return <RouteExecutionView routeId={id} />;
}
