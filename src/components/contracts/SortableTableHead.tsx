import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortOrder = "asc" | "desc" | null;

interface SortableTableHeadProps {
  label: string | React.ReactNode;
  sortKey: string;
  currentSortKey: string | null;
  currentSortOrder: SortOrder;
  onSort: (key: string) => void;
  className?: string;
  align?: "left" | "center" | "right";
}

export function SortableTableHead({
  label,
  sortKey,
  currentSortKey,
  currentSortOrder,
  onSort,
  className,
  align = "left",
}: SortableTableHeadProps) {
  const isActive = currentSortKey === sortKey;
  
  const alignClass = align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start";

  return (
    <TableHead className={cn("font-semibold", className)}>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 px-2 -mx-2 font-semibold hover:bg-muted/80 flex items-center gap-1 w-full",
          alignClass,
          isActive && "text-primary"
        )}
        onClick={() => onSort(sortKey)}
      >
        {typeof label === "string" ? <span>{label}</span> : label}
        {isActive ? (
          currentSortOrder === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        )}
      </Button>
    </TableHead>
  );
}
