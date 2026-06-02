import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { clearLogoCache } from "@/hooks/useAppLogos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Upload, Trash2, Loader2, Image as ImageIcon, Plus, X } from "lucide-react";

// Claves de logos del sistema (no se pueden eliminar por completo, solo cambiar/quitar imagen)
const SYSTEM_KEYS = new Set(["agroplanet", "autoplanet", "dashboard_header"]);

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "logo";
}

// Fallback logos
import logoAgroplanetFallback from "@/assets/logo-agroplanet.png";
import logoAutoplanetFallback from "@/assets/logo-autoplanet.png";
import logosHeaderFallback from "@/assets/logos-header.png";

interface AppLogo {
  id: string;
  logo_key: string;
  display_name: string;
  storage_path: string | null;
  is_active: boolean;
  display_order: number;
}

const FALLBACK_LOGOS: Record<string, string> = {
  agroplanet: logoAgroplanetFallback,
  autoplanet: logoAutoplanetFallback,
  dashboard_header: logosHeaderFallback,
};

export function LogoManager() {
  const [logos, setLogos] = useState<AppLogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const { toast } = useToast();
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Estado del diálogo "Agregar logo"
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const newFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadLogos();
  }, []);

  const loadLogos = async () => {
    // Invalida la caché global para que el resto de la app recargue los logos
    // (mapa, contratos, etc.) tras cualquier alta/cambio/borrado.
    clearLogoCache();
    setLoading(true);
    const { data, error } = await supabase
      .from("app_logos")
      .select("*")
      .order("display_order", { ascending: true });

    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los logos" });
    } else {
      setLogos(data || []);
    }
    setLoading(false);
  };

  const getLogoUrl = (storagePath: string | null): string | null => {
    if (!storagePath) return null;
    const { data } = supabase.storage.from("logos").getPublicUrl(storagePath);
    return data?.publicUrl || null;
  };

  const handleFileSelect = async (logoKey: string, file: File) => {
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({ variant: "destructive", title: "Error", description: "Solo se permiten archivos de imagen" });
      return;
    }

    setUploading(logoKey);

    try {
      const logo = logos.find(l => l.logo_key === logoKey);
      
      // Delete old file if exists
      if (logo?.storage_path) {
        await supabase.storage.from("logos").remove([logo.storage_path]);
      }

      // Upload new file
      const fileExt = file.name.split(".").pop();
      const fileName = `${logoKey}-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Update database record
      const { error: updateError } = await supabase
        .from("app_logos")
        .update({ storage_path: fileName, updated_at: new Date().toISOString() })
        .eq("logo_key", logoKey);

      if (updateError) throw updateError;

      toast({ title: "Éxito", description: "Logo actualizado correctamente" });
      loadLogos();
    } catch (error: any) {
      console.error("Error uploading logo:", error);
      toast({ variant: "destructive", title: "Error", description: error.message || "Error al subir el logo" });
    } finally {
      setUploading(null);
    }
  };

  const handleRemoveLogo = async (logoKey: string) => {
    const logo = logos.find(l => l.logo_key === logoKey);
    if (!logo?.storage_path) return;

    try {
      // Delete from storage
      await supabase.storage.from("logos").remove([logo.storage_path]);

      // Update database
      const { error } = await supabase
        .from("app_logos")
        .update({ storage_path: null, updated_at: new Date().toISOString() })
        .eq("logo_key", logoKey);

      if (error) throw error;

      toast({ title: "Éxito", description: "Logo eliminado correctamente" });
      loadLogos();
    } catch (error: any) {
      console.error("Error removing logo:", error);
      toast({ variant: "destructive", title: "Error", description: error.message || "Error al eliminar el logo" });
    }
  };

  const handleAddLogo = async () => {
    const name = newName.trim();
    if (!name) {
      toast({ variant: "destructive", title: "Error", description: "Ingresa un nombre para el logo" });
      return;
    }
    if (!newFile) {
      toast({ variant: "destructive", title: "Error", description: "Selecciona una imagen" });
      return;
    }
    if (!newFile.type.startsWith("image/")) {
      toast({ variant: "destructive", title: "Error", description: "Solo se permiten archivos de imagen" });
      return;
    }

    setCreating(true);
    try {
      // Clave única a partir del nombre
      const base = slugify(name);
      const existing = new Set(logos.map((l) => l.logo_key));
      let key = base;
      if (existing.has(key)) key = `${base}_${Date.now()}`;

      // Subir imagen
      const fileExt = newFile.name.split(".").pop();
      const fileName = `${key}-${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(fileName, newFile, { upsert: true });
      if (uploadError) throw uploadError;

      // Crear registro
      const nextOrder = logos.reduce((m, l) => Math.max(m, l.display_order ?? 0), 0) + 1;
      const { error: insertError } = await supabase.from("app_logos").insert({
        logo_key: key,
        display_name: name,
        storage_path: fileName,
        is_active: true,
        display_order: nextOrder,
      });
      if (insertError) throw insertError;

      toast({ title: "Éxito", description: "Logo agregado correctamente" });
      setAddOpen(false);
      setNewName("");
      setNewFile(null);
      loadLogos();
    } catch (error: any) {
      console.error("Error adding logo:", error);
      toast({ variant: "destructive", title: "Error", description: error.message || "Error al agregar el logo" });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCustomLogo = async (logo: AppLogo) => {
    if (SYSTEM_KEYS.has(logo.logo_key)) return;
    if (!confirm(`¿Eliminar el logo "${logo.display_name}"? Esta acción no se puede deshacer.`)) return;
    try {
      if (logo.storage_path) {
        await supabase.storage.from("logos").remove([logo.storage_path]);
      }
      const { error } = await supabase.from("app_logos").delete().eq("id", logo.id);
      if (error) throw error;
      toast({ title: "Éxito", description: "Logo eliminado" });
      loadLogos();
    } catch (error: any) {
      console.error("Error deleting logo:", error);
      toast({ variant: "destructive", title: "Error", description: error.message || "Error al eliminar el logo" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) { setNewName(""); setNewFile(null); } }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Agregar logo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agregar logo</DialogTitle>
              <DialogDescription>
                Crea un nuevo logo personalizado. Se guardará en la aplicación y podrás cambiarlo o eliminarlo después.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="logo-name">Nombre</Label>
                <Input
                  id="logo-name"
                  placeholder="Ej. Logo Proveedor X"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Imagen</Label>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={newFileInputRef}
                  onChange={(e) => { setNewFile(e.target.files?.[0] || null); e.target.value = ""; }}
                />
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => newFileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" />
                    {newFile ? "Cambiar imagen" : "Seleccionar imagen"}
                  </Button>
                  {newFile && <span className="text-xs text-muted-foreground truncate max-w-[180px]">{newFile.name}</span>}
                </div>
                {newFile && (
                  <div className="flex items-center justify-center h-24 bg-muted rounded-lg border mt-2">
                    <img src={URL.createObjectURL(newFile)} alt="preview" className="max-h-20 max-w-full object-contain" />
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(false)} disabled={creating}>Cancelar</Button>
              <Button onClick={handleAddLogo} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Agregar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {logos.map((logo) => {
          const logoUrl = getLogoUrl(logo.storage_path);
          const isUploading = uploading === logo.logo_key;

          return (
            <Card key={logo.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{logo.display_name}</CardTitle>
                  {!SYSTEM_KEYS.has(logo.logo_key) && (
                    <button
                      type="button"
                      title="Eliminar logo"
                      onClick={() => handleDeleteCustomLogo(logo)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <CardDescription className="text-xs">
                  {logo.logo_key === "dashboard_header"
                    ? "Se muestra en el encabezado del Dashboard"
                    : SYSTEM_KEYS.has(logo.logo_key)
                      ? `Se muestra junto a contratos de ${logo.display_name.replace("Logo ", "")}`
                      : "Logo personalizado"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Preview */}
                <div className="flex items-center justify-center h-24 bg-muted rounded-lg border-2 border-dashed relative">
                  {logoUrl ? (
                    <>
                      <img 
                        src={logoUrl} 
                        alt={logo.display_name} 
                        className="max-h-20 max-w-full object-contain"
                      />
                      <span className="absolute top-1 right-1 text-[10px] bg-green-500/20 text-green-700 px-1.5 py-0.5 rounded">
                        Personalizado
                      </span>
                    </>
                  ) : FALLBACK_LOGOS[logo.logo_key] ? (
                    <>
                      <img 
                        src={FALLBACK_LOGOS[logo.logo_key]} 
                        alt={logo.display_name} 
                        className="max-h-20 max-w-full object-contain opacity-70"
                      />
                      <span className="absolute top-1 right-1 text-[10px] bg-muted-foreground/20 text-muted-foreground px-1.5 py-0.5 rounded">
                        Por defecto
                      </span>
                    </>
                  ) : (
                    <div className="flex flex-col items-center text-muted-foreground">
                      <ImageIcon className="h-8 w-8 mb-1" />
                      <span className="text-xs">Sin logo</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={(el) => { fileInputRefs.current[logo.logo_key] = el; }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(logo.logo_key, file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={isUploading}
                    onClick={() => fileInputRefs.current[logo.logo_key]?.click()}
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {logoUrl ? "Cambiar" : "Subir"}
                  </Button>
                  {logoUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveLogo(logo.logo_key)}
                      disabled={isUploading}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Formatos soportados: PNG, JPG, SVG. Los logos se aplicarán automáticamente en toda la aplicación.
      </p>
    </div>
  );
}
