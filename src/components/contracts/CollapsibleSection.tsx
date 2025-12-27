import { useState, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  id: string;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  defaultCollapsed?: boolean;
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  isDraggable?: boolean;
  className?: string;
  /** If true, renders only header + children without Card wrapper - useful for components that have their own Card */
  wrapperOnly?: boolean;
  /** Additional actions to show in the header */
  headerActions?: ReactNode;
}

export function CollapsibleSection({
  id,
  title,
  icon,
  children,
  defaultCollapsed = false,
  isCollapsed: controlledCollapsed,
  onCollapsedChange,
  isDraggable = false,
  className,
  wrapperOnly = false,
  headerActions,
}: CollapsibleSectionProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  
  const isCollapsed = controlledCollapsed !== undefined ? controlledCollapsed : internalCollapsed;
  
  const handleToggle = () => {
    const newValue = !isCollapsed;
    if (onCollapsedChange) {
      onCollapsedChange(newValue);
    } else {
      setInternalCollapsed(newValue);
    }
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !isDraggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const headerContent = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2">
        {isDraggable && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleToggle}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
        <div
          className="flex items-center gap-2 text-base font-semibold cursor-pointer select-none"
          onClick={handleToggle}
        >
          {icon}
          {title}
        </div>
      </div>
      {headerActions && !isCollapsed && (
        <div className="flex items-center gap-2">
          {headerActions}
        </div>
      )}
    </div>
  );

  // Wrapper-only mode: just a div with drag support and collapse toggle
  if (wrapperOnly) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "transition-all duration-200 space-y-3",
          isDragging && "opacity-50 z-50",
          className
        )}
      >
        <div className="flex items-center gap-2 py-2 px-1 rounded-lg bg-muted/30 border border-border/50">
          {headerContent}
        </div>
        {!isCollapsed && (
          <div className="animate-fade-in">
            {children}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "transition-all duration-200",
        isDragging && "opacity-50 shadow-lg z-50",
        className
      )}
    >
      <CardHeader className="py-3 px-4">
        {headerContent}
      </CardHeader>
      {!isCollapsed && (
        <CardContent className="pt-0 animate-fade-in">
          {children}
        </CardContent>
      )}
    </Card>
  );
}
