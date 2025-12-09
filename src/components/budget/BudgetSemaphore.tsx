import { cn } from "@/lib/utils";

interface BudgetSemaphoreProps {
  budget: number;
  consumed: number;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export const BudgetSemaphore = ({ budget, consumed, showLabel = true, size = "md" }: BudgetSemaphoreProps) => {
  const percentage = budget > 0 ? (consumed / budget) * 100 : 0;
  
  const getStatus = () => {
    if (percentage >= 100) return { color: "bg-red-500", label: "Superado", textColor: "text-red-700" };
    if (percentage > 80) return { color: "bg-yellow-500", label: "Advertencia", textColor: "text-yellow-700" };
    return { color: "bg-green-500", label: "OK", textColor: "text-green-700" };
  };

  const status = getStatus();
  const sizeClasses = {
    sm: "h-2 w-2",
    md: "h-3 w-3",
    lg: "h-4 w-4",
  };

  return (
    <div className="flex items-center gap-2">
      <div className={cn("rounded-full", sizeClasses[size], status.color)} />
      {showLabel && (
        <span className={cn("text-sm font-medium", status.textColor)}>
          {status.label} ({percentage.toFixed(1)}%)
        </span>
      )}
    </div>
  );
};
