import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Cloud, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

interface StorageSettings {
  id: string;
  active_provider: string;
  updated_at: string;
}

const PROVIDERS = [
  {
    id: "google_drive",
    name: "Google Drive",
    icon: "https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg",
    description: "Almacenamiento en Google Drive usando cuenta de servicio",
    secretsRequired: ["GOOGLE_SERVICE_ACCOUNT_KEY", "GOOGLE_DRIVE_ROOT_FOLDER_ID"],
  },
  {
    id: "onedrive",
    name: "Microsoft OneDrive",
    icon: "https://upload.wikimedia.org/wikipedia/commons/3/3c/Microsoft_Office_OneDrive_%282019%E2%80%93present%29.svg",
    description: "Almacenamiento en OneDrive usando Azure AD",
    secretsRequired: ["ONEDRIVE_CLIENT_ID", "ONEDRIVE_CLIENT_SECRET", "ONEDRIVE_TENANT_ID", "ONEDRIVE_ROOT_FOLDER_ID"],
  },
];

interface StorageProviderSettingsProps {
  defaultCollapsed?: boolean;
}

export function StorageProviderSettings({ defaultCollapsed = false }: StorageProviderSettingsProps) {
  const [settings, setSettings] = useState<StorageSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>("google_drive");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, boolean | null>>({});

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("storage_settings")
      .select("*")
      .limit(1)
      .single();

    if (data) {
      setSettings(data);
      setSelectedProvider(data.active_provider);
    }
    setLoading(false);
  };

  const handleProviderChange = (value: string) => {
    if (value !== settings?.active_provider) {
      setPendingProvider(value);
      setConfirmDialogOpen(true);
    } else {
      setSelectedProvider(value);
    }
  };

  const confirmProviderChange = async () => {
    if (!pendingProvider) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("storage_settings")
        .update({ active_provider: pendingProvider })
        .eq("id", settings?.id);

      if (error) throw error;

      setSelectedProvider(pendingProvider);
      setSettings(prev => prev ? { ...prev, active_provider: pendingProvider } : null);
      
      toast.success("Proveedor actualizado", {
        description: `El proveedor de almacenamiento se cambió a ${PROVIDERS.find(p => p.id === pendingProvider)?.name}`
      });
    } catch (error: any) {
      toast.error("Error al cambiar proveedor", { description: error.message });
    } finally {
      setSaving(false);
      setConfirmDialogOpen(false);
      setPendingProvider(null);
    }
  };

  const testConnection = async (providerId: string) => {
    setTesting(providerId);
    try {
      const functionName = providerId === "google_drive" ? "google-drive" : "onedrive";
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { action: "testConnection" }
      });

      if (error) throw error;

      setConnectionStatus(prev => ({ ...prev, [providerId]: true }));
      toast.success("Conexión exitosa", {
        description: `La conexión con ${PROVIDERS.find(p => p.id === providerId)?.name} funciona correctamente`
      });
    } catch (error: any) {
      setConnectionStatus(prev => ({ ...prev, [providerId]: false }));
      toast.error("Error de conexión", {
        description: error.message || "No se pudo conectar con el proveedor"
      });
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return (
      <CollapsibleCard
        title="Proveedor de Almacenamiento"
        description="Selecciona el servicio de almacenamiento en la nube para los archivos de contratos"
        icon={<Cloud className="h-5 w-5" />}
        defaultOpen={!defaultCollapsed}
      >
        <div className="flex items-center justify-center py-8">
          <Skeleton className="h-32 w-full" />
        </div>
      </CollapsibleCard>
    );
  }

  return (
    <>
      <CollapsibleCard
        title="Proveedor de Almacenamiento"
        description="Selecciona el servicio de almacenamiento en la nube para los archivos de contratos"
        icon={<Cloud className="h-5 w-5" />}
        defaultOpen={!defaultCollapsed}
      >
        <div className="space-y-6">
          <RadioGroup
            value={selectedProvider}
            onValueChange={handleProviderChange}
            className="space-y-4"
          >
            {PROVIDERS.map((provider) => (
              <div
                key={provider.id}
                className={`flex items-start space-x-4 p-4 rounded-lg border transition-colors ${
                  selectedProvider === provider.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                <RadioGroupItem value={provider.id} id={provider.id} className="mt-1" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <img src={provider.icon} alt={provider.name} className="h-6 w-6" />
                    <Label htmlFor={provider.id} className="text-base font-medium cursor-pointer">
                      {provider.name}
                    </Label>
                    {settings?.active_provider === provider.id && (
                      <Badge variant="secondary" className="text-xs">Activo</Badge>
                    )}
                    {connectionStatus[provider.id] === true && (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    {connectionStatus[provider.id] === false && (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{provider.description}</p>
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testConnection(provider.id)}
                      disabled={testing === provider.id}
                    >
                      {testing === provider.id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Probar Conexión
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </RadioGroup>

          <div className="bg-muted/50 p-4 rounded-lg">
            <h4 className="font-medium mb-2">Nota importante</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Los archivos existentes se mantienen en su proveedor original</li>
              <li>• Los nuevos archivos se subirán al proveedor seleccionado</li>
              <li>• Cada archivo muestra el ícono de su proveedor de origen</li>
            </ul>
          </div>
        </div>
      </CollapsibleCard>

      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cambiar proveedor de almacenamiento?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Los nuevos archivos se subirán a{" "}
                <strong>{PROVIDERS.find(p => p.id === pendingProvider)?.name}</strong>.
              </p>
              <p>
                Los archivos previos seguirán siendo accesibles desde su proveedor original.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmProviderChange} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar Cambio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
