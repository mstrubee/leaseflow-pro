import { Badge } from "@/components/ui/badge";
import { PatentDocStatus, STATUS_CONFIG } from "./types";

interface PatentStatusBadgeProps {
  status: PatentDocStatus;
  size?: "sm" | "default";
}

const DEFAULT_CONFIG = { label: 'Desconocido', bgColor: 'bg-gray-100', textColor: 'text-gray-800' };

export function PatentStatusBadge({ status, size = "default" }: PatentStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || DEFAULT_CONFIG;
  
  return (
    <Badge 
      className={`${config.bgColor} ${config.textColor} border-0 ${size === "sm" ? "text-xs px-1.5 py-0" : ""}`}
      variant="outline"
    >
      {config.label}
    </Badge>
  );
}
