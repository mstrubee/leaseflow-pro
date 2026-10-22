import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Wallet } from "lucide-react";
import { ExpenseReportsModule } from "@/components/expenseReports/ExpenseReportsModule";

export default function ExpenseReportsDashboard() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b">
        <Button variant="ghost" size="sm" className="h-8 px-2 gap-1 text-xs" onClick={() => navigate("/maintenance/routes")}>
          <ArrowLeft className="w-3.5 h-3.5" /> Rutas
        </Button>
        <div className="flex items-center gap-1.5 ml-1">
          <Wallet className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Rendición de Gastos</span>
        </div>
      </div>
      <div className="max-w-2xl mx-auto p-4">
        <ExpenseReportsModule />
      </div>
    </div>
  );
}
