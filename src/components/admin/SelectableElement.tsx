import { ReactNode, useState } from "react";
import { usePermissionSelection, PermissionLevel } from "@/contexts/PermissionSelectionContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, Eye, Edit, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectableElementProps {
  elementId: string;
  label: string;
  children: ReactNode;
  className?: string;
}

const PERMISSION_OPTIONS: { value: PermissionLevel; label: string; icon: ReactNode; description: string }[] = [
  { value: "none", label: "Sin Acceso", icon: <EyeOff className="h-4 w-4" />, description: "No puede ver esta sección" },
  { value: "view", label: "Ver", icon: <Eye className="h-4 w-4" />, description: "Solo puede visualizar" },
  { value: "edit", label: "Editar", icon: <Edit className="h-4 w-4" />, description: "Puede ver, modificar y guardar" },
];

export const SelectableElement = ({ elementId, label, children, className }: SelectableElementProps) => {
  const { isSelecting, getElementPermission, setElementPermission, removeElementPermission } = usePermissionSelection();
  const [popoverOpen, setPopoverOpen] = useState(false);
  
  const currentPermission = getElementPermission(elementId);
  const isSelected = currentPermission !== "none";

  if (!isSelecting) {
    return <>{children}</>;
  }

  const handleSelectPermission = (permission: PermissionLevel) => {
    if (permission === "none") {
      removeElementPermission(elementId);
    } else {
      setElementPermission(elementId, label, permission);
    }
    setPopoverOpen(false);
  };

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <div
          className={cn(
            "relative cursor-pointer transition-all duration-200",
            isSelected 
              ? "ring-2 ring-primary ring-offset-2 rounded-lg" 
              : "hover:ring-2 hover:ring-primary/50 hover:ring-offset-2 rounded-lg",
            className
          )}
        >
          {children}
          {isSelected && (
            <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full p-1 shadow-md z-10">
              <Check className="h-3 w-3" />
            </div>
          )}
          <div className="absolute inset-0 bg-primary/5 rounded-lg pointer-events-none" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="space-y-1">
          <p className="text-sm font-medium mb-2 px-2">{label}</p>
          {PERMISSION_OPTIONS.map(option => (
            <Button
              key={option.value}
              variant={currentPermission === option.value ? "secondary" : "ghost"}
              className="w-full justify-start gap-2"
              onClick={() => handleSelectPermission(option.value)}
            >
              {option.icon}
              <div className="flex-1 text-left">
                <div className="text-sm">{option.label}</div>
                <div className="text-xs text-muted-foreground">{option.description}</div>
              </div>
              {currentPermission === option.value && <Check className="h-4 w-4 text-primary" />}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
