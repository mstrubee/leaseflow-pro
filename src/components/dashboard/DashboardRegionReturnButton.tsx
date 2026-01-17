import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const DASHBOARD_REGION_RETURN_KEY = "dashboard_region_return_url";
const DASHBOARD_REGION_SCROLL_KEY = "dashboard_region_scroll_position";

export function useDashboardRegionNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const navigateToContractFromDashboardRegion = (contractId: string) => {
    // Store the current dashboard URL and scroll position before navigating
    sessionStorage.setItem(DASHBOARD_REGION_RETURN_KEY, location.pathname + location.search);
    sessionStorage.setItem(DASHBOARD_REGION_SCROLL_KEY, window.scrollY.toString());
    navigate(`/contracts/${contractId}`, { state: { fromDashboardRegion: true } });
  };

  const clearDashboardRegionReturn = () => {
    sessionStorage.removeItem(DASHBOARD_REGION_RETURN_KEY);
    sessionStorage.removeItem(DASHBOARD_REGION_SCROLL_KEY);
  };

  return { navigateToContractFromDashboardRegion, clearDashboardRegionReturn };
}

export function DashboardRegionReturnButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const [returnUrl, setReturnUrl] = useState<string | null>(null);
  const [scrollPosition, setScrollPosition] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if we came from dashboard region
    const storedUrl = sessionStorage.getItem(DASHBOARD_REGION_RETURN_KEY);
    const storedScroll = sessionStorage.getItem(DASHBOARD_REGION_SCROLL_KEY);
    
    // Show button if there's a stored URL
    if (storedUrl) {
      setReturnUrl(storedUrl);
      setScrollPosition(storedScroll ? parseInt(storedScroll, 10) : null);
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [location.pathname, location.state]);

  const handleReturn = () => {
    if (returnUrl) {
      const url = returnUrl;
      const scroll = scrollPosition;
      sessionStorage.removeItem(DASHBOARD_REGION_RETURN_KEY);
      sessionStorage.removeItem(DASHBOARD_REGION_SCROLL_KEY);
      setIsVisible(false);
      setReturnUrl(null);
      setScrollPosition(null);
      
      navigate(url);
      
      // Restore scroll position after navigation
      if (scroll !== null) {
        setTimeout(() => {
          window.scrollTo({ top: scroll, behavior: "instant" });
        }, 100);
      }
    }
  };

  const handleClose = () => {
    sessionStorage.removeItem(DASHBOARD_REGION_RETURN_KEY);
    sessionStorage.removeItem(DASHBOARD_REGION_SCROLL_KEY);
    setIsVisible(false);
    setReturnUrl(null);
    setScrollPosition(null);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 100, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="fixed bottom-6 right-6 z-50"
        >
          <div className="flex items-center gap-2 bg-teal-600 text-white rounded-lg shadow-lg px-4 py-3 pr-2">
            <MapPin className="h-4 w-4" />
            <span className="text-sm font-medium">Viniste desde Contratos por Región</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleReturn}
              className="ml-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Volver
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-white/20"
              onClick={handleClose}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
