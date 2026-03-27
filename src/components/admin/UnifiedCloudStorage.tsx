import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { toast } from "sonner";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Cloud,
  CheckCircle2,
  XCircle,
  RefreshCw,
  LogIn,
  Eye,
  EyeOff,
  Copy,
  ChevronDown,
  ChevronRight,
  Settings2,
  Pencil,
  Save,
  X,
  Plus,
  Trash2,
  ExternalLink,
  Link2,
  Unlink2,
  ShieldCheck,
} from "lucide-react";
import { getGoogleDriveRedirectUri } from "@/lib/googleDriveOAuth";

// ── Types ──────────────────────────────────────────────────────────
interface StorageSettings {
  id: string;
  active_provider: string;
  updated_at: string;
}

interface CloudConnection {
  id: string;
  provider: string;
  name: string;
  folder_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const PROVIDERS = [
  {
    id: "google_drive",
    name: "Google Drive",
    icon: "https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg",
    emoji: "🔵",
    description: "Almacenamiento en Google Drive usando OAuth o cuenta de servicio",
  },
  {
    id: "onedrive",
    name: "Microsoft OneDrive",
    icon: "https://upload.wikimedia.org/wikipedia/commons/3/3c/Microsoft_Office_OneDrive_%282019%E2%80%93present%29.svg",
    emoji: "🔷",
    description: "Almacenamiento en OneDrive usando Azure AD",
  },
];

interface UnifiedCloudStorageProps {
  defaultCollapsed?: boolean;
}

export function UnifiedCloudStorage({ defaultCollapsed = false }: UnifiedCloudStorageProps) {
  const { toast: shadToast } = useToast();
  const redirectUri = getGoogleDriveRedirectUri();

  // ── Provider settings state ──
  const [settings, setSettings] = useState<StorageSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("google_drive");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, boolean | null>>({});

  // ── OAuth / Credentials state ──
  const [oauthStatus, setOauthStatus] = useState<{ hasClientCredentials: boolean; hasRefreshToken: boolean; isConnected: boolean } | null>(null);
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const [credentials, setCredentials] = useState<{ clientId: string; clientIdFull: string; clientSecret: string; clientSecretFull: string; rootFolderId: string } | null>(null);
  const [showClientId, setShowClientId] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editClientId, setEditClientId] = useState("");
  const [editClientSecret, setEditClientSecret] = useState("");
  const [editRootFolderId, setEditRootFolderId] = useState("");
  const [savingCredentials, setSavingCredentials] = useState(false);

