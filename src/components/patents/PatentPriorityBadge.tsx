import { Badge } from "@/components/ui/badge";
import { PatentPriority, PRIORITY_CONFIG } from "./types";

interface PatentPriorityBadgeProps {
  priority: PatentPriority;
  size?: "sm" | "default";
}

export function PatentPriorityBadge({ priority, size = "default" }: PatentPriorityBadgeProps) {
  const config = PRIORITY_CONFIG[priority];
  
  return (
    <Badge 
      className={`${config.bgColor} ${config.textColor} border-0 ${size === "sm" ? "text-xs px-1.5 py-0" : ""}`}
      variant="outline"
    >
      {config.label}
    </Badge>
  );
}
