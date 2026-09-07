import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Loader2, Tags } from "lucide-react";

const MAIN_RESOURCES = [
  { id: "contracts", label: "Contratos" },
  { id: "dashboard", label: "Dashboard" },
  { id: "repository", label: "Repositorio" },
  { id: "suppliers", label: "Proveedores" },
  { id: "maintenance", label: "Mantenciones" },
  { id: "purchase_orders", label: "Órdenes de Compra" },
  { id: "capex", label: "CAPEX" },
  { id: "opex", label: "OPEX" },
  { id: "alerts", label: "Alertas" },
  { id: "reports", label: "Informes" },
  { id: "kpi", label: "KPI" },
  { id: "patents", label: "Patentes" },
  { id: "special_attention", label: "Atención Especial" },
  { id: "geoloc", label: "GEOLOC" },
];

interface CustomRole {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface CustomRolePermission {
  id: string;
  custom_role_id: string;
  resource: string;
  permission: "view" | "edit";
}

interface Props {
  /** Called when role data changes, so parent can refresh its dropdown */
  onRolesChange?: () => void;
}

export function CustomRolesManager({ onRolesChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [rolePerms, setRolePerms] = useState<CustomRolePermission[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPerms, setNewPerms] = useState<Record<string, "view" | "edit" | "none">>({});
  const [saving, setSaving] = useState(false);

  // Edit dialog
  const [editRole, setEditRole] = useState<CustomRole | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPerms, setEditPerms] = useState<Record<string, "view" | "edit" | "none">>({});
  const [updating, setUpdating] = useState(false);

  const loadRoles = async () => {
    setLoading(true);
    const [{ data: rolesData }, { data: permsData }] = await Promise.all([
      supabase.from("custom_roles" as any).select("*").order("name"),
      supabase.from("custom_role_permissions" as any).select("*"),
    ]);
    setRoles((rolesData as any) ?? []);
    setRolePerms((permsData as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { loadRoles(); }, []);

  const getPermsForRole = (roleId: string) =>
    rolePerms.filter((p) => p.custom_role_id === roleId);

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast({ variant: "destructive", title: "Error", description: "El nombre es requerido" });
      return;
    }
    setSaving(true);
    try {
      const { data: created, error } = await supabase
        .from("custom_roles" as any)
        .insert({ name: newName.trim(), description: newDescription.trim() || null, created_by: user?.id })
        .select()
        .single();
      if (error) throw error;

      const permsToInsert = Object.entries(newPerms)
        .filter(([, v]) => v !== "none")
        .map(([resource, permission]) => ({
          custom_role_id: (created as any).id,
          resource,
          permission,
        }));

      if (permsToInsert.length > 0) {
        const { error: permErr } = await supabase
          .from("custom_role_permissions" as any)
          .insert(permsToInsert);
        if (permErr) throw permErr;
      }

      toast({ title: "Tipo de rol creado", description: newName.trim() });
      setCreateOpen(false);
      setNewName("");
      setNewDescription("");
      setNewPerms({});
      await loadRoles();
      onRolesChange?.();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (role: CustomRole) => {
    setEditRole(role);
    setEditName(role.name);
    setEditDescription(role.description ?? "");
    const perms: Record<string, "view" | "edit" | "none"> = {};
    getPermsForRole(role.id).forEach((p) => { perms[p.resource] = p.permission; });
    setEditPerms(perms);
    setEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editRole || !editName.trim()) return;
    setUpdating(true);
    try {
      const { error: nameErr } = await supabase
        .from("custom_roles" as any)
        .update({ name: editName.trim(), description: editDescription.trim() || null })
        .eq("id", editRole.id);
      if (nameErr) throw nameErr;

      // Replace permissions
      await supabase.from("custom_role_permissions" as any).delete().eq("custom_role_id", editRole.id);
      const permsToInsert = Object.entries(editPerms)
        .filter(([, v]) => v !== "none")
        .map(([resource, permission]) => ({ custom_role_id: editRole.id, resource, permission }));
      if (permsToInsert.length > 0) {
        const { error: permErr } = await supabase.from("custom_role_permissions" as any).insert(permsToInsert);
        if (permErr) throw permErr;
      }

      toast({ title: "Tipo de rol actualizado" });
      setEditOpen(false);
      setEditRole(null);
      await loadRoles();
      onRolesChange?.();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async (role: CustomRole) => {
    if (!confirm(`¿Eliminar tipo de rol "${role.name}"? Los usuarios que lo tienen asignado conservan sus permisos actuales.`)) return;
    await supabase.from("custom_roles" as any).delete().eq("id", role.id);
    await loadRoles();
    onRolesChange?.();
    toast({ title: "Tipo de rol eliminado" });
  };

  const PermissionsEditor = ({
    perms,
    onChange,
  }: {
    perms: Record<string, "view" | "edit" | "none">;
    onChange: (updated: Record<string, "view" | "edit" | "none">) => void;
  }) => (
    <div className="space-y-2">
      {MAIN_RESOURCES.map((r) => (
        <div key={r.id} className="flex items-center justify-between">
          <span className="text-sm">{r.label}</span>
          <Select
            value={perms[r.id] ?? "none"}
            onValueChange={(v) => onChange({ ...perms, [r.id]: v as any })}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin acceso</SelectItem>
              <SelectItem value="view">Ver</SelectItem>
              <SelectItem value="edit">Editar</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-2"><Loader2 className="h-4 w-4 animate-spin" /> Cargando tipos de rol…</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Tags className="h-4 w-4" />
          <span>Define plantillas de permisos para asignar rápidamente a nuevos usuarios.</span>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              Nuevo Tipo de Rol
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Crear Tipo de Rol</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Nombre <span className="text-destructive">*</span></Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ej: Analista Comercial" />
              </div>
              <div className="space-y-1.5">
                <Label>Descripción</Label>
                <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Descripción opcional" />
              </div>
              <div className="space-y-1.5">
                <Label>Permisos por defecto</Label>
                <PermissionsEditor perms={newPerms} onChange={setNewPerms} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Crear
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {roles.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-2">No hay tipos de rol personalizados. Crea uno para agilizar la creación de usuarios.</p>
      ) : (
        <div className="divide-y rounded-lg border">
          {roles.map((role) => {
            const perms = getPermsForRole(role.id);
            return (
              <div key={role.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm">{role.name}</div>
                  {role.description && <div className="text-xs text-muted-foreground">{role.description}</div>}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {perms.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">Sin permisos definidos</span>
                    ) : (
                      perms.map((p) => (
                        <Badge key={p.id} variant="secondary" className="text-xs">
                          {MAIN_RESOURCES.find((r) => r.id === p.resource)?.label ?? p.resource}:{" "}
                          {p.permission === "edit" ? "Editar" : "Ver"}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(role)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(role)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Tipo de Rol</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nombre <span className="text-destructive">*</span></Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Descripción opcional" />
            </div>
            <div className="space-y-1.5">
              <Label>Permisos por defecto</Label>
              <PermissionsEditor perms={editPerms} onChange={setEditPerms} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdate} disabled={updating}>
              {updating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Hook to load custom roles for use in user create/edit dialogs */
export function useCustomRoles() {
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [customRolePerms, setCustomRolePerms] = useState<CustomRolePermission[]>([]);

  const load = async () => {
    const [{ data: rolesData }, { data: permsData }] = await Promise.all([
      supabase.from("custom_roles" as any).select("*").order("name"),
      supabase.from("custom_role_permissions" as any).select("*"),
    ]);
    setCustomRoles((rolesData as any) ?? []);
    setCustomRolePerms((permsData as any) ?? []);
  };

  useEffect(() => { load(); }, []);

  const getPermissionsForRole = (roleId: string): Record<string, "view" | "edit" | "none"> => {
    const perms: Record<string, "view" | "edit" | "none"> = {};
    customRolePerms.filter((p) => p.custom_role_id === roleId).forEach((p) => {
      perms[p.resource] = p.permission;
    });
    return perms;
  };

  return { customRoles, getPermissionsForRole, reload: load };
}
