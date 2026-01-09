import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Don't show Home button on the home page itself or on auth page
  const isHomePage = location.pathname === "/" || location.pathname === "/auth";

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed Home button - always visible except on home/auth */}
      {!isHomePage && (
        <div className="fixed top-4 left-4 z-50">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => navigate("/")}
                  className="h-10 w-10 rounded-full shadow-lg bg-card hover:bg-accent border-border"
                >
                  <Home className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Ir al Inicio</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
      {children}
    </div>
  );
}
