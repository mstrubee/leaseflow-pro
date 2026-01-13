import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PermissionSelectionProvider } from "@/contexts/PermissionSelectionContext";
import { FloatingPermissionSelector } from "@/components/admin/FloatingPermissionSelector";
import { MainLayout } from "@/components/layout/MainLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NewContract from "./pages/NewContract";
import ContractDetail from "./pages/ContractDetail";
import EditContract from "./pages/EditContract";
import AdminPanel from "./pages/AdminPanel";
import Contracts from "./pages/Contracts";
import DeletedContracts from "./pages/DeletedContracts";
import AlertsDashboard from "./pages/AlertsDashboard";
import BulkContractUpload from "./pages/BulkContractUpload";
import PurchaseOrdersDashboard from "./pages/PurchaseOrdersDashboard";
import OpexDashboard from "./pages/OpexDashboard";
import ReportsDashboard from "./pages/ReportsDashboard";
import KPIDashboard from "./pages/KPIDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <PermissionSelectionProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <MainLayout>
            <FloatingPermissionSelector />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/contracts" element={<Contracts />} />
              <Route path="/contracts/new" element={<NewContract />} />
              <Route path="/contracts/bulk-upload" element={<BulkContractUpload />} />
              <Route path="/contracts/:id" element={<ContractDetail />} />
              <Route path="/contracts/:id/edit" element={<EditContract />} />
              <Route path="/deleted" element={<DeletedContracts />} />
              <Route path="/alerts" element={<AlertsDashboard />} />
              <Route path="/patents" element={<Index />} />
              <Route path="/purchase-orders" element={<PurchaseOrdersDashboard />} />
              <Route path="/opex" element={<OpexDashboard />} />
              <Route path="/reports" element={<ReportsDashboard />} />
              <Route path="/kpi" element={<KPIDashboard />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </MainLayout>
        </BrowserRouter>
      </PermissionSelectionProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
