import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const SUPPLIERS_RETURN_KEY = "suppliers_return_url";
const SUPPLIERS_SCROLL_KEY = "suppliers_scroll_position";

export function useSuppliersNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const navigateToPurchaseOrdersFromSuppliers = (supplierName: string) => {
    sessionStorage.setItem(SUPPLIERS_RETURN_KEY, location.pathname + location.search);
    sessionStorage.setItem(SUPPLIERS_SCROLL_KEY, window.scrollY.toString());
    navigate(`/purchase-orders?supplier=${encodeURIComponent(supplierName)}`, { state: { fromSuppliers: true } });
  };

  const clearSuppliersReturn = () => {
    sessionStorage.removeItem(SUPPLIERS_RETURN_KEY);
    sessionStorage.removeItem(SUPPLIERS_SCROLL_KEY);
  };

  return { navigateToPurchaseOrdersFromSuppliers, clearSuppliersReturn };
}

export function SuppliersReturnButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const [returnUrl, setReturnUrl] = useState<string | null>(null);
  const [scrollPosition, setScrollPosition] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const storedUrl = sessionStorage.getItem(SUPPLIERS_RETURN_KEY);
    const storedScroll = sessionStorage.getItem(SUPPLIERS_SCROLL_KEY);

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
      sessionStorage.removeItem(SUPPLIERS_RETURN_KEY);
      sessionStorage.removeItem(SUPPLIERS_SCROLL_KEY);
      setIsVisible(false);
      setReturnUrl(null);
      setScrollPosition(null);

      navigate(url);

      if (scroll !== null) {
        setTimeout(() => {
          window.scrollTo({ top: scroll, behavior: "instant" });
        }, 100);
      }
    }
  };

  const handleClose = () => {
    sessionStorage.removeItem(SUPPLIERS_RETURN_KEY);
    sessionStorage.removeItem(SUPPLIERS_SCROLL_KEY);
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
          <div className="flex items-center gap-2 bg-emerald-600 text-white rounded-lg shadow-lg px-4 py-3 pr-2">
            <Building2 className="h-4 w-4" />
            <span className="text-sm font-medium">Viniste desde Proveedores</span>
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
