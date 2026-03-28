import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Folder, ChevronRight, ChevronDown, Check, FolderOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface FolderTemplate {
  id: string;
  name: string;
  parent_id: string | null;
  folder_type: string | null;
}

interface GeneralFolder {
  id: string;
  name: string;
  parent_id: string | null;
  is_contract_root: boolean | null;
}

interface FolderDestinationPickerProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  value: string; // comma-separated folder names
  onChange: (value: string) => void;
}

/** Parse comma-separated string into trimmed non-empty array */
function parseMulti(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Join array back to comma-separated string */
function joinMulti(arr: string[]): string {
  return arr.join(", ");
}

export function FolderDestinationPicker({ icon, label, description, value, onChange }: FolderDestinationPickerProps) {
  const [showBrowser, setShowBrowser] = useState(false);
  const [templates, setTemplates] = useState<FolderTemplate[]>([]);
  const [generalFolders, setGeneralFolders] = useState<GeneralFolder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<"templates" | "general">("templates");

  const selectedFolders = parseMulti(value);

  useEffect(() => {
    if (showBrowser && templates.length === 0) {
      Promise.all([
        supabase
          .from("folder_templates")
          .select("id, name, parent_id, folder_type")
          .order("display_order", { ascending: true }),
        supabase
          .from("general_folders")
          .select("id, name, parent_id, is_contract_root")
          .order("name", { ascending: true }),
      ]).then(([templatesRes, generalRes]) => {
        if (templatesRes.data) setTemplates(templatesRes.data);
        if (generalRes.data) setGeneralFolders(generalRes.data);
      });
    }
  }, [showBrowser]);

  const rootTemplates = templates.filter((t) => !t.parent_id);
  const getTemplateChildren = (parentId: string) => templates.filter((t) => t.parent_id === parentId);

  const rootGeneralFolders = generalFolders.filter((f) => !f.parent_id);
  const getGeneralChildren = (parentId: string) => generalFolders.filter((f) => f.parent_id === parentId);

  const toggleExpand = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleFolder = (name: string) => {
    const current = [...selectedFolders];
    const idx = current.indexOf(name);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(name);
    }
    onChange(joinMulti(current));
  };

  const removeFolder = (name: string) => {
    const current = selectedFolders.filter((f) => f !== name);
    onChange(joinMulti(current));
  };

  const renderItem = (
    item: { id: string; name: string },
    getChildren: (id: string) => { id: string; name: string }[],
    depth: number = 0
  ): React.ReactNode => {
    const children = getChildren(item.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedFolders.has(item.id);
    const isSelected = selectedFolders.includes(item.name);

    return (
      <div key={item.id}>
        <div
          className={cn(
            "flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer text-sm hover:bg-accent/50 transition-colors",
            isSelected && "bg-primary/10 text-primary font-medium"
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => toggleFolder(item.name)}
        >
          {hasChildren ? (
            <button
              className="p-0.5 hover:bg-accent rounded"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(item.id);
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
          <span className="truncate">{item.name}</span>
          {isSelected && <Check className="h-3.5 w-3.5 text-primary ml-auto flex-shrink-0" />}
        </div>
        {hasChildren && isExpanded && children.map((child) => renderItem(child, getChildren, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-2">
        {icon}
        {label}
      </Label>

      {/* Selected folders as chips */}
      <div className="flex flex-wrap gap-1.5 min-h-[32px] p-1.5 border rounded-md bg-background">
        {selectedFolders.length === 0 ? (
          <span className="text-sm text-muted-foreground px-1 py-0.5">Sin carpetas seleccionadas</span>
        ) : (
          selectedFolders.map((folder) => (
            <Badge key={folder} variant="secondary" className="gap-1 pr-1">
              <Folder className="h-3 w-3 text-amber-500" />
              {folder}
              <button
                type="button"
                onClick={() => removeFolder(folder)}
                className="ml-0.5 rounded-full hover:bg-muted p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="whitespace-nowrap"
        onClick={() => setShowBrowser(!showBrowser)}
      >
        <Folder className="h-4 w-4 mr-1 text-amber-500" />
        {showBrowser ? "Cerrar" : "Explorar Carpetas"}
      </Button>

      {showBrowser && (
        <div className="border rounded-md bg-card overflow-hidden">
          <div className="flex border-b bg-muted/30">
            <button
              className={cn(
                "flex-1 text-xs font-medium px-3 py-1.5 transition-colors flex items-center justify-center gap-1.5",
                activeSection === "templates"
                  ? "bg-background text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setActiveSection("templates")}
            >
              <FolderOpen className="h-3.5 w-3.5 text-blue-500" />
              Plantillas del Repositorio
            </button>
            <button
              className={cn(
                "flex-1 text-xs font-medium px-3 py-1.5 transition-colors flex items-center justify-center gap-1.5",
                activeSection === "general"
                  ? "bg-background text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setActiveSection("general")}
            >
              <Folder className="h-3.5 w-3.5 text-emerald-500" />
              Carpetas Generales
            </button>
          </div>
          <ScrollArea className="h-[220px] overflow-auto">
            <div className="p-1">
              {activeSection === "templates" ? (
                rootTemplates.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Cargando...</p>
                ) : (
                  rootTemplates.map((folder) => renderItem(folder, getTemplateChildren))
                )
              ) : (
                rootGeneralFolders.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Cargando...</p>
                ) : (
                  rootGeneralFolders.map((folder) => renderItem(folder, getGeneralChildren))
                )
              )}
            </div>
          </ScrollArea>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
