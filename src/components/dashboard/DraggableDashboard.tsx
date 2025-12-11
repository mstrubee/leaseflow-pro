import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GripVertical, Eye, EyeOff, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export interface DashboardSection {
  key: string;
  title: string;
  component: React.ReactNode;
  isVisible: boolean;
  order: number;
}

interface SortableItemProps {
  section: DashboardSection;
  onToggleVisibility: (key: string) => void;
}

function SortableItem({ section, onToggleVisibility }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      <span className="flex-1 text-sm font-medium">{section.title}</span>
      <Switch
        checked={section.isVisible}
        onCheckedChange={() => onToggleVisibility(section.key)}
      />
    </div>
  );
}

interface DraggableDashboardProps {
  sections: DashboardSection[];
  onSectionsChange: (sections: DashboardSection[]) => void;
}

export function DraggableDashboard({ sections, onSectionsChange }: DraggableDashboardProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [localSections, setLocalSections] = useState(sections);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    setLocalSections(sections);
  }, [sections]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localSections.findIndex((s) => s.key === active.id);
      const newIndex = localSections.findIndex((s) => s.key === over.id);

      const newSections = arrayMove(localSections, oldIndex, newIndex).map(
        (s, index) => ({ ...s, order: index })
      );

      setLocalSections(newSections);
      onSectionsChange(newSections);
      saveSectionsToDb(newSections);
    }
  };

  const handleToggleVisibility = (key: string) => {
    const newSections = localSections.map((s) =>
      s.key === key ? { ...s, isVisible: !s.isVisible } : s
    );
    setLocalSections(newSections);
    onSectionsChange(newSections);
    saveSectionsToDb(newSections);
  };

  const saveSectionsToDb = async (sectionsToSave: DashboardSection[]) => {
    if (!user) return;

    try {
      for (const section of sectionsToSave) {
        await supabase
          .from("dashboard_sections")
          .upsert({
            user_id: user.id,
            section_key: section.key,
            display_order: section.order,
            is_visible: section.isVisible,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: "user_id,section_key",
          });
      }
    } catch (error) {
      console.error("Error saving dashboard sections:", error);
    }
  };

  const visibleSections = localSections
    .filter((s) => s.isVisible)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Settings2 className="h-4 w-4" />
              Personalizar Dashboard
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Personalizar Dashboard</SheetTitle>
              <SheetDescription>
                Arrastra para reordenar las secciones y usa los interruptores para
                mostrar u ocultar cada sección.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-2">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={localSections.map((s) => s.key)}
                  strategy={verticalListSortingStrategy}
                >
                  {localSections
                    .sort((a, b) => a.order - b.order)
                    .map((section) => (
                      <SortableItem
                        key={section.key}
                        section={section}
                        onToggleVisibility={handleToggleVisibility}
                      />
                    ))}
                </SortableContext>
              </DndContext>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {visibleSections.map((section) => (
        <div key={section.key}>{section.component}</div>
      ))}
    </div>
  );
}
