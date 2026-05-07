import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Upload, Trash2, Loader2, Image as ImageIcon } from "lucide-react";

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

  useEffect(() => {
    loadLogos();
  }, []);

  const loadLogos = async () => {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {logos.map((logo) => {
          const logoUrl = getLogoUrl(logo.storage_path);
          const isUploading = uploading === logo.logo_key;

          return (
            <Card key={logo.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{logo.display_name}</CardTitle>
                <CardDescription className="text-xs">
                  {logo.logo_key === "dashboard_header" 
                    ? "Se muestra en el encabezado del Dashboard" 
                    : `Se muestra junto a contratos de ${logo.display_name.replace("Logo ", "")}`}
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
