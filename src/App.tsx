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
            <TodayAlertsFloating />
            <Routes>
              {/* Public routes */}
              <Route path="/auth" element={<Auth />} />
              
              {/* Protected routes - require authentication */}
              <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute><AdminPanel /></ProtectedRoute>} />
              <Route path="/contracts" element={<ProtectedRoute><Contracts /></ProtectedRoute>} />
              <Route path="/contracts/new" element={<ProtectedRoute><NewContract /></ProtectedRoute>} />
              <Route path="/contracts/bulk-upload" element={<ProtectedRoute><BulkContractUpload /></ProtectedRoute>} />
              <Route path="/contracts/:id" element={<ProtectedRoute><ContractDetail /></ProtectedRoute>} />
              <Route path="/contracts/:id/edit" element={<ProtectedRoute><EditContract /></ProtectedRoute>} />
              <Route path="/deleted" element={<ProtectedRoute><DeletedContracts /></ProtectedRoute>} />
              <Route path="/alerts" element={<ProtectedRoute><AlertsDashboard /></ProtectedRoute>} />
              <Route path="/patents" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/purchase-orders" element={<ProtectedRoute><PurchaseOrdersDashboard /></ProtectedRoute>} />
              <Route path="/opex" element={<ProtectedRoute><OpexDashboard /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><ReportsDashboard /></ProtectedRoute>} />
              <Route path="/kpi" element={<ProtectedRoute><KPIDashboard /></ProtectedRoute>} />
              
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
