import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Folder, ChevronRight, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface FolderTemplate {
  id: string;
  name: string;
  parent_id: string | null;
  folder_type: string | null;
}

interface FolderDestinationPickerProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
}

export function FolderDestinationPicker({ icon, label, description, value, onChange }: FolderDestinationPickerProps) {
  const [showBrowser, setShowBrowser] = useState(false);
  const [templates, setTemplates] = useState<FolderTemplate[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (showBrowser && templates.length === 0) {
      supabase
        .from("folder_templates")
        .select("id, name, parent_id, folder_type")
        .order("display_order", { ascending: true })
        .then(({ data }) => {
          if (data) setTemplates(data);
        });
    }
  }, [showBrowser]);

  const rootFolders = templates.filter((t) => !t.parent_id);
  const getChildren = (parentId: string) => templates.filter((t) => t.parent_id === parentId);

  const toggleExpand = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectFolder = (name: string) => {
    onChange(name);
    setShowBrowser(false);
  };

  const renderFolder = (folder: FolderTemplate, depth: number = 0): React.ReactNode => {
    const children = getChildren(folder.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = value === folder.name;

    return (
      <div key={folder.id}>
        <div
          className={cn(
            "flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer text-sm hover:bg-accent/50 transition-colors",
            isSelected && "bg-primary/10 text-primary font-medium"
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => selectFolder(folder.name)}
        >
          {hasChildren ? (
            <button
              className="p-0.5 hover:bg-accent rounded"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(folder.id);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          ) : (
            <span className="w-[22px]" />
          )}
          <Folder className="h-4 w-4 text-amber-500 flex-shrink-0" />
          <span className="truncate">{folder.name}</span>
          {isSelected && <Check className="h-3.5 w-3.5 text-primary ml-auto flex-shrink-0" />}
        </div>
        {hasChildren && isExpanded && children.map((child) => renderFolder(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-2">
        {icon}
        {label}
      </Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nombre de la carpeta"
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="whitespace-nowrap"
          onClick={() => setShowBrowser(!showBrowser)}
        >
          <Folder className="h-4 w-4 mr-1 text-amber-500" />
          Explorar
        </Button>
      </div>
      {showBrowser && (
        <div className="border rounded-md bg-card">
          <div className="px-3 py-1.5 border-b bg-muted/30">
            <p className="text-xs text-muted-foreground font-medium">Plantillas de carpetas del repositorio</p>
          </div>
          <ScrollArea className="max-h-[200px]">
            <div className="p-1">
              {rootFolders.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Cargando...</p>
              ) : (
                rootFolders.map((folder) => renderFolder(folder))
              )}
            </div>
          </ScrollArea>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
