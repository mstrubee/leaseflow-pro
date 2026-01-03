import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface EditableSectionWrapperProps {
  id: string;
  title: string;
  children: ReactNode;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isDraggable: boolean;
}

export function EditableSectionWrapper({
  id,
  title,
  children,
  isCollapsed,
  onToggleCollapse,
  isDraggable,
}: EditableSectionWrapperProps) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "border border-border rounded-lg bg-card",
        isDragging && "opacity-50 z-50"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-muted/50 rounded-t-lg",
          isCollapsed && "rounded-b-lg"
        )}
        onClick={onToggleCollapse}
      >
        {isDraggable && (
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 -ml-2 hover:bg-muted rounded"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
        <span className="text-sm font-medium">{title}</span>
      </div>
      {!isCollapsed && (
        <div className="px-4 pb-4 pt-2 space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}
