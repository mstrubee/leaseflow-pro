import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { FixedAssetsModule } from "@/components/fixed-assets/FixedAssetsModule";
import { SelectableElement } from "@/components/admin/SelectableElement";

const FixedAssetsDashboard = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SelectableElement elementId="fixed_assets" label="Activos Fijos">
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Activos Fijos</h1>
                <p className="text-sm text-muted-foreground">
                  Inventario de activos fijos y asignación a contratos
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-[1536px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <FixedAssetsModule />
        </main>
      </SelectableElement>
    </div>
  );
};

export default FixedAssetsDashboard;
