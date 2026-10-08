import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import {
  getGeochileSettings,
  saveGeochileSettings,
  listSavedIsochrones,
  type GeochileSettings,
} from "@/lib/geochile/client";

// Configuración de la integración con geochile-compass (proyecto Supabase
// separado): URL base del proyecto + API key para llamar sus edge
// functions (list-saved-isochrones / export-sales-projection) desde el
// flujo de "Asignar Isócrona" en Informe Directorio.
export function GeochileIntegrationManager() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<GeochileSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getGeochileSettings();
      setSettings(s);
      if (s) { setBaseUrl(s.baseUrl); setApiKey(s.apiKey); }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (!baseUrl.trim() || !apiKey.trim()) {
      toast.error("Completá la URL base y la API key");
      return;
    }
    if (!user) return;
    setSaving(true);
    try {
      await saveGeochileSettings({ id: settings?.id, baseUrl, apiKey, userId: user.id });
      toast.success("Configuración guardada");
      const s = await getGeochileSettings();
      setSettings(s);
    } catch (err: any) {
      toast.error(err.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!baseUrl.trim() || !apiKey.trim()) {
      toast.error("Completá la URL base y la API key antes de probar");
      return;
    }
    setTesting(true);
    try {
      const list = await listSavedIsochrones({ id: settings?.id || "", baseUrl: baseUrl.trim().replace(/\/$/, ""), apiKey: apiKey.trim() });
      toast.success(`Conexión OK — ${list.length} isócrona${list.length === 1 ? "" : "s"} guardada${list.length === 1 ? "" : "s"} encontrada${list.length === 1 ? "" : "s"}`);
    } catch (err: any) {
      toast.error(err.message || "No se pudo conectar con geochile-compass");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando...</div>;
  }

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-sm text-muted-foreground">
        Conecta con geochile-compass para poder ver sus isócronas guardadas y asignarlas a un contrato desde el Informe Directorio, importando su proyección de ventas al Business Case Financiero.
      </p>
      <div className="space-y-2">
        <Label>URL base del proyecto</Label>
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://xxxxxxxxxxxx.supabase.co"
        />
      </div>
      <div className="space-y-2">
        <Label>API Key</Label>
        <div className="flex gap-2">
          <Input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Clave configurada en geochile-compass (EXPORT_API_KEY)"
          />
          <Button variant="outline" size="icon" onClick={() => setShowKey((v) => !v)} type="button">
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Guardar
        </Button>
        <Button variant="outline" onClick={handleTest} disabled={testing}>
          {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          Probar conexión
        </Button>
        {settings && <span className="text-xs text-muted-foreground">Configurado</span>}
      </div>
    </div>
  );
}
