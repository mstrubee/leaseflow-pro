import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertTriangle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const SA_RETURN_KEY = "special_attention_return_url";
const SA_SCROLL_KEY = "special_attention_scroll_position";

export function useSpecialAttentionNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const navigateToContract = (contractId: string) => {
    sessionStorage.setItem(SA_RETURN_KEY, location.pathname + location.search);
    sessionStorage.setItem(SA_SCROLL_KEY, window.scrollY.toString());
    navigate(`/contracts/${contractId}`);
  };

  return { navigateToContract };
}

export function SpecialAttentionReturnButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const [returnUrl, setReturnUrl] = useState<string | null>(null);
  const [scrollPosition, setScrollPosition] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const storedUrl = sessionStorage.getItem(SA_RETURN_KEY);
    const storedScroll = sessionStorage.getItem(SA_SCROLL_KEY);
    if (storedUrl) {
      setReturnUrl(storedUrl);
      setScrollPosition(storedScroll ? parseInt(storedScroll, 10) : null);
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [location.pathname]);

  const handleReturn = () => {
    if (returnUrl) {
      const url = returnUrl;
      const scroll = scrollPosition;
      sessionStorage.removeItem(SA_RETURN_KEY);
      sessionStorage.removeItem(SA_SCROLL_KEY);
      setIsVisible(false);
      navigate(url);
      if (scroll !== null) {
        setTimeout(() => window.scrollTo({ top: scroll, behavior: "instant" }), 100);
      }
    }
  };

  const handleClose = () => {
    sessionStorage.removeItem(SA_RETURN_KEY);
    sessionStorage.removeItem(SA_SCROLL_KEY);
    setIsVisible(false);
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
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">Viniste desde Atención Especial</span>
            <Button variant="secondary" size="sm" onClick={handleReturn} className="ml-2">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Volver
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-primary-foreground/20" onClick={handleClose}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
