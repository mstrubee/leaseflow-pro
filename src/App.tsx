import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PermissionSelectionProvider } from "@/contexts/PermissionSelectionContext";
import { FloatingPermissionSelector } from "@/components/admin/FloatingPermissionSelector";
import { TodayAlertsFloating } from "@/components/alerts/TodayAlertsFloating";
import { MainLayout } from "@/components/layout/MainLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
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
import CapexDashboard from "./pages/CapexDashboard";
import ReportsDashboard from "./pages/ReportsDashboard";
import KPIDashboard from "./pages/KPIDashboard";
import NotFound from "./pages/NotFound";
import SuppliersDashboard from "./pages/SuppliersDashboard";
import MaintenanceDashboard from "./pages/MaintenanceDashboard";
import Dashboard from "./pages/Dashboard";

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
            <TodayAlertsFloating />
            <Routes>
              {/* Public routes */}
              <Route path="/auth" element={<Auth />} />
              
              {/* Protected routes - require authentication */}
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><AdminPanel /></ProtectedRoute>} />
              <Route path="/contracts" element={<ProtectedRoute resource="contracts"><Contracts /></ProtectedRoute>} />
              <Route path="/contracts/new" element={<ProtectedRoute resource="contracts"><NewContract /></ProtectedRoute>} />
              <Route path="/contracts/bulk-upload" element={<ProtectedRoute resource="contracts"><BulkContractUpload /></ProtectedRoute>} />
              <Route path="/contracts/:id" element={<ProtectedRoute resource="contracts"><ContractDetail /></ProtectedRoute>} />
              <Route path="/contracts/:id/edit" element={<ProtectedRoute resource="contracts"><EditContract /></ProtectedRoute>} />
              <Route path="/deleted" element={<ProtectedRoute resource="contracts"><DeletedContracts /></ProtectedRoute>} />
              <Route path="/alerts" element={<ProtectedRoute resource="alerts"><AlertsDashboard /></ProtectedRoute>} />
              <Route path="/patents" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/purchase-orders" element={<ProtectedRoute resource="purchase_orders"><PurchaseOrdersDashboard /></ProtectedRoute>} />
              <Route path="/opex" element={<ProtectedRoute resource="opex"><OpexDashboard /></ProtectedRoute>} />
              <Route path="/capex" element={<ProtectedRoute resource="purchase_orders"><CapexDashboard /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute resource="reports"><ReportsDashboard /></ProtectedRoute>} />
              <Route path="/kpi" element={<ProtectedRoute resource="kpi"><KPIDashboard /></ProtectedRoute>} />
              <Route path="/suppliers" element={<ProtectedRoute resource="suppliers"><SuppliersDashboard /></ProtectedRoute>} />
              <Route path="/maintenance" element={<ProtectedRoute resource="maintenance"><MaintenanceDashboard /></ProtectedRoute>} />
              
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
