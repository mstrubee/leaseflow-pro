import { useParams, Navigate } from "react-router-dom";
import { RouteExecutionView } from "@/components/maintenance/routes/RouteExecutionView";
import { useAuth } from "@/hooks/useAuth";

export default function RouteExecutionPage() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin, isOperador, loading } = useAuth();

  if (loading) return null;
  if (!isAdmin && !isOperador) return <Navigate to="/maintenance" replace />;
  if (!id) return <Navigate to="/maintenance/routes" replace />;

  return <RouteExecutionView routeId={id} />;
}
