import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldAlert, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";

interface LoginEntry {
  user_id: string;
  email: string;
  last_sign_in_at: string | null;
  created_at: string;
}

export function SecuritySessionsPanel() {
  const { toast } = useToast();
  const { isAdmin, loading: authLoading } = useAuth();
  const [logins, setLogins] = useState<LoginEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [forcing, setForcing] = useState(false);

  const loadLogins = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("recent-logins");
      if (error) throw error;
      setLogins(data?.logins ?? []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Esperar a que la sesión esté restaurada antes de llamar a la Edge Function.
  // Sin este guard, en page-reload el JWT no está disponible todavía y la
  // función devuelve 401/403 → "Edge Function returned a non-2xx status code".
  useEffect(() => {
    if (!authLoading && isAdmin) loadLogins();
  }, [authLoading, isAdmin]);

  const handleForceLogoutAll = async () => {
    setForcing(true);
    try {
      const { data, error } = await supabase.functions.invoke("force-logout-all");
      if (error) throw error;
      toast({
        title: "Sesiones cerradas",
        description: `Se cerraron ${data?.signed_out ?? 0} sesiones. Todos deberán volver a iniciar sesión.`,
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setForcing(false);
    }
  };

  return (
    <CollapsibleCard
      title="Seguridad y Sesiones"
      description="Auditoría de inicios de sesión y control de sesiones activas"
      defaultOpen={false}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadLogins} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Refrescar</span>
            </Button>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={forcing}>
                {forcing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                <span className="ml-2">Cerrar todas las sesiones</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Cerrar todas las sesiones?</AlertDialogTitle>
                <AlertDialogDescription>
                  Todos los usuarios (incluido tú) serán desconectados de todos sus dispositivos
                  y deberán volver a iniciar sesión. Esta acción es inmediata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleForceLogoutAll}>
                  Cerrar todas
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Último inicio de sesión</TableHead>
                <TableHead>Cuenta creada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logins.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Sin datos
                  </TableCell>
                </TableRow>
              )}
              {logins.map((l) => (
                <TableRow key={l.user_id}>
                  <TableCell className="font-medium">{l.email}</TableCell>
                  <TableCell>
                    {l.last_sign_in_at
                      ? format(new Date(l.last_sign_in_at), "dd/MM/yyyy HH:mm")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {format(new Date(l.created_at), "dd/MM/yyyy")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </CollapsibleCard>
  );
}
