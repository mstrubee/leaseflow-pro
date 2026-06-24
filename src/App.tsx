import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { prefetchAllRoutesWhenIdle } from "@/lib/routePrefetch";
import { PermissionSelectionProvider } from "@/contexts/PermissionSelectionContext";
import { FloatingPermissionSelector } from "@/components/admin/FloatingPermissionSelector";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { TodayAlertsFloating } from "@/components/alerts/TodayAlertsFloating";
import { MainLayout } from "@/components/layout/MainLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";

// Lazy-loaded pages (code-splitting)
const NewContract = lazy(() => import("./pages/NewContract"));
const ContractDetail = lazy(() => import("./pages/ContractDetail"));
const EditContract = lazy(() => import("./pages/EditContract"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const Contracts = lazy(() => import("./pages/Contracts"));
const DeletedContracts = lazy(() => import("./pages/DeletedContracts"));
const AlertsDashboard = lazy(() => import("./pages/AlertsDashboard"));
const BulkContractUpload = lazy(() => import("./pages/BulkContractUpload"));
const BulkOCImport = lazy(() => import("./pages/BulkOCImport"));
const PurchaseOrdersDashboard = lazy(() => import("./pages/PurchaseOrdersDashboard"));
const OpexDashboard = lazy(() => import("./pages/OpexDashboard"));
const CapexDashboard = lazy(() => import("./pages/CapexDashboard"));
const ReportsDashboard = lazy(() => import("./pages/ReportsDashboard"));
const KPIDashboard = lazy(() => import("./pages/KPIDashboard"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SuppliersDashboard = lazy(() => import("./pages/SuppliersDashboard"));
const MaintenanceDashboard = lazy(() => import("./pages/MaintenanceDashboard"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const PatentsDashboard = lazy(() => import("./pages/PatentsDashboard"));
const SpecialAttentionPage = lazy(() => import("./pages/SpecialAttentionPage"));
const GoogleDriveCallback = lazy(() => import("./pages/GoogleDriveCallback"));
const GeoLocPage = lazy(() => import("./pages/GeoLocPage"));
const MaintenanceRoutesPage = lazy(() => import("./pages/MaintenanceRoutesPage"));
const RouteExecutionPage = lazy(() => import("./pages/RouteExecutionPage"));

const queryClient = new QueryClient();

function ConditionalFloatingAlerts() {
  const location = useLocation();
  useEffect(() => { prefetchAllRoutesWhenIdle(); }, []);
  if (location.pathname === "/" || location.pathname === "/auth") return null;
  return <TodayAlertsFloating />;
}

const RouteFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <PermissionSelectionProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <MainLayout>
              <FloatingPermissionSelector />
              <ConditionalFloatingAlerts />
              <ErrorBoundary>
              <Suspense fallback={<RouteFallback />}>
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
                  <Route path="/patents" element={<ProtectedRoute><PatentsDashboard /></ProtectedRoute>} />
                  <Route path="/purchase-orders" element={<ProtectedRoute resource="purchase_orders"><PurchaseOrdersDashboard /></ProtectedRoute>} />
                  <Route path="/purchase-orders/bulk-import" element={<ProtectedRoute resource="purchase_orders"><BulkOCImport /></ProtectedRoute>} />
                  <Route path="/opex" element={<ProtectedRoute resource="opex"><OpexDashboard /></ProtectedRoute>} />
                  <Route path="/capex" element={<ProtectedRoute resource="capex"><CapexDashboard /></ProtectedRoute>} />
                  <Route path="/reports" element={<ProtectedRoute resource="reports"><ReportsDashboard /></ProtectedRoute>} />
                  <Route path="/kpi" element={<ProtectedRoute resource="kpi"><KPIDashboard /></ProtectedRoute>} />
                  <Route path="/suppliers" element={<ProtectedRoute resource="suppliers"><SuppliersDashboard /></ProtectedRoute>} />
                  <Route path="/special-attention" element={<ProtectedRoute><SpecialAttentionPage /></ProtectedRoute>} />
                  <Route path="/maintenance" element={<ProtectedRoute resource="maintenance"><MaintenanceDashboard /></ProtectedRoute>} />
                  <Route path="/maintenance/routes" element={<ProtectedRoute resource="maintenance"><MaintenanceRoutesPage /></ProtectedRoute>} />
                  <Route path="/maintenance/routes/:id/execute" element={<ProtectedRoute><RouteExecutionPage /></ProtectedRoute>} />
                  <Route path="/geoloc" element={<ProtectedRoute resource="geoloc"><GeoLocPage /></ProtectedRoute>} />
                  
                  <Route path="/google-drive-callback" element={<GoogleDriveCallback />} />
                  
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              </ErrorBoundary>
            </MainLayout>
          </BrowserRouter>
        </PermissionSelectionProvider>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
