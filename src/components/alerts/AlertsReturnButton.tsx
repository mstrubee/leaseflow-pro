import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Bell, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ALERTS_RETURN_KEY = "alerts_return_url";

export function useAlertsNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const navigateToContractFromAlerts = (contractId: string) => {
    // Store the current alerts URL before navigating
    sessionStorage.setItem(ALERTS_RETURN_KEY, location.pathname + location.search);
    navigate(`/contracts/${contractId}`, { state: { fromAlerts: true } });
  };

  const clearAlertsReturn = () => {
    sessionStorage.removeItem(ALERTS_RETURN_KEY);
  };

  return { navigateToContractFromAlerts, clearAlertsReturn };
}

export function AlertsReturnButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const [returnUrl, setReturnUrl] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if we came from alerts - check sessionStorage first
    const storedUrl = sessionStorage.getItem(ALERTS_RETURN_KEY);
    const fromAlerts = (location.state as any)?.fromAlerts;
    
    console.log("AlertsReturnButton check:", { storedUrl, fromAlerts, pathname: location.pathname });
    
    // Show button if there's a stored URL (we're on a contract page coming from alerts)
    if (storedUrl) {
      setReturnUrl(storedUrl);
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [location.pathname, location.state]);

  const handleReturn = () => {
    console.log("handleReturn called, returnUrl:", returnUrl);
    if (returnUrl) {
      const url = returnUrl;
      sessionStorage.removeItem(ALERTS_RETURN_KEY);
      setIsVisible(false);
      setReturnUrl(null);
      navigate(url);
    }
  };

  const handleClose = () => {
    sessionStorage.removeItem(ALERTS_RETURN_KEY);
    setIsVisible(false);
    setReturnUrl(null);
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
          <div className="flex items-center gap-2 bg-primary text-primary-foreground rounded-lg shadow-lg px-4 py-3 pr-2">
            <Bell className="h-4 w-4" />
            <span className="text-sm font-medium">Viniste desde Alertas</span>
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
              className="h-6 w-6 hover:bg-primary-foreground/20"
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