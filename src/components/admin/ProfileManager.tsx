import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Copy, Loader2, Users, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PermissionTreeEditor, PermissionsMap, getAllResources } from "./PermissionTreeEditor";

interface ProfileTemplate {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  user_count?: number;
}

interface ProfileFormState {
  name: string;
  description: string;
  permissions: PermissionsMap;
}

const EMPTY_FORM: ProfileFormState = {
  name: "",
  description: "",
  permissions: {},
};

function initAllNone(): PermissionsMap {
  const m: PermissionsMap = {};
  getAllResources().forEach(r => { m[r] = "none"; });
  return m;
}

export function ProfileManager() {
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<ProfileTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<ProfileTemplate | null>(null);

  useEffect(() => { loadProfiles(); }, []);

  async function loadProfiles() {
    setLoading(true);
    const { data: profileData, error } = await supabase
      .from("user_profile_templates" as any)
      .select("*")
      .order("name");

    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
      setLoading(false);
      return;
    }

    // Count users per profile
    const { data: profilesWithCount } = await supabase
      .from("profiles")
      .select("profile_template_id")
      .not("profile_template_id", "is", null);

    const countMap: Record<string, number> = {};
    (profilesWithCount ?? []).forEach((p: any) => {
      if (p.profile_template_id) {
        countMap[p.profile_template_id] = (countMap[p.profile_template_id] ?? 0) + 1;
      }
    });

    setProfiles(
      ((profileData ?? []) as any[]).map(p => ({ ...p, user_count: countMap[p.id] ?? 0 }))
    );
    setLoading(false);
  }

  async function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, permissions: initAllNone() });
    setFormOpen(true);
  }

  async function openEdit(profile: ProfileTemplate) {
    setEditingId(profile.id);
    setForm({ name: profile.name, description: profile.description ?? "", permissions: initAllNone() });
    setFormOpen(true);

    // Load permissions
    const { data } = await supabase
      .from("profile_template_permissions" as any)
      .select("resource, permission")
      .eq("profile_id", profile.id);

    if (data) {
      const perms: PermissionsMap = initAllNone();
      (data as any[]).forEach(p => { perms[p.resource] = p.permission; });
      setForm(prev => ({ ...prev, permissions: perms }));
    }
  }

  async function openDuplicate(profile: ProfileTemplate) {
    setEditingId(null);
    const { data } = await supabase
      .from("profile_template_permissions" as any)
      .select("resource, permission")
      .eq("profile_id", profile.id);

    const perms: PermissionsMap = initAllNone();
    ((data ?? []) as any[]).forEach((p: any) => { perms[p.resource] = p.permission; });

    setForm({ name: `${profile.name} (copia)`, description: profile.description ?? "", permissions: perms });
    setFormOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast({ variant: "destructive", title: "Error", description: "El nombre del perfil es requerido" });
      return;
    }

    setSaving(true);
    try {
      let profileId = editingId;

      if (editingId) {
        const { error } = await supabase
          .from("user_profile_templates" as any)
          .update({ name: form.name.trim(), description: form.description.trim() || null })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("user_profile_templates" as any)
          .insert({ name: form.name.trim(), description: form.description.trim() || null })
          .select("id")
          .single();
        if (error) throw error;
        profileId = (data as any).id;
      }

      // Replace permissions
      await supabase.from("profile_template_permissions" as any).delete().eq("profile_id", profileId!);

      const toInsert = Object.entries(form.permissions)
        .filter(([, v]) => v !== "none")
        .map(([resource, permission]) => ({ profile_id: profileId, resource, permission }));

      if (toInsert.length > 0) {
        const { error } = await supabase.from("profile_template_permissions" as any).insert(toInsert);
        if (error) throw error;
      }

      toast({ title: editingId ? "Perfil actualizado" : "Perfil creado" });
      setFormOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      loadProfiles();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase
        .from("user_profile_templates" as any)
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      toast({ title: "Perfil eliminado" });
      setDeleteTarget(null);
      loadProfiles();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Los perfiles definen conjuntos de permisos reutilizables. Al asignar un perfil a un usuario, sus permisos se copian automáticamente.
        </p>
        <Button size="sm" onClick={openCreate} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Nuevo Perfil
        </Button>
      </div>

      {profiles.length === 0 ? (
        <div className="text-center py-12 border rounded-lg text-muted-foreground">
          <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>No hay perfiles creados.</p>
          <p className="text-sm mt-1">Crea un perfil para agrupar permisos y asignarlos rápidamente a usuarios.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Perfil</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-center">Usuarios</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map(profile => (
              <TableRow key={profile.id}>
                <TableCell className="font-medium">{profile.name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{profile.description ?? "—"}</TableCell>
                <TableCell className="text-center">
                  <span className="inline-flex items-center gap-1 text-sm">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    {profile.user_count}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(profile)} title="Editar perfil">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openDuplicate(profile)} title="Duplicar perfil">
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if ((profile.user_count ?? 0) > 0) {
                          toast({
                            variant: "destructive",
                            title: "No se puede eliminar",
                            description: `El perfil "${profile.name}" tiene ${profile.user_count} usuario(s) asociado(s). Reasigna los usuarios antes de eliminar.`,
                          });
                          return;
                        }
                        setDeleteTarget(profile);
                      }}
                      title="Eliminar perfil"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={open => { if (!saving) { setFormOpen(open); if (!open) { setEditingId(null); setForm(EMPTY_FORM); } } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle>{editingId ? "Editar Perfil" : "Nuevo Perfil"}</DialogTitle>
            <DialogDescription>
              Define el nombre, descripción y permisos de este perfil.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="profile-name">Nombre del Perfil <span className="text-destructive">*</span></Label>
                <Input
                  id="profile-name"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ej: Gestor de Contratos"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-desc">Descripción (opcional)</Label>
                <Input
                  id="profile-desc"
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Ej: Acceso a contratos y presupuesto"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Permisos del Perfil</Label>
              <PermissionTreeEditor
                permissions={form.permissions}
                onChange={perms => setForm(p => ({ ...p, permissions: perms }))}
              />
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingId ? "Guardar cambios" : "Crear Perfil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar perfil "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El perfil y sus permisos configurados serán eliminados permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