  // ── Connections state ──
  const [connections, setConnections] = useState<CloudConnection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newProvider, setNewProvider] = useState("");
  const [newName, setNewName] = useState("");
  const [newFolderUrl, setNewFolderUrl] = useState("");
  const [savingConnection, setSavingConnection] = useState(false);

  // ── Sync state ──
  const [syncing, setSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<{ success: boolean; count: number } | null>(null);

  // ── Load everything ──
  useEffect(() => {
    loadSettings();
    loadConnections();
    checkOAuthStatus();
  }, []);

  // ── Provider settings methods ──
  const loadSettings = async () => {
    setLoadingSettings(true);
    const { data } = await supabase.from("storage_settings").select("*").limit(1).single();
    if (data) {
      setSettings(data);
      setSelectedProvider(data.active_provider);
    }
    setLoadingSettings(false);
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
      const { error } = await supabase.from("storage_settings").update({ active_provider: pendingProvider }).eq("id", settings?.id);
      if (error) throw error;
      setSelectedProvider(pendingProvider);
      setSettings((prev) => (prev ? { ...prev, active_provider: pendingProvider } : null));
      toast.success("Proveedor actualizado", { description: `Cambiado a ${PROVIDERS.find((p) => p.id === pendingProvider)?.name}` });
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
      const fn = providerId === "google_drive" ? "google-drive" : "onedrive";
      const { data, error } = await supabase.functions.invoke(fn, { body: { action: "testConnection" } });
      if (error) throw error;
      setConnectionStatus((prev) => ({ ...prev, [providerId]: true }));
      const authMethod = data?.authMethod === "oauth" ? " (OAuth)" : " (Service Account)";
      toast.success("Conexión exitosa", { description: `Conectado a ${PROVIDERS.find((p) => p.id === providerId)?.name}${providerId === "google_drive" ? authMethod : ""}` });
    } catch (error: any) {
      setConnectionStatus((prev) => ({ ...prev, [providerId]: false }));
      toast.error("Error de conexión", { description: error.message || "No se pudo conectar con el proveedor" });
    } finally {
      setTesting(null);
    }
  };

  // ── OAuth & Credentials methods ──
  const checkOAuthStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("google-drive", { body: { action: "checkOAuthStatus" } });
      if (data && !error) setOauthStatus(data);
    } catch {}
  };

  const loadCredentials = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("google-drive", { body: { action: "getCredentials" } });
      if (data && !error) setCredentials(data);
    } catch {}
  };

  const enterEditMode = () => {
    if (credentials) {
      setEditClientId(credentials.clientIdFull);
      setEditClientSecret(credentials.clientSecretFull);
      setEditRootFolderId(credentials.rootFolderId);
    }
    setEditMode(true);
  };

  const saveCredentials = async () => {
    setSavingCredentials(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-drive", {
        body: { action: "updateCredentials", clientId: editClientId, clientSecret: editClientSecret, rootFolderId: editRootFolderId },
      });
      if (error) throw error;
      toast.success("Credenciales actualizadas", { description: data?.message || "Cambios aplicados." });
      setEditMode(false);
      await loadCredentials();
      await checkOAuthStatus();
    } catch (error: any) {
      toast.error("Error al guardar credenciales", { description: error.message });
    } finally {
      setSavingCredentials(false);
    }
  };

  const startOAuthFlow = async () => {
    setConnectingOAuth(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-drive", { body: { action: "getOAuthUrl", redirectUri } });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank", "width=600,height=700");
        toast.info("Autorización iniciada", { description: "Completa el proceso en la ventana emergente." });
        const pollInterval = setInterval(async () => {
          const { data: status } = await supabase.functions.invoke("google-drive", { body: { action: "checkOAuthStatus" } });
          if (status?.isConnected) {
            clearInterval(pollInterval);
            setOauthStatus(status);
            setConnectingOAuth(false);
            toast.success("Google Drive OAuth conectado");
          }
        }, 3000);
        setTimeout(() => { clearInterval(pollInterval); setConnectingOAuth(false); }, 300000);
      }
    } catch (error: any) {
      toast.error("Error al iniciar OAuth", { description: error.message });
      setConnectingOAuth(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copiado al portapapeles");
  };

  // ── Connections methods ──
  const loadConnections = async () => {
    try {
      const { data, error } = await supabase.from("cloud_storage_connections").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setConnections(data || []);
    } catch (error) {
      console.error("Error loading connections:", error);
    } finally {
      setLoadingConnections(false);
    }
  };

  const handleCreateConnection = async () => {
    if (!newProvider || !newName.trim()) return;
    setSavingConnection(true);
    try {
      const { error } = await supabase.from("cloud_storage_connections").insert({ provider: newProvider, name: newName.trim(), folder_url: newFolderUrl.trim() || null });
      if (error) throw error;
      shadToast({ title: "Conexión creada", description: `Se ha configurado ${newName} correctamente` });
      setNewProvider("");
      setNewName("");
      setNewFolderUrl("");
      setDialogOpen(false);
      loadConnections();
    } catch (error: any) {
      shadToast({ variant: "destructive", title: "Error", description: "No se pudo crear la conexión: " + error.message });
    } finally {
      setSavingConnection(false);
    }
  };

  const handleToggleActive = async (id: string, currentState: boolean) => {
    try {
      const { error } = await supabase.from("cloud_storage_connections").update({ is_active: !currentState }).eq("id", id);
      if (error) throw error;
      shadToast({ title: currentState ? "Conexión desactivada" : "Conexión activada" });
      loadConnections();
    } catch {
      shadToast({ variant: "destructive", title: "Error", description: "No se pudo actualizar la conexión" });
    }
  };

  const handleDeleteConnection = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar la conexión "${name}"?`)) return;
    if (!confirm(`Esta acción no se puede deshacer. ¿Confirmar eliminación?`)) return;
    try {
      const { error } = await supabase.from("cloud_storage_connections").delete().eq("id", id);
      if (error) throw error;
      shadToast({ title: "Conexión eliminada" });
      loadConnections();
    } catch {
      shadToast({ variant: "destructive", title: "Error", description: "No se pudo eliminar la conexión" });
    }
  };

  // ── Sync all contracts ──
  const handleSyncAllContracts = async () => {
    setSyncing(true);
    setLastSyncResult(null);
    try {
      shadToast({ title: "Sincronizando contratos...", description: "Creando estructura de carpetas. Puede tomar varios minutos." });
      const limit = 1;
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
            if (attempt < maxAttempts) await sleep(500 * attempt);
          }
        }
        throw lastErr;
      };
      for (let i = 0; i < 10000; i++) {
        const { data } = await invokeWithRetry({ action: "syncAllContracts", offset, limit });
        if (!data?.success) throw new Error(data?.error || "Error en la sincronización");
        totalSynced += Number(data.syncedCount || 0);
        totalErrors += Array.isArray(data.errors) ? data.errors.length : 0;
        if (data.hasMore) {
          const nextOffset = Number(data.nextOffset);
          if (!Number.isFinite(nextOffset) || nextOffset <= offset) throw new Error("Sincronización detenida: no se pudo avanzar");
          offset = nextOffset;
          continue;
        }
        break;
      }
      setLastSyncResult({ success: true, count: totalSynced });
      shadToast({
        title: totalErrors > 0 ? "Sincronización con advertencias" : "¡Sincronización completada!",
        description: totalErrors > 0
          ? `${totalSynced} contratos sincronizados. ${totalErrors} con errores.`
          : `${totalSynced} contratos sincronizados con Google Drive.`,
      });
    } catch (error: any) {
      console.error("Sync error:", error);
      setLastSyncResult({ success: false, count: 0 });
      shadToast({ variant: "destructive", title: "Error de sincronización", description: error.message || "No se pudo sincronizar" });
    } finally {
      setSyncing(false);
    }
  };

  // ── Helpers ──
  const formatDate = (date: string) => new Date(date).toLocaleDateString("es-CL", { year: "numeric", month: "short", day: "numeric" });
  const getProviderInfo = (id: string) => PROVIDERS.find((p) => p.id === id) || { name: id, emoji: "☁️", icon: "", description: "" };

  const loading = loadingSettings || loadingConnections;

  if (loading) {
    return (
      <CollapsibleCard title="Almacenamiento en la Nube" description="Configuración del proveedor, credenciales y conexiones" icon={<Cloud className="h-5 w-5" />} defaultOpen={!defaultCollapsed}>
        <div className="flex items-center justify-center py-8">
          <Skeleton className="h-32 w-full" />
        </div>
      </CollapsibleCard>
    );
  }

  return (
    <>
      <CollapsibleCard
        title="Almacenamiento en la Nube"
        description="Configuración del proveedor, credenciales, conexiones y sincronización"
        icon={<Cloud className="h-5 w-5" />}
        defaultOpen={!defaultCollapsed}
      >
        <div className="space-y-6">
          {/* ─── 1. Proveedor activo ─── */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              Proveedor Activo
            </h3>
            <RadioGroup value={selectedProvider} onValueChange={handleProviderChange} className="space-y-3">
              {PROVIDERS.map((provider) => (
                <div
                  key={provider.id}
                  className={`flex items-start space-x-4 p-4 rounded-lg border transition-colors ${
                    selectedProvider === provider.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <RadioGroupItem value={provider.id} id={`provider-${provider.id}`} className="mt-1" />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-3">
                      <img src={provider.icon} alt={provider.name} className="h-5 w-5" />
                      <Label htmlFor={`provider-${provider.id}`} className="text-sm font-medium cursor-pointer">
                        {provider.name}
                      </Label>
                      {settings?.active_provider === provider.id && <Badge variant="secondary" className="text-xs">Activo</Badge>}
                      {connectionStatus[provider.id] === true && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      {connectionStatus[provider.id] === false && <XCircle className="h-4 w-4 text-destructive" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{provider.description}</p>
                    <div className="pt-1">
                      <Button variant="outline" size="sm" onClick={() => testConnection(provider.id)} disabled={testing === provider.id}>
                        {testing === provider.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                        Probar Conexión
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* ─── 2. Credenciales & OAuth (solo Google Drive) ─── */}
          {selectedProvider === "google_drive" && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                Credenciales y Autorización OAuth
              </h3>

              {/* OAuth status badge */}
              {oauthStatus && (
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <span className="text-sm font-medium">Estado OAuth:</span>
                  {oauthStatus.isConnected ? (
                    <Badge className="text-xs bg-green-600 text-white">Conectado</Badge>
                  ) : oauthStatus.hasClientCredentials ? (
                    <Badge variant="outline" className="text-xs">Credenciales configuradas – Sin autorizar</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs text-destructive">No configurado</Badge>
                  )}
                  {oauthStatus.hasClientCredentials && !oauthStatus.isConnected && (
                    <Button variant="default" size="sm" onClick={startOAuthFlow} disabled={connectingOAuth} className="ml-auto">
                      {connectingOAuth ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <LogIn className="h-3.5 w-3.5 mr-1.5" />}
                      Autorizar con Google
                    </Button>
                  )}
                  {oauthStatus.isConnected && (
                    <Button variant="outline" size="sm" onClick={startOAuthFlow} disabled={connectingOAuth} className="ml-auto">
                      {connectingOAuth ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                      Re-autorizar
                    </Button>
                  )}
                </div>
              )}

              {/* Expandable credentials */}
              <Collapsible open={credentialsOpen} onOpenChange={(open) => { setCredentialsOpen(open); if (open && !credentials) loadCredentials(); }}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4" />
                      Credenciales Google OAuth
                    </span>
                    {credentialsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {!credentials ? (
                    <div className="p-3 mt-2 rounded-md bg-muted/50">
                      <Skeleton className="h-8 w-full mb-2" />
                      <Skeleton className="h-8 w-full mb-2" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : (
                    <div className="p-3 mt-2 rounded-md bg-muted/50 space-y-3">
                      <div className="flex items-center justify-end gap-2">
                        {!editMode ? (
                          <Button variant="outline" size="sm" onClick={enterEditMode}>
                            <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                          </Button>
                        ) : (
                          <>
                            <Button variant="outline" size="sm" onClick={() => setEditMode(false)} disabled={savingCredentials}>
                              <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                            </Button>
                            <Button size="sm" onClick={saveCredentials} disabled={savingCredentials}>
                              {savingCredentials ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                              Guardar
                            </Button>
                          </>
                        )}
                      </div>

                      {/* Redirect URI */}
                      <CredentialRow label="Redirect URL" value={redirectUri} readOnly onCopy={() => copyToClipboard(redirectUri)} />

                      {/* Client ID */}
                      {editMode ? (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Client ID</Label>
                          <Input value={editClientId} onChange={(e) => setEditClientId(e.target.value)} className="text-xs h-8 font-mono" placeholder="Tu Client ID" />
                        </div>
                      ) : (
                        <CredentialRow
                          label="Client ID"
                          value={showClientId ? credentials.clientIdFull : credentials.clientId}
                          onToggle={() => setShowClientId(!showClientId)}
                          showToggle
                          isVisible={showClientId}
                          onCopy={() => copyToClipboard(credentials.clientIdFull)}
                        />
                      )}

                      {/* Client Secret */}
                      {editMode ? (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Client Secret</Label>
                          <Input value={editClientSecret} onChange={(e) => setEditClientSecret(e.target.value)} className="text-xs h-8 font-mono" placeholder="Tu Client Secret" />
                        </div>
                      ) : (
                        <CredentialRow
                          label="Client Secret"
                          value={showClientSecret ? credentials.clientSecretFull : credentials.clientSecret}
                          onToggle={() => setShowClientSecret(!showClientSecret)}
                          showToggle
                          isVisible={showClientSecret}
                          onCopy={() => copyToClipboard(credentials.clientSecretFull)}
                        />
                      )}

                      {/* Root Folder ID */}
                      {editMode ? (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Root Folder ID</Label>
                          <Input value={editRootFolderId} onChange={(e) => setEditRootFolderId(e.target.value)} className="text-xs h-8 font-mono" placeholder="ID carpeta raíz" />
                        </div>
                      ) : (
                        <CredentialRow label="Root Folder ID" value={credentials.rootFolderId || "(no configurado)"} onCopy={() => copyToClipboard(credentials.rootFolderId)} />
                      )}
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          {/* ─── 3. Sincronización ─── */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
              Sincronización
            </h3>
            <div className="flex items-center gap-3">
              <Button onClick={handleSyncAllContracts} variant="outline" size="sm" disabled={syncing} className="gap-2">
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : lastSyncResult?.success ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <RefreshCw className="h-4 w-4" />}
                {syncing ? "Sincronizando..." : "Sincronizar Contratos con Drive"}
              </Button>
              {lastSyncResult && (
                <span className={`text-xs ${lastSyncResult.success ? "text-green-600" : "text-destructive"}`}>
                  {lastSyncResult.success ? `${lastSyncResult.count} contratos sincronizados` : "Error en sincronización"}
                </span>
              )}
            </div>
          </div>

          {/* ─── 4. Conexiones registradas ─── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                Conexiones Registradas
              </h3>
              <Button onClick={() => setDialogOpen(true)} size="sm" variant="outline" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Agregar
              </Button>
            </div>

            {connections.length > 0 ? (
              <div className="space-y-2">
                {connections.map((conn) => {
                  const provider = getProviderInfo(conn.provider);
                  return (
                    <div
                      key={conn.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        conn.is_active ? "bg-muted/30 border-border" : "bg-muted/10 border-border/50 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-lg">{provider.emoji}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{conn.name}</span>
                            <Badge variant={conn.is_active ? "default" : "secondary"} className="text-xs shrink-0">
                              {conn.is_active ? "Activo" : "Inactivo"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{provider.name} · {formatDate(conn.created_at)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {conn.folder_url && (
                          <Button variant="ghost" size="sm" onClick={() => window.open(conn.folder_url!, "_blank")}>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => handleToggleActive(conn.id, conn.is_active)}>
                          {conn.is_active ? "Desactivar" : "Activar"}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteConnection(conn.id, conn.name)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Cloud className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No hay conexiones registradas</p>
              </div>
            )}
          </div>

          {/* ─── Note ─── */}
          <div className="bg-muted/50 p-3 rounded-lg">
            <h4 className="font-medium text-sm mb-1">Nota importante</h4>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              <li>• Los archivos existentes se mantienen en su proveedor original</li>
              <li>• Los nuevos archivos se subirán al proveedor seleccionado</li>
              <li>• Cada archivo muestra el ícono de su proveedor de origen</li>
            </ul>
          </div>
        </div>
      </CollapsibleCard>

      {/* ── Dialogs ── */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cambiar proveedor de almacenamiento?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Los nuevos archivos se subirán a <strong>{PROVIDERS.find((p) => p.id === pendingProvider)?.name}</strong>.</p>
              <p>Los archivos previos seguirán accesibles desde su proveedor original.</p>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Conexión de Almacenamiento</DialogTitle>
            <DialogDescription>Configura una conexión a un servicio de almacenamiento en la nube</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Proveedor</Label>
              <Select value={newProvider} onValueChange={setNewProvider}>
                <SelectTrigger><SelectValue placeholder="Selecciona un proveedor" /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.emoji} {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nombre de la conexión</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ej: Drive Corporativo" />
            </div>
            <div className="space-y-2">
              <Label>URL de la carpeta (opcional)</Label>
              <Input value={newFolderUrl} onChange={(e) => setNewFolderUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/..." />
              <p className="text-xs text-muted-foreground">URL de la carpeta compartida para documentos</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateConnection} disabled={savingConnection || !newProvider || !newName.trim()}>
              {savingConnection ? "Guardando..." : "Crear Conexión"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Small reusable credential row ──
function CredentialRow({ label, value, readOnly, onCopy, onToggle, showToggle, isVisible }: {
  label: string;
  value: string;
  readOnly?: boolean;
  onCopy?: () => void;
  onToggle?: () => void;
  showToggle?: boolean;
  isVisible?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input value={value} readOnly className="text-xs h-8 bg-background font-mono" />
        {showToggle && onToggle && (
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onToggle}>
            {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
        )}
        {onCopy && (
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onCopy}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
