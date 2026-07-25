import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { Plus, Pencil, Trash2, KeyRound, History, Loader2, Mail, MessageCircle } from "lucide-react";

interface TeamMember {
  id: string;
  email: string;
  full_name: string | null;
  invitation_status: "pending" | "active" | "reset";
  created_at: string;
  created_by: string | null;
}

interface GerenteGroup {
  gerenteId: string;
  gerenteLabel: string;
  nombreGerencia: string | null;
  members: TeamMember[];
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

function buildShareMessage(displayName: string) {
  return `Estimad@ ${displayName}.\nUsted ha sido invitado a visualizar los programas de apertura de Grupo Planet. Para acceder solo debe ingresar a ${window.location.origin} y seguir las instrucciones. Bienvenido`;
}

const ORPHAN_GROUP_ID = "__sin_gerente__";

// Administración de equipo_gerencia para admin -- mismas operaciones que
// TeamUsers.tsx (Fase 3), pero viendo TODOS los equipo_gerencia agrupados por
// el gerente que los invitó. Al crear, el admin elige el gerente pasando
// on_behalf_of_gerente_id (create-team-invitation valida que sea un gerente real).
export function TeamUsersAdminManager() {
  const { toast } = useToast();

  const [groups, setGroups] = useState<GerenteGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [createForGerente, setCreateForGerente] = useState<{ id: string; label: string } | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Overlay simple DENTRO del mismo Dialog (no un segundo Dialog/AlertDialog de
  // Radix): dos modales de Radix montados a la vez y cerrándose en el mismo
  // tick dejan pointer-events del body trabado, congelando la página (mismo
  // problema evitado en TeamUsers.tsx / DependencyDialog.tsx).
  const [pendingAction, setPendingAction] = useState<"save" | "cancel" | null>(null);

  const [shareTarget, setShareTarget] = useState<{ email: string; full_name: string | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);
  const [resetTarget, setResetTarget] = useState<TeamMember | null>(null);

  const [usoTarget, setUsoTarget] = useState<TeamMember | null>(null);
  const [usoEvents, setUsoEvents] = useState<LoginEvent[] | null>(null);
  const [usoLoading, setUsoLoading] = useState(false);
  const [usoError, setUsoError] = useState(false);
  const usoRequestIdRef = useRef<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [{ data: gerenteRoles, error: gerenteRolesError }, { data: equipoRoles, error: equipoRolesError }] = await Promise.all([
      supabase.from("user_roles").select("user_id").eq("role", "gerente"),
      supabase.from("user_roles").select("user_id").eq("role", "equipo_gerencia"),
    ]);
    if (gerenteRolesError || equipoRolesError) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo cargar la lista de usuarios." });
      setLoading(false);
      return;
    }

    const gerenteIds = (gerenteRoles || []).map((r) => r.user_id);
    const equipoIds = (equipoRoles || []).map((r) => r.user_id);

    const [{ data: gerenteProfiles }, { data: equipoProfiles }, { data: orgMembers }] = await Promise.all([
      gerenteIds.length
        ? supabase.from("profiles").select("id, email, full_name, org_member_id").in("id", gerenteIds)
        : Promise.resolve({ data: [] as any[] }),
      equipoIds.length
        ? supabase.from("profiles").select("id, email, full_name, invitation_status, created_at, created_by").in("id", equipoIds)
        : Promise.resolve({ data: [] as any[] }),
      // org_members no es de lectura directa (columnas sensibles); position
      // se obtiene vía esta función (mismo patrón que TeamUsers.tsx).
      supabase.rpc("get_org_members_basic"),
    ]);

    const gerenteIdSet = new Set(gerenteIds);
    const result: GerenteGroup[] = (gerenteProfiles || [])
      .map((g: any) => ({
        gerenteId: g.id,
        gerenteLabel: g.full_name || g.email,
        nombreGerencia: (orgMembers as any[] | null)?.find((m) => m.id === g.org_member_id)?.position || null,
        members: (equipoProfiles || []).filter((m: any) => m.created_by === g.id) as TeamMember[],
      }))
      .sort((a, b) => a.gerenteLabel.localeCompare(b.gerenteLabel));

    const orphans = (equipoProfiles || []).filter((m: any) => !gerenteIdSet.has(m.created_by)) as TeamMember[];
    if (orphans.length > 0) {
      result.push({ gerenteId: ORPHAN_GROUP_ID, gerenteLabel: "Sin gerente asignado", nombreGerencia: null, members: orphans });
    }

    setGroups(result);
    setLoading(false);
  }, [toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const openCreate = (gerente: { id: string; label: string }) => {
    setEditing(null);
    setCreateForGerente(gerente);
    setEmailInput("");
    setFormOpen(true);
  };

  const openEdit = (member: TeamMember) => {
    setEditing(member);
    setCreateForGerente(null);
    setEmailInput(member.email);
    setFormOpen(true);
  };

  const requestCancel = () => setPendingAction("cancel");
  const doCancel = () => {
    setPendingAction(null);
    setFormOpen(false);
    setEditing(null);
    setCreateForGerente(null);
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
        const { error } = await supabase.functions.invoke("update-team-user-email", {
          body: { user_id: editing.id, email: emailInput.trim() },
        });
        if (error) throw error;
        toast({ title: "Usuario actualizado" });
        setFormOpen(false);
        await loadAll();
      } else if (createForGerente) {
        const { data, error } = await supabase.functions.invoke("create-team-invitation", {
          body: { email: emailInput.trim(), on_behalf_of_gerente_id: createForGerente.id },
        });
        if (error) throw error;
        toast({ title: "Usuario invitado", description: "Se envió un correo de activación." });
        setFormOpen(false);
        await loadAll();
        setShareTarget({ email: data?.user?.email || emailInput.trim(), full_name: data?.user?.full_name || null });
      }
      setEditing(null);
      setCreateForGerente(null);
      setEmailInput("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message || "No se pudo guardar el usuario." });
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
      await loadAll();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message || "No se pudo eliminar el usuario." });
    } finally {
      setSubmitting(false);
      setDeleteTarget(null);
    }
  };

  const doReset = async () => {
    if (!resetTarget) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("reset-team-user-password", { body: { user_id: resetTarget.id } });
      if (error) throw error;
      toast({ title: "Reset enviado", description: "Se envió un correo para crear una nueva contraseña." });
      await loadAll();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message || "No se pudo resetear la contraseña." });
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

  const openShareDialog = (member: TeamMember) => setShareTarget({ email: member.email, full_name: member.full_name });

  const shareViaWhatsApp = () => {
    if (!shareTarget) return;
    const displayName = shareTarget.full_name || shareTarget.email;
    window.open(`https://wa.me/?text=${encodeURIComponent(buildShareMessage(displayName))}`, "_blank", "noopener,noreferrer");
  };

  const shareViaEmail = () => {
    if (!shareTarget) return;
    const displayName = shareTarget.full_name || shareTarget.email;
    const subject = encodeURIComponent("Invitación - Grupo Planet");
    const body = encodeURIComponent(buildShareMessage(displayName));
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Todavía no hay usuarios Equipo Gerencia. Asigna el rol "Gerente" a alguien desde la
        sección Usuarios de arriba para que aparezca acá y puedas invitar a su equipo.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <CollapsibleCard
          key={group.gerenteId}
          title={group.gerenteLabel}
          description={
            group.gerenteId === ORPHAN_GROUP_ID
              ? `${group.members.length} usuario${group.members.length === 1 ? "" : "s"}`
              : `${group.members.length} usuario${group.members.length === 1 ? "" : "s"} · Rol mostrado: Equipo Gerencia ${group.nombreGerencia || "(sin asignar)"}`
          }
          headerActions={
            group.gerenteId !== ORPHAN_GROUP_ID && (
              <Button size="sm" variant="outline" onClick={() => openCreate({ id: group.gerenteId, label: group.gerenteLabel })}>
                <Plus className="h-4 w-4 mr-1.5" />
                Nuevo usuario
              </Button>
            )
          }
        >
          {group.members.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Sin usuarios todavía.</p>
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
                {group.members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.email}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[m.invitation_status]}>{STATUS_LABEL[m.invitation_status]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(m.created_at), "dd-MM-yyyy")}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" title="Compartir" aria-label={`Compartir invitación con ${m.email}`} onClick={() => openShareDialog(m)}>
                        <MessageCircle className="h-4 w-4" />
                      </Button>
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
        </CollapsibleCard>
      ))}

      {/* Crear / editar */}
      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) requestCancel(); }}>
        <DialogContent
          onInteractOutside={(e) => { if (pendingAction !== null) e.preventDefault(); }}
          onEscapeKeyDown={(e) => {
            if (pendingAction !== null) { e.preventDefault(); setPendingAction(null); }
          }}
        >
          <div className="relative">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar usuario" : `Nuevo usuario para ${createForGerente?.label ?? ""}`}</DialogTitle>
              <DialogDescription>
                {editing
                  ? "Actualiza el email de este usuario."
                  : "La contraseña la crea el usuario en su primer ingreso."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={requestSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-team-user-email">Email</Label>
                <Input
                  id="admin-team-user-email"
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
                aria-labelledby="admin-team-user-confirm-title"
              >
                <div className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-xl space-y-4 mx-4">
                  <div className="space-y-1.5">
                    <h2 id="admin-team-user-confirm-title" className="text-lg font-semibold">
                      {pendingAction === "save"
                        ? (editing ? "¿Actualizar usuario?" : "¿Crear usuario?")
                        : "¿Descartar cambios?"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {pendingAction === "save"
                        ? (editing
                            ? `Se cambiará el email a ${emailInput.trim()}.`
                            : `Se invitará a ${emailInput.trim()} como Equipo Gerencia de ${createForGerente?.label ?? ""}.`)
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

      {/* Compartir */}
      <Dialog open={!!shareTarget} onOpenChange={(open) => { if (!open) setShareTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compartir invitación</DialogTitle>
            <DialogDescription>Elige por dónde enviar el acceso a {shareTarget?.email}.</DialogDescription>
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
              Se cerrará la sesión activa de {resetTarget?.email} y se le enviará un correo para crear una nueva contraseña.
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
}
