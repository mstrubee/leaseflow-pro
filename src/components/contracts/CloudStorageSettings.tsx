import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Cloud, 
  Plus, 
  Trash2, 
  ExternalLink,
  RefreshCw,
  Loader2,
  CheckCircle2,
  Link2,
  Unlink2,
  ShieldCheck
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { getGoogleDriveRedirectUri } from "@/lib/googleDriveOAuth";

interface CloudConnection {
  id: string;
  provider: string;
  name: string;
  folder_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const CLOUD_PROVIDERS = [
  { id: "google_drive", name: "Google Drive", icon: "🔵", helpUrl: "https://drive.google.com" },
  { id: "onedrive", name: "OneDrive", icon: "🔷", helpUrl: "https://onedrive.live.com" },
  { id: "dropbox", name: "Dropbox", icon: "📦", helpUrl: "https://dropbox.com" },
];

interface CloudStorageSettingsProps {
  defaultCollapsed?: boolean;
}

export const CloudStorageSettings = ({ defaultCollapsed = false }: CloudStorageSettingsProps) => {
  const { toast } = useToast();
  const [connections, setConnections] = useState<CloudConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{ success: boolean; count: number } | null>(null);
  
  // OAuth status
  const [oauthStatus, setOauthStatus] = useState<{ hasClientCredentials: boolean; hasRefreshToken: boolean; isConnected: boolean } | null>(null);
  const [checkingOAuth, setCheckingOAuth] = useState(false);
  const [startingOAuth, setStartingOAuth] = useState(false);

  // Form states
  const [newProvider, setNewProvider] = useState("");
  const [newName, setNewName] = useState("");
  const [newFolderUrl, setNewFolderUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const redirectUri = getGoogleDriveRedirectUri();

  useEffect(() => {
    loadConnections();
    checkOAuthStatus();
  }, []);

  const checkOAuthStatus = async () => {
    setCheckingOAuth(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-drive", {
        body: { action: "checkOAuthStatus" },
      });
      if (error) throw error;
      setOauthStatus(data);
    } catch (err) {
      console.error("Error checking OAuth status:", err);
    } finally {
      setCheckingOAuth(false);
    }
  };

