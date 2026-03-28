import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, Trash2, FileSpreadsheet, Download, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface OCTemplate {
  id: string;
  name: string;
  file_path: string;
  file_name: string;
  is_active: boolean;
  created_at: string;
}

interface OCRequestTemplateManagerProps {
  defaultCollapsed?: boolean;
}

export const OCRequestTemplateManager = ({ defaultCollapsed = false }: OCRequestTemplateManagerProps) => {
  const [templates, setTemplates] = useState<OCTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      // Query without is_active filter to show all templates for admin
      const { data, error } = await supabase
        .from("oc_request_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error loading templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !newTemplateName.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Complete el nombre y seleccione un archivo" });
      return;
    }

    setUploading(true);
    try {
      // Upload file to storage
      const filePath = `oc-templates/${Date.now()}_${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("repository-files")
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Deactivate all other templates
      await supabase
        .from("oc_request_templates")
        .update({ is_active: false })
        .neq("id", "00000000-0000-0000-0000-000000000000");

      // Create template record
      const { error: insertError } = await supabase.from("oc_request_templates").insert({
        name: newTemplateName.trim(),
        file_path: filePath,
        file_name: selectedFile.name,
        is_active: true
      });

      if (insertError) throw insertError;

      toast({ title: "Plantilla subida", description: "La plantilla de solicitud de OC ha sido configurada" });
      setNewTemplateName("");
      setSelectedFile(null);
      loadTemplates();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setUploading(false);
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      // Deactivate all
      await supabase
        .from("oc_request_templates")
        .update({ is_active: false })
        .neq("id", "00000000-0000-0000-0000-000000000000");

      // Activate selected
      await supabase
        .from("oc_request_templates")
        .update({ is_active: true })
        .eq("id", id);

      toast({ title: "Plantilla activada" });
      loadTemplates();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const template = templates.find(t => t.id === deleteId);
      if (template) {
        // Delete file from storage
        await supabase.storage.from("repository-files").remove([template.file_path]);
      }

      // Delete record
      const { error } = await supabase
        .from("oc_request_templates")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;

      toast({ title: "Plantilla eliminada" });
      setDeleteId(null);
      loadTemplates();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const getDownloadUrl = (filePath: string) => {
    const { data } = supabase.storage.from("repository-files").getPublicUrl(filePath);
    return data?.publicUrl;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <CollapsibleCard
      title="Plantilla de Solicitud de OC"
      icon={<FileSpreadsheet className="h-5 w-5 text-green-600" />}
      defaultOpen={!defaultCollapsed}
    >
        {/* Upload new template */}
        <div className="p-4 border rounded-lg space-y-3">
          <h4 className="font-medium text-sm">Subir nueva plantilla</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Nombre de la plantilla</Label>
              <Input
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="Ej: Formulario OC 2024"
              />
            </div>
            <div className="space-y-2">
              <Label>Archivo (Excel/PDF)</Label>
              <Input
                type="file"
                accept=".xlsx,.xls,.pdf,.doc,.docx"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <Button onClick={handleUpload} disabled={uploading} className="gap-2">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Subir Plantilla
          </Button>
        </div>

        {/* Existing templates */}
        {templates.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Plantillas existentes</h4>
            <div className="space-y-2">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    template.is_active ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{template.name}</p>
                      <p className="text-xs text-muted-foreground">{template.file_name}</p>
                    </div>
                    {template.is_active && (
                      <Badge className="bg-green-500 text-white">Activa</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                    >
                      <a href={getDownloadUrl(template.file_path)} download={template.file_name} target="_blank" rel="noopener noreferrer">
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                    {!template.is_active && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetActive(template.id)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteId(template.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {templates.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No hay plantillas configuradas. Suba una plantilla para que los usuarios puedan descargarla al crear solicitudes de OC.
          </p>
        )}

        {/* Delete confirmation */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar plantilla?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción eliminará la plantilla permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
    </CollapsibleCard>
  );
};
