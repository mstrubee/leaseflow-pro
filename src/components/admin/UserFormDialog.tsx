import { useState, useEffect } from "react";
import { Eye, EyeOff, Loader2, KeyRound, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PermissionTreeEditor, PermissionsMap, getAllResources } from "./PermissionTreeEditor";

interface ProfileTemplate {
  id: string;
  name: string;
}

export interface UserFormData {
  userId?: string;       // only when editing
  firstName: string;
  lastName: string;
  email: string;
  role: "admin" | "user" | "operador_terreno";
  isActive: boolean;
  profileTemplateId: string | null;
  permissions: PermissionsMap;
  supplierIds: string[];
}

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: Partial<UserFormData>;
  onSaved: () => void;
  suppliers: { id: string; name: string }[];
}

function initAllNone(): PermissionsMap {
  const m: PermissionsMap = {};
  getAllResources().forEach(r => { m[r] = "none"; });
  return m;
}

export function UserFormDialog({ open, onOpenChange, initialData, onSaved, suppliers }: UserFormDialogProps) {
  const { toast } = useToast();
  const isEditing = !!initialData?.userId;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "user" | "operador_terreno">("user");
  const [isActive, setIsActive] = useState(true);
  const [profileTemplateId, setProfileTemplateId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<PermissionsMap>(initAllNone());
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [supplierSearch, setSupplierSearch] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [profileTemplates, setProfileTemplates] = useState<ProfileTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [showPerms, setShowPerms] = useState(false);

  useEffect(() => {
    if (open) {
      loadProfileTemplates();
      resetForm();
    }
  }, [open]);

  useEffect(() => {
    if (open && initialData) {
      setFirstName(initialData.firstName ?? "");
      setLastName(initialData.lastName ?? "");
      setEmail(initialData.email ?? "");
      setRole(initialData.role ?? "user");
      setIsActive(initialData.isActive ?? true);
      setProfileTemplateId(initialData.profileTemplateId ?? null);
      setSupplierIds(initialData.supplierIds ?? []);
      // Si hay un rol asignado, cargamos los permisos ACTUALES de la plantilla
      // (no los permisos individuales del usuario, que pueden estar desactualizados)
      if (initialData.profileTemplateId) {
        applyProfileTemplate(initialData.profileTemplateId);
      } else {
        setPermissions(initialData.permissions ?? initAllNone());
      }
    }
  }, [open, initialData]);

  async function loadProfileTemplates() {
    const { data } = await supabase
      .from("user_profile_templates" as any)
      .select("id, name")
      .order("name");
    setProfileTemplates((data ?? []) as any[]);
  }

  function resetForm() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setRole("user");
    setIsActive(true);
    setProfileTemplateId(null);
    setPermissions(initAllNone());
    setSupplierIds([]);
    setSupplierSearch("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirm(false);
    setShowPerms(false);
  }

  async function applyProfileTemplate(templateId: string) {
    setProfileTemplateId(templateId);
    if (!templateId) {
      setPermissions(initAllNone());
      return;
    }
    const { data } = await supabase
      .from("profile_template_permissions" as any)
      .select("resource, permission")
      .eq("profile_id", templateId);
    const perms: PermissionsMap = initAllNone();
    ((data ?? []) as any[]).forEach((p: any) => { perms[p.resource] = p.permission; });
    setPermissions(perms);
  }

  const passwordMismatch = password !== "" && confirmPassword !== "" && password !== confirmPassword;
  const passwordMissing = !isEditing && !password.trim();

  async function handleSave() {
    if (!firstName.trim()) {
      toast({ variant: "destructive", title: "Error", description: "El nombre es requerido" });
      return;
    }
    if (!email.trim()) {
      toast({ variant: "destructive", title: "Error", description: "El email es requerido" });
      return;
    }
    if (passwordMissing) {
      toast({ variant: "destructive", title: "Error", description: "La contraseña es requerida para nuevos usuarios" });
      return;
    }
    if (passwordMismatch) {
      toast({ variant: "destructive", title: "Error", description: "Las contraseñas no coinciden" });
      return;
    }
    if (password && password.length < 6) {
      toast({ variant: "destructive", title: "Error", description: "La contraseña debe tener al menos 6 caracteres" });
      return;
    }

    setSaving(true);
    try {
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
      const { data: sessionData } = await supabase.auth.getSession();

      const effectivePermissions = role === "operador_terreno"
        ? { maintenance: permissions.maintenance ?? "edit", ...permissions }
        : permissions;

      if (isEditing && initialData?.userId) {
        // Update
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-user`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sessionData.session?.access_token}`,
            },
            body: JSON.stringify({
              userId: initialData.userId,
              email: email !== initialData.email ? email : undefined,
              fullName: fullName !== `${initialData.firstName ?? ""} ${initialData.lastName ?? ""}`.trim() ? fullName : undefined,
              password: password || undefined,
              role: role !== initialData.role ? role : undefined,
              permissions: effectivePermissions,
            }),
          }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Error al actualizar usuario");

        // Update is_active + profile_template_id in profiles
        await supabase
          .from("profiles")
          .update({ is_active: isActive, profile_template_id: profileTemplateId } as any)
          .eq("id", initialData.userId);

        // Sync operator suppliers
        await supabase.from("operator_suppliers").delete().eq("user_id", initialData.userId);
        if (role === "operador_terreno" && supplierIds.length > 0) {
          await supabase.from("operator_suppliers").insert(
            supplierIds.map(supplier_id => ({ user_id: initialData.userId, supplier_id }))
          );
        }

        toast({ title: "Usuario actualizado" });
      } else {
        // Create
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sessionData.session?.access_token}`,
            },
            body: JSON.stringify({
              email: email.trim(),
              password,
              fullName,
              role,
              permissions: effectivePermissions,
              supplierIds: role === "operador_terreno" ? supplierIds : [],
            }),
          }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Error al crear usuario");

        // Set is_active + profile_template_id (user was just created)
        if (result.userId || result.user?.id) {
          const newUserId = result.userId ?? result.user?.id;
          await supabase
            .from("profiles")
            .update({ is_active: isActive, profile_template_id: profileTemplateId } as any)
            .eq("id", newUserId);
        }

        toast({ title: "Usuario creado", description: `${email} creado exitosamente` });
      }

      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!saving) onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle>{isEditing ? "Editar Usuario" : "Nuevo Usuario"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Modifica los datos del usuario." : "Completa los datos para crear un nuevo usuario."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nombre <span className="text-destructive">*</span></Label>
              <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Nombre" />
            </div>
            <div className="space-y-1.5">
              <Label>Apellidos</Label>
              <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Apellido(s)" />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label>Correo Electrónico <span className="text-destructive">*</span></Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@empresa.com" />
          </div>

          {/* Password */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{isEditing ? "Nueva Contraseña" : "Contraseña"} {!isEditing && <span className="text-destructive">*</span>}</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={isEditing ? "Dejar vacío para no cambiar" : "Mínimo 6 caracteres"}
                  className={passwordMismatch ? "border-destructive pr-9" : "pr-9"}
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Confirmar Contraseña {!isEditing && <span className="text-destructive">*</span>}</Label>
              <div className="relative">
                <Input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repetir contraseña"
                  className={passwordMismatch ? "border-destructive pr-9" : "pr-9"}
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowConfirm(v => !v)}
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          {passwordMismatch && (
            <p className="text-xs text-destructive -mt-3 flex items-center gap-1">
              <span className="font-medium">Las contraseñas no coinciden.</span> Verifica ambos campos antes de guardar.
            </p>
          )}

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <div className="flex items-center gap-3 h-10 px-3 border rounded-md bg-background w-fit">
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                id="is-active"
              />
              <label htmlFor="is-active" className={`text-sm cursor-pointer ${isActive ? "text-green-600 font-medium" : "text-muted-foreground"}`}>
                {isActive ? "Activo" : "Inactivo"}
              </label>
            </div>
          </div>

          {/* Supplier assignment for operador_terreno */}
          {role === "operador_terreno" && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 space-y-2">
              <Label className="text-sm">Proveedores asignados</Label>
              <p className="text-xs text-muted-foreground">El operador verá solo las rutas de estos proveedores.</p>
              {suppliers.length === 0 ? (
                <p className="text-xs italic text-muted-foreground">No hay proveedores creados</p>
              ) : (
                <>
                  <Input
                    value={supplierSearch}
                    onChange={e => setSupplierSearch(e.target.value)}
                    placeholder="Buscar proveedor..."
                    className="h-8 text-sm"
                  />
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {suppliers
                      .filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase()))
                      .map(s => (
                        <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white/60 rounded px-1.5 py-1">
                          <input
                            type="checkbox"
                            checked={supplierIds.includes(s.id)}
                            onChange={() =>
                              setSupplierIds(prev =>
                                prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id]
                              )
                            }
                            className="rounded border-gray-300"
                          />
                          <span className="truncate">{s.name}</span>
                        </label>
                      ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Profile template + Permissions */}
          <div className="space-y-3 border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Rol</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Selecciona un rol para cargar permisos, luego personaliza si lo deseas.
                  </p>
                </div>
              </div>

              <Select
                value={profileTemplateId ?? "none"}
                onValueChange={v => applyProfileTemplate(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin rol asignado (configurar manualmente)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin rol asignado</SelectItem>
                  {profileTemplates.map(pt => (
                    <SelectItem key={pt.id} value={pt.id}>{pt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Collapsible permission tree */}
              <button
                type="button"
                className="flex items-center gap-2 text-sm text-primary hover:underline w-full"
                onClick={() => setShowPerms(v => !v)}
              >
                {showPerms ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {showPerms ? "Ocultar árbol de permisos" : "Ver y personalizar permisos"}
              </button>

              {showPerms && (
                <PermissionTreeEditor
                  permissions={permissions}
                  onChange={setPermissions}
                />
              )}
          </div>

          {/* Password visibility notice */}
          <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3 flex gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <KeyRound className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Sobre la seguridad de contraseñas</p>
              <p className="mt-0.5 text-amber-700 dark:text-amber-400">
                Por razones de seguridad, las contraseñas se almacenan como hash y no pueden recuperarse en texto plano.
                Para cambiar la contraseña de un usuario, utiliza el campo "Nueva Contraseña" de este formulario.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || passwordMismatch}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Guardar cambios" : "Crear Usuario"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