  const handleStartOAuth = async () => {
    setStartingOAuth(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-drive", {
        body: { action: "getOAuthUrl", redirectUri },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_self");
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message || "No se pudo iniciar la autorización OAuth",
      });
    } finally {
      setStartingOAuth(false);
    }
  };

  const handleSyncAllContracts = async () => {
    setSyncing(true);
    setLastSyncResult(null);
    
    try {
      toast({
        title: "Sincronizando contratos...",
        description: "Creando estructura completa de carpetas. Este proceso puede tomar varios minutos.",
      });

      const limit = 1; // Procesar 1 contrato a la vez para evitar timeout (crea toda la jerarquía)
      let offset = 0;
      let totalSynced = 0;
      let totalErrors = 0;

      const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

      const invokeWithRetry = async (body: any, maxAttempts = 3) => {
        let lastErr: any = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const res = await supabase.functions.invoke("google-drive", { body });
            if (res.error) throw res.error;
            return res;
          } catch (e: any) {
            lastErr = e;
            // Small backoff to survive transient network/edge hiccups
            if (attempt < maxAttempts) {
              await sleep(500 * attempt);
            }
          }
        }
        throw lastErr;
      };

      // Safety guard to avoid infinite loops in case of unexpected backend response
      for (let i = 0; i < 10000; i++) {
        const { data } = await invokeWithRetry({ action: "syncAllContracts", offset, limit });
        if (!data?.success) throw new Error(data?.error || "Error en la sincronización");

        totalSynced += Number(data.syncedCount || 0);
        totalErrors += Array.isArray(data.errors) ? data.errors.length : 0;

        if (data.hasMore) {
          const nextOffset = Number(data.nextOffset);
          if (!Number.isFinite(nextOffset) || nextOffset <= offset) {
            throw new Error("Sincronización detenida: no se pudo avanzar al siguiente lote");
          }
          offset = nextOffset;
          continue;
        }

        break;
      }

      setLastSyncResult({ success: true, count: totalSynced });
      toast({
        title: totalErrors > 0 ? "Sincronización completada con advertencias" : "¡Sincronización completada!",
        description:
          totalErrors > 0
            ? `Se sincronizaron ${totalSynced} contratos. ${totalErrors} contrato(s) tuvieron errores (ver consola/logs).`
            : `Se sincronizaron ${totalSynced} contratos con Google Drive.`,
      });
    } catch (error: any) {
      console.error("Sync error:", error);
      setLastSyncResult({ success: false, count: 0 });
      toast({
        variant: "destructive",
        title: "Error de sincronización",
        description: error.message || "No se pudo sincronizar con Google Drive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const loadConnections = async () => {
    try {
      const { data, error } = await supabase
        .from("cloud_storage_connections")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      setConnections(data || []);
    } catch (error) {
      console.error("Error loading connections:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateConnection = async () => {
    if (!newProvider || !newName.trim()) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("cloud_storage_connections")
        .insert({
          provider: newProvider,
          name: newName.trim(),
          folder_url: newFolderUrl.trim() || null,
        });

      if (error) throw error;

      toast({
        title: "Conexión creada",
        description: `Se ha configurado ${newName} correctamente`,
      });

      setNewProvider("");
      setNewName("");
      setNewFolderUrl("");
      setDialogOpen(false);
      loadConnections();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo crear la conexión: " + error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (id: string, currentState: boolean) => {
    try {
      const { error } = await supabase
        .from("cloud_storage_connections")
        .update({ is_active: !currentState })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: currentState ? "Conexión desactivada" : "Conexión activada",
      });

      loadConnections();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo actualizar la conexión",
      });
    }
  };

  const handleDeleteConnection = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar la conexión "${name}"?`)) return;
    if (!confirm(`Esta acción no se puede deshacer. ¿Confirmar eliminación?`)) return;

    try {
      const { error } = await supabase
        .from("cloud_storage_connections")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Conexión eliminada",
      });

      loadConnections();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar la conexión",
      });
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("es-CL", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getProviderInfo = (providerId: string) => {
    return CLOUD_PROVIDERS.find(p => p.id === providerId) || { name: providerId, icon: "☁️", helpUrl: "" };
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">Cargando...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <CollapsibleCard
        title="Almacenamiento en la Nube"
        description="Configura conexiones a servicios de almacenamiento en la nube"
        icon={<Cloud className="h-5 w-5 text-sky-500" />}
        defaultOpen={!defaultCollapsed}
        headerActions={
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button 
              onClick={handleSyncAllContracts} 
              variant="outline"
              className="gap-2" 
              size="sm"
              disabled={syncing}
      >
          {/* OAuth Status Section */}
          <div className="mb-4 p-4 rounded-lg border bg-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">Autorización Google Drive (OAuth)</p>
                  {checkingOAuth ? (
                    <p className="text-xs text-muted-foreground">Verificando estado...</p>
                  ) : oauthStatus?.isConnected ? (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Conectado — refresh token almacenado
                    </p>
                  ) : oauthStatus?.hasClientCredentials ? (
                    <p className="text-xs text-yellow-600 flex items-center gap-1">
                      <Link2 className="h-3 w-3" /> Credenciales configuradas, falta autorizar
                    </p>
                  ) : (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <Unlink2 className="h-3 w-3" /> Sin credenciales OAuth configuradas
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={checkOAuthStatus}
                  disabled={checkingOAuth}
                >
                  {checkingOAuth ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                </Button>
                {oauthStatus?.hasClientCredentials && !oauthStatus?.isConnected && (
                  <Button
                    size="sm"
                    onClick={handleStartOAuth}
                    disabled={startingOAuth}
                    className="gap-1"
                  >
                    {startingOAuth ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                    Autorizar Google Drive
                  </Button>
                )}
                {oauthStatus?.isConnected && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStartOAuth}
                    disabled={startingOAuth}
                    className="gap-1"
                  >
                    {startingOAuth ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Re-autorizar
                  </Button>
                )}
              </div>
            </div>
          </div>

              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : lastSyncResult?.success ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {syncing ? "Sincronizando..." : "Sincronizar Contratos con Drive"}
            </Button>
            <Button onClick={() => setDialogOpen(true)} className="gap-2" size="sm">
              <Plus className="h-4 w-4" />
              Agregar Conexión
            </Button>
          </div>
        }
      >
          {connections.length > 0 ? (
            <div className="space-y-3">
              {connections.map((conn) => {
                const provider = getProviderInfo(conn.provider);
                return (
                  <div
                    key={conn.id}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      conn.is_active ? "bg-muted/30 border-border" : "bg-muted/10 border-border/50 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{provider.icon}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{conn.name}</span>
                          <Badge variant={conn.is_active ? "default" : "secondary"}>
                            {conn.is_active ? "Activo" : "Inactivo"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {provider.name} · Creado {formatDate(conn.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {conn.folder_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(conn.folder_url!, "_blank")}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(conn.id, conn.is_active)}
                      >
                        {conn.is_active ? "Desactivar" : "Activar"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteConnection(conn.id, conn.name)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 space-y-2">
              <Cloud className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground">
                No hay conexiones configuradas
              </p>
              <p className="text-sm text-muted-foreground">
                Agrega una conexión para permitir a los usuarios acceder a sus archivos en la nube
              </p>
            </div>
          )}
      </CollapsibleCard>

      {/* Add connection dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Conexión de Almacenamiento</DialogTitle>
            <DialogDescription>
              Configura una conexión a un servicio de almacenamiento en la nube
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Proveedor</Label>
              <Select value={newProvider} onValueChange={setNewProvider}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un proveedor" />
                </SelectTrigger>
                <SelectContent>
                  {CLOUD_PROVIDERS.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.icon} {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nombre de la conexión</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej: Drive Corporativo"
              />
            </div>
            <div className="space-y-2">
              <Label>URL de la carpeta (opcional)</Label>
              <Input
                value={newFolderUrl}
                onChange={(e) => setNewFolderUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
              />
              <p className="text-xs text-muted-foreground">
                URL de la carpeta compartida donde se almacenarán los documentos
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateConnection} 
              disabled={saving || !newProvider || !newName.trim()}
            >
              {saving ? "Guardando..." : "Crear Conexión"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
