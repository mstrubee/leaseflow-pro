import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { getFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { ArrowLeft, Plus, Pencil, Trash2, KeyRound, History, Loader2, Mail, MessageCircle } from "lucide-react";

interface TeamMember {
  id: string;
  email: string;
  full_name: string | null;
  invitation_status: "pending" | "active" | "reset";
  created_at: string;
}

interface LoginEvent {
  logged_in_at: string;
}

const STATUS_LABEL: Record<TeamMember["invitation_status"], string> = {
  pending: "Pendiente",
  active: "Activo",
  reset: "Reset enviado",
};

const STATUS_VARIANT: Record<TeamMember["invitation_status"], "secondary" | "default" | "outline"> = {
  pending: "secondary",
  active: "default",
  reset: "outline",
};

// La plataforma todavía no envía email automáticamente -- el enlace de
// activación/reset se comparte a mano (WhatsApp/Email) con el mensaje
// pre-cargado. Por eso el mensaje incluye el enlace real, no solo el dominio.
function buildInviteMessage(displayName: string, link: string) {
  return `Estimad@ ${displayName}.\nUsted ha sido invitado a visualizar los programas de apertura de Grupo Planet. Para acceder ingrese al siguiente enlace y siga las instrucciones:\n${link}\nBienvenido`;
}

function buildResetMessage(displayName: string, link: string) {
  return `Estimad@ ${displayName}.\nSe generó un nuevo enlace para crear tu contraseña de acceso a Grupo Planet. Ingresa al siguiente enlace y sigue las instrucciones:\n${link}`;
}

const TeamUsers = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [nombreGerencia, setNombreGerencia] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Overlay simple DENTRO del mismo Dialog, no un segundo Dialog/AlertDialog
  // de Radix: dos modales de Radix montados a la vez y cerrándose en el mismo
  // tick dejan `pointer-events` del body trabado, congelando la página (mismo
  // problema ya resuelto en DependencyDialog.tsx).
  const [pendingAction, setPendingAction] = useState<"save" | "cancel" | null>(null);

  const [shareTarget, setShareTarget] = useState<{ email: string; full_name: string | null; link: string; kind: "invite" | "reset" } | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);
  const [resetTarget, setResetTarget] = useState<TeamMember | null>(null);

  const [usoTarget, setUsoTarget] = useState<TeamMember | null>(null);
  const [usoEvents, setUsoEvents] = useState<LoginEvent[] | null>(null);
  const [usoLoading, setUsoLoading] = useState(false);
  const [usoError, setUsoError] = useState(false);
  const usoRequestIdRef = useRef<string | null>(null);

  const loadMembers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, invitation_status, created_at")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo cargar la lista de usuarios." });
    } else {
      setMembers((data as TeamMember[]) || []);
    }
    setLoading(false);
  }, [user, toast]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  // nombre_gerencia = position del nodo del organigrama vinculado a MI propio
  // perfil (org_member_id) -- así se llama el rol de los usuarios que invito:
  // "Equipo Gerencia {nombre_gerencia}". org_members no es de lectura directa
  // (columnas sensibles), se accede vía la función get_org_members_basic().
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_member_id")
        .eq("id", user.id)
        .single();
      if (!profile?.org_member_id) return;
      const { data: orgMembers } = await supabase.rpc("get_org_members_basic");
      const mine = (orgMembers as any[] | null)?.find((m) => m.id === profile.org_member_id);
      setNombreGerencia(mine?.position || null);
    })();
  }, [user]);

  const openCreate = () => {
    setEditing(null);
    setEmailInput("");
    setFormOpen(true);
  };

  const openEdit = (member: TeamMember) => {
    setEditing(member);
    setEmailInput(member.email);
    setFormOpen(true);
  };

  const requestCancel = () => setPendingAction("cancel");
  const doCancel = () => {
    setPendingAction(null);
    setFormOpen(false);
    setEditing(null);
    setEmailInput("");
  };

  const requestSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) {
      toast({ variant: "destructive", title: "Error", description: "El email es obligatorio." });
      return;
    }
    setPendingAction("save");
  };

  const doSave = async () => {
    setPendingAction(null);
    setSubmitting(true);
    try {
      if (editing) {
        const { data, error } = await supabase.functions.invoke("update-team-user-email", {
          body: { user_id: editing.id, email: emailInput.trim() },
        });
        if (error) throw error;
        toast({ title: "Usuario actualizado" });
        setFormOpen(false);
        await loadMembers();
        if (data?.activation_link) {
          setShareTarget({ email: emailInput.trim(), full_name: editing.full_name, link: data.activation_link, kind: "invite" });
        }
      } else {
        const { data, error } = await supabase.functions.invoke("create-team-invitation", {
          body: { email: emailInput.trim() },
        });
        if (error) throw error;
        toast({ title: "Usuario invitado" });
        setFormOpen(false);
        await loadMembers();
        if (data?.activation_link) {
          setShareTarget({
            email: data?.user?.email || emailInput.trim(),
            full_name: data?.user?.full_name || null,
            link: data.activation_link,
            kind: "invite",
          });
        }
      }
      setEditing(null);
      setEmailInput("");
    } catch (err: any) {
      const message = await getFunctionErrorMessage(err, "No se pudo guardar el usuario.");
      toast({ variant: "destructive", title: "Error", description: message });
    } finally {
      setSubmitting(false);
    }
  };

  const doDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("delete-team-user", { body: { user_id: deleteTarget.id } });
      if (error) throw error;
      toast({ title: "Usuario eliminado" });
      await loadMembers();
    } catch (err: any) {
      const message = await getFunctionErrorMessage(err, "No se pudo eliminar el usuario.");
      toast({ variant: "destructive", title: "Error", description: message });
    } finally {
      setSubmitting(false);
      setDeleteTarget(null);
    }
  };

  const doReset = async () => {
    if (!resetTarget) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("reset-team-user-password", { body: { user_id: resetTarget.id } });
      if (error) throw error;
      toast({ title: "Reset generado" });
      await loadMembers();
      if (data?.reset_link) {
        setShareTarget({ email: resetTarget.email, full_name: resetTarget.full_name, link: data.reset_link, kind: "reset" });
      }
    } catch (err: any) {
      const message = await getFunctionErrorMessage(err, "No se pudo resetear la contraseña.");
      toast({ variant: "destructive", title: "Error", description: message });
    } finally {
      setSubmitting(false);
      setResetTarget(null);
    }
  };

  const openUso = async (member: TeamMember) => {
    usoRequestIdRef.current = member.id;
    setUsoTarget(member);
    setUsoLoading(true);
    setUsoError(false);
    setUsoEvents(null);
    const { data, error } = await supabase
      .from("login_events")
      .select("logged_in_at")
      .eq("user_id", member.id)
      .order("logged_in_at", { ascending: false })
      .limit(10);
    // El usuario pudo haber cerrado este diálogo y abierto el de otro
    // miembro antes de que esta consulta resolviera -- si ya no es el
    // request vigente, descartamos el resultado en vez de pisar su estado.
    if (usoRequestIdRef.current !== member.id) return;
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo cargar el historial de uso." });
      setUsoError(true);
      setUsoEvents([]);
    } else {
      setUsoEvents((data as LoginEvent[]) || []);
    }
    setUsoLoading(false);
  };

  const shareViaWhatsApp = () => {
    if (!shareTarget) return;
    const displayName = shareTarget.full_name || shareTarget.email;
    const message = shareTarget.kind === "invite"
      ? buildInviteMessage(displayName, shareTarget.link)
      : buildResetMessage(displayName, shareTarget.link);
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  const shareViaEmail = () => {
    if (!shareTarget) return;
    const displayName = shareTarget.full_name || shareTarget.email;
    const message = shareTarget.kind === "invite"
      ? buildInviteMessage(displayName, shareTarget.link)
      : buildResetMessage(displayName, shareTarget.link);
    const subject = encodeURIComponent(shareTarget.kind === "invite" ? "Invitación - Grupo Planet" : "Nueva contraseña - Grupo Planet");
    const body = encodeURIComponent(message);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Volver
          </Button>
          <h1 className="text-xl font-semibold text-foreground">Usuarios de mi equipo</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Equipo Gerencia</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Rol mostrado a los usuarios que invites: <span className="font-medium">
                  Equipo Gerencia {nombreGerencia || "(sin asignar)"}
                </span>
                {!nombreGerencia && " — pídele al administrador que te vincule a un nodo del organigrama."}
              </p>
            </div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" />
              Nuevo usuario
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Todavía no has invitado a nadie a tu equipo.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Creado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.email}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[m.invitation_status]}>{STATUS_LABEL[m.invitation_status]}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{format(new Date(m.created_at), "dd-MM-yyyy")}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="icon" title="Uso" aria-label={`Ver uso de ${m.email}`} onClick={() => openUso(m)}>
                          <History className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Reset Password" aria-label={`Resetear contraseña de ${m.email}`} onClick={() => setResetTarget(m)}>
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Editar" aria-label={`Editar ${m.email}`} onClick={() => openEdit(m)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Eliminar" aria-label={`Eliminar ${m.email}`} onClick={() => setDeleteTarget(m)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Crear / editar */}
      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) requestCancel(); }}>
        <DialogContent
          onInteractOutside={(e) => { if (pendingAction !== null) e.preventDefault(); }}
          onEscapeKeyDown={(e) => {
            // Con la confirmación abierta, Esc vuelve al formulario en vez de
            // disparar el cierre del Dialog por debajo.
            if (pendingAction !== null) { e.preventDefault(); setPendingAction(null); }
          }}
        >
          {/* Wrapper "relative" separado de DialogContent (que ya trae "fixed"
              para centrarse): el overlay de confirmación de abajo se ancla a
              ESTE div, no a DialogContent. */}
          <div className="relative">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar usuario" : "Nuevo usuario"}</DialogTitle>
              <DialogDescription>
                {editing
                  ? "Actualiza el email de este usuario."
                  : "La contraseña la crea el usuario en su primer ingreso."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={requestSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="team-user-email">Email</Label>
                <Input
                  id="team-user-email"
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="usuario@empresa.cl"
                  required
                  disabled={pendingAction !== null}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={requestCancel} disabled={submitting || pendingAction !== null}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting || pendingAction !== null}>
                  {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  Guardar
                </Button>
              </DialogFooter>
            </form>

            {pendingAction !== null && (
              <div
                className="absolute inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-[2px] rounded-lg"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="team-user-confirm-title"
              >
                <div className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-xl space-y-4 mx-4">
                  <div className="space-y-1.5">
                    <h2 id="team-user-confirm-title" className="text-lg font-semibold">
                      {pendingAction === "save"
                        ? (editing ? "¿Actualizar usuario?" : "¿Crear usuario?")
                        : "¿Descartar cambios?"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {pendingAction === "save"
                        ? (editing
                            ? `Se cambiará el email a ${emailInput.trim()}.`
                            : `Se invitará a ${emailInput.trim()} como Equipo Gerencia.`)
                        : "Se perderá lo que hayas ingresado en el formulario."}
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" disabled={submitting} onClick={() => setPendingAction(null)} autoFocus>
                      Volver
                    </Button>
                    <Button
                      type="button"
                      disabled={submitting}
                      onClick={pendingAction === "save" ? doSave : doCancel}
                      variant={pendingAction === "cancel" ? "destructive" : "default"}
                    >
                      {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                      {pendingAction === "save" ? "Confirmar" : "Descartar"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Compartir -- la plataforma no envía email automáticamente, el enlace
          se entrega a mano por WhatsApp o Email. */}
      <Dialog open={!!shareTarget} onOpenChange={(open) => { if (!open) setShareTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{shareTarget?.kind === "invite" ? "Compartir invitación" : "Compartir enlace de reset"}</DialogTitle>
            <DialogDescription>
              Elige por dónde enviar el acceso a {shareTarget?.email}. El enlace es de un solo uso —
              compártelo solo con esta persona, no lo reenvíes ni lo publiques.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3">
            <Button className="flex-1" variant="outline" onClick={shareViaWhatsApp}>
              <MessageCircle className="h-4 w-4 mr-1.5" />
              WhatsApp
            </Button>
            <Button className="flex-1" variant="outline" onClick={shareViaEmail}>
              <Mail className="h-4 w-4 mr-1.5" />
              Email
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Uso */}
      <Dialog open={!!usoTarget} onOpenChange={(open) => { if (!open) { usoRequestIdRef.current = null; setUsoTarget(null); setUsoEvents(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Uso de {usoTarget?.email}</DialogTitle>
            <DialogDescription>Últimos inicios de sesión, más reciente primero.</DialogDescription>
          </DialogHeader>
          {usoLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : usoError ? (
            <p className="text-sm text-destructive py-6 text-center">
              No se pudo cargar el historial de uso. Intenta nuevamente.
            </p>
          ) : usoEvents && usoEvents.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usoEvents.map((ev, i) => (
                  <TableRow key={i}>
                    <TableCell>{format(new Date(ev.logged_in_at), "dd-MM-yyyy HH:mm")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center">Este usuario todavía no ha iniciado sesión.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmar reset password */}
      <AlertDialog open={!!resetTarget} onOpenChange={(open) => { if (!open) setResetTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Resetear contraseña?</AlertDialogTitle>
            <AlertDialogDescription>
              Se cerrará la sesión activa de {resetTarget?.email} y se generará un enlace nuevo para crear una contraseña,
              que vas a poder compartir por WhatsApp o Email.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doReset} disabled={submitting}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar eliminar */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente la cuenta de {deleteTarget?.email}. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} disabled={submitting}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TeamUsers;
