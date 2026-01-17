import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Wallet, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const OPEX_RETURN_KEY = "opex_return_url";
const OPEX_SCROLL_KEY = "opex_scroll_position";

export function useOpexNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const navigateToContractFromOpex = (contractId: string) => {
    // Store the current opex URL and scroll position before navigating
    sessionStorage.setItem(OPEX_RETURN_KEY, location.pathname + location.search);
    sessionStorage.setItem(OPEX_SCROLL_KEY, window.scrollY.toString());
    navigate(`/contracts/${contractId}`, { state: { fromOpex: true } });
  };

  const clearOpexReturn = () => {
    sessionStorage.removeItem(OPEX_RETURN_KEY);
    sessionStorage.removeItem(OPEX_SCROLL_KEY);
  };

  return { navigateToContractFromOpex, clearOpexReturn };
}

export function OpexReturnButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const [returnUrl, setReturnUrl] = useState<string | null>(null);
  const [scrollPosition, setScrollPosition] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if we came from opex - check sessionStorage first
    const storedUrl = sessionStorage.getItem(OPEX_RETURN_KEY);
    const storedScroll = sessionStorage.getItem(OPEX_SCROLL_KEY);
    
    // Show button if there's a stored URL (we're on a contract page coming from opex)
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
      sessionStorage.removeItem(OPEX_RETURN_KEY);
      sessionStorage.removeItem(OPEX_SCROLL_KEY);
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
    sessionStorage.removeItem(OPEX_RETURN_KEY);
    sessionStorage.removeItem(OPEX_SCROLL_KEY);
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
          <div className="flex items-center gap-2 bg-orange-600 text-white rounded-lg shadow-lg px-4 py-3 pr-2">
            <Wallet className="h-4 w-4" />
            <span className="text-sm font-medium">Viniste desde OPEX</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleReturn}
              className="ml-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Volver a OPEX
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
