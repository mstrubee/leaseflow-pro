import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const REPORTS_RETURN_KEY = "reports_return_url";

export function useReportsNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const navigateToContractFromReports = (contractId: string, section?: string) => {
    // Store the current reports URL before navigating
    sessionStorage.setItem(REPORTS_RETURN_KEY, location.pathname + location.search);
    const sectionParam = section ? `?section=${section}` : "";
    navigate(`/contracts/${contractId}${sectionParam}`, { state: { fromReports: true } });
  };

  const clearReportsReturn = () => {
    sessionStorage.removeItem(REPORTS_RETURN_KEY);
  };

  return { navigateToContractFromReports, clearReportsReturn };
}

export function ReportsReturnButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const [returnUrl, setReturnUrl] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if we came from reports - check sessionStorage first
    const storedUrl = sessionStorage.getItem(REPORTS_RETURN_KEY);
    
    // Show button if there's a stored URL (we're on a contract page coming from reports)
    if (storedUrl) {
      setReturnUrl(storedUrl);
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [location.pathname, location.state]);

  const handleReturn = () => {
    if (returnUrl) {
      const url = returnUrl;
      sessionStorage.removeItem(REPORTS_RETURN_KEY);
      setIsVisible(false);
      setReturnUrl(null);
      navigate(url);
    }
  };

  const handleClose = () => {
    sessionStorage.removeItem(REPORTS_RETURN_KEY);
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
          <div className="flex items-center gap-2 bg-blue-600 text-white rounded-lg shadow-lg px-4 py-3 pr-2">
            <FileText className="h-4 w-4" />
            <span className="text-sm font-medium">Viniste desde Informes</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleReturn}
              className="ml-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Volver a Informes
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-white/20 text-white"
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
