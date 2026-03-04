import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { KPIModule } from "@/components/kpi/KPIModule";
import { SelectableElement } from "@/components/admin/SelectableElement";

export default function KPIDashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="container mx-auto py-6 px-4">
      <SelectableElement elementId="kpi" label="KPI">
        <KPIModule />
      </SelectableElement>
    </div>
  );
}
