import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissionSelection } from "@/contexts/PermissionSelectionContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Shield, Loader2, FolderPlus, Folder, ChevronRight, Cloud, Pencil, Navigation, Eye, EyeOff, Upload, Copy } from "lucide-react";
import { CloudStorageSettings } from "@/components/contracts/CloudStorageSettings";
import { BudgetTemplateManager } from "@/components/budget/BudgetTemplateManager";
import { GanttTemplateManager } from "@/components/gantt/GanttTemplateManager";
import { StorageProviderSettings } from "@/components/admin/StorageProviderSettings";
import { CompanyManager } from "@/components/admin/CompanyManager";
import { StorageMonitor } from "@/components/admin/StorageMonitor";
import { OCRequestTemplateManager } from "@/components/admin/OCRequestTemplateManager";
import { LogoManager } from "@/components/admin/LogoManager";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { ComiteGPStatusManager } from "@/components/admin/ComiteGPStatusManager";
import { OrgChartManager } from "@/components/admin/OrgChartManager";
import { MaintenanceCriticalityManager } from "@/components/admin/MaintenanceCriticalityManager";
import { MaintenanceSubStatusManager } from "@/components/admin/MaintenanceSubStatusManager";
interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  last_seen_at: string | null;
}

interface UserRole {
  user_id: string;
  role: "admin" | "user";
}

interface UserPermission {
  id: string;
  user_id: string;
  resource: string;
  permission: "view" | "edit" | "all"; // 'all' kept for backwards compatibility with DB enum
}

interface FolderTemplate {
  id: string;
  name: string;
  folder_type: string | null;
  display_order: number;
  parent_id: string | null;
}

// Recursive component for rendering folder templates with unlimited nesting
const FolderTemplateItem = ({
  template,
  level,
  getSubfolders,
  onAddSubfolder,
  onDelete,
}: {
  template: FolderTemplate;
  level: number;
  getSubfolders: (parentId: string) => FolderTemplate[];
  onAddSubfolder: (parentId: string) => void;
  onDelete: (id: string, name: string) => void;
}) => {
  const subfolders = getSubfolders(template.id);
  const isRoot = level === 0;
  const paddingLeft = level * 16; // 16px per level
  
  return (
    <div className="space-y-1">
      <div 
        className={`flex items-center justify-between p-2 ${isRoot ? 'p-3 bg-muted/50' : 'bg-muted/30'} rounded-lg`}
        style={{ marginLeft: `${paddingLeft}px` }}
      >
        <div className="flex items-center gap-2">
          {!isRoot && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          <Folder className={`${isRoot ? 'h-4 w-4' : 'h-3 w-3'} text-muted-foreground`} />
          <span className={isRoot ? 'font-medium' : 'text-sm'}>{template.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAddSubfolder(template.id)}
            title="Agregar subcarpeta"
          >
            <FolderPlus className={`${isRoot ? 'h-4 w-4' : 'h-3 w-3'} text-primary`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(template.id, template.name)}
          >
            <Trash2 className={`${isRoot ? 'h-4 w-4' : 'h-3 w-3'} text-destructive`} />
          </Button>
        </div>
      </div>
      {/* Recursive render of subfolders */}
      {subfolders.map((subfolder) => (
        <FolderTemplateItem
          key={subfolder.id}
          template={subfolder}
          level={level + 1}
          getSubfolders={getSubfolders}
          onAddSubfolder={onAddSubfolder}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  last_seen_at: string | null;
}

interface UserRole {
  user_id: string;
  role: "admin" | "user";
}

interface UserPermission {
  id: string;
  user_id: string;
  resource: string;
  permission: "view" | "edit" | "all"; // 'all' kept for backwards compatibility with DB enum
}

// Recursos principales
const MAIN_RESOURCES = [
  { id: "contracts", label: "Contratos", category: "principal" },
  { id: "dashboard", label: "Dashboard", category: "principal" },
  { id: "repository", label: "Repositorio", category: "principal" },
  { id: "suppliers", label: "Proveedores", category: "principal" },
  { id: "maintenance", label: "Mantenciones", category: "principal" },
  { id: "purchase_orders", label: "Órdenes de Compra", category: "principal" },
  { id: "opex", label: "OPEX", category: "principal" },
  { id: "alerts", label: "Alertas", category: "principal" },
  { id: "reports", label: "Informes", category: "principal" },
  { id: "kpi", label: "KPI", category: "principal" },
];

// Secciones del Dashboard
const DASHBOARD_SECTIONS = [
  { id: "dashboard_stats", label: "Estadísticas de Contratos", category: "dashboard" },
  { id: "dashboard_map", label: "Mapa Interactivo", category: "dashboard" },
  { id: "dashboard_economic", label: "Indicadores Económicos", category: "dashboard" },
  { id: "dashboard_patents", label: "Patentes (Dashboard)", category: "dashboard" },
];

// Secciones de Detalle de Contrato
const CONTRACT_SECTIONS = [
  { id: "contract_address", label: "Dirección", category: "contrato" },
  { id: "contract_contact", label: "Contacto", category: "contrato" },
  { id: "contract_commercial", label: "Condiciones Comerciales", category: "contrato" },
  { id: "contract_surfaces", label: "Superficies y Datos", category: "contrato" },
  { id: "contract_documents", label: "Contrato de Arriendo", category: "contrato" },
  { id: "contract_repository", label: "Repositorio de Documentos", category: "contrato" },
  { id: "contract_budget", label: "Control Presupuestario", category: "contrato" },
  { id: "contract_gantt", label: "Línea de Tiempo / Gantt", category: "contrato" },
  { id: "contract_alerts", label: "Alertas y Recordatorios", category: "contrato" },
  { id: "contract_patents", label: "Patentes (Contrato)", category: "contrato" },
];

// Todos los recursos combinados
const ALL_RESOURCES = [...MAIN_RESOURCES, ...DASHBOARD_SECTIONS, ...CONTRACT_SECTIONS];

// Solo para compatibilidad con código anterior
const RESOURCES = MAIN_RESOURCES;

const AdminPanel = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isAdmin, loading: authLoading, roleLoaded } = useAuth();
  const { toast } = useToast();
  const { isSelecting, selectedElements, pendingUserData, startSelection, isEditMode } = usePermissionSelection();
  
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [loading, setLoading] = useState(true);
  
  // New user form
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState<"admin" | "user">("user");
  const [newUserPermissions, setNewUserPermissions] = useState<Record<string, "view" | "edit" | "none">>({});
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Check if returning from permission selection
  const completeUser = searchParams.get("completeUser") === "true";

  // Permission edit
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editPermissions, setEditPermissions] = useState<Record<string, "view" | "edit" | "none">>({});

  // Folder templates
  const [folderTemplates, setFolderTemplates] = useState<FolderTemplate[]>([]);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateType, setNewTemplateType] = useState("");
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [selectedParentTemplate, setSelectedParentTemplate] = useState<string | null>(null);
  const [subfolderDialogOpen, setSubfolderDialogOpen] = useState(false);
  const [newSubfolderName, setNewSubfolderName] = useState("");

  // Edit user
  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);
  const [editingUserProfile, setEditingUserProfile] = useState<Profile | null>(null);
  const [editUserEmail, setEditUserEmail] = useState("");
  const [editUserName, setEditUserName] = useState("");
  const [editUserPassword, setEditUserPassword] = useState("");
  const [editUserRole, setEditUserRole] = useState<"admin" | "user">("user");
  const [editUserPermissions, setEditUserPermissions] = useState<Record<string, "view" | "edit" | "none">>({});
  const [updatingUser, setUpdatingUser] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!authLoading && roleLoaded && !isAdmin) {
      navigate("/");
      return;
    }
    if (roleLoaded && isAdmin) {
      loadData();
    }
  }, [authLoading, isAdmin, roleLoaded, navigate]);

  // Handle return from permission selection mode
  useEffect(() => {
    if (completeUser && pendingUserData && Object.keys(selectedElements).length >= 0) {
      // Convert selectedElements to permissions format
      const perms: Record<string, "view" | "edit" | "none"> = {};
      Object.values(selectedElements).forEach(el => {
        perms[el.elementId] = el.permission;
      });

      if (isEditMode && pendingUserData.userId) {
        // Editing existing user
        const profile = profiles.find(p => p.id === pendingUserData.userId);
        if (profile) {
          setEditingUserProfile(profile);
          setEditUserEmail(pendingUserData.email);
          setEditUserName(pendingUserData.name);
          setEditUserPassword(pendingUserData.password);
          setEditUserRole(pendingUserData.role);
          setEditUserPermissions(perms);
          setEditUserDialogOpen(true);
        }
      } else {
        // Creating new user
        setNewUserEmail(pendingUserData.email);
        setNewUserPassword(pendingUserData.password);
        setNewUserName(pendingUserData.name);
        setNewUserRole(pendingUserData.role);
        setNewUserPermissions(perms);
        setDialogOpen(true);
      }
      // Clear URL params
      navigate("/admin", { replace: true });
    }
  }, [completeUser, pendingUserData, selectedElements, navigate, isEditMode, profiles]);

  const loadData = async () => {
    setLoading(true);
    
    const [profilesRes, rolesRes, permissionsRes, templatesRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("*"),
      supabase.from("user_permissions").select("*"),
      supabase.from("folder_templates").select("*").order("display_order", { ascending: true }),
    ]);

    setProfiles(profilesRes.data || []);
    setUserRoles(rolesRes.data || []);
    setUserPermissions(permissionsRes.data || []);
    setFolderTemplates(templatesRes.data || []);
    setLoading(false);
  };

  const getUserRole = (userId: string) => {
    return userRoles.find(r => r.user_id === userId)?.role || "user";
  };

  const getUserPermissions = (userId: string) => {
    return userPermissions.filter(p => p.user_id === userId);
  };

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPassword) {
      toast({ variant: "destructive", title: "Error", description: "Email y contraseña son requeridos" });
      return;
    }

    setCreating(true);
    try {
      // Create user via edge function with admin privileges
      const { data: sessionData } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionData.session?.access_token}`,
          },
          body: JSON.stringify({
            email: newUserEmail,
            password: newUserPassword,
            fullName: newUserName,
            role: newUserRole,
            permissions: newUserPermissions
          })
        }
      );

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Error al crear usuario');
      }

      toast({ title: "Usuario creado", description: `${newUserEmail} ha sido creado exitosamente` });
      setDialogOpen(false);
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserName("");
      setNewUserRole("user");
      setNewUserPermissions({});
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (userId === user?.id) {
      toast({ variant: "destructive", title: "Error", description: "No puedes eliminar tu propia cuenta" });
      return;
    }

    try {
      // Delete permissions and roles first
      await supabase.from("user_permissions").delete().eq("user_id", userId);
      await supabase.from("user_roles").delete().eq("user_id", userId);
      await supabase.from("profiles").delete().eq("id", userId);
      
      toast({ title: "Usuario eliminado" });
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const handleUpdatePermissions = async (userId: string) => {
    try {
      // Delete existing permissions
      await supabase.from("user_permissions").delete().eq("user_id", userId);

      // Insert new permissions
      const permissionsToInsert = Object.entries(editPermissions)
        .filter(([_, perm]) => perm !== "none")
        .map(([resource, permission]) => ({
          user_id: userId,
          resource,
          permission: permission as "view" | "edit"
        }));

      if (permissionsToInsert.length > 0) {
        await supabase.from("user_permissions").insert(permissionsToInsert);
      }

      toast({ title: "Permisos actualizados" });
      setEditingUserId(null);
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const openEditPermissions = (userId: string) => {
    const userPerms = getUserPermissions(userId);
    const permsMap: Record<string, "view" | "edit" | "none"> = {};
    RESOURCES.forEach(r => {
      const perm = userPerms.find(p => p.resource === r.id);
      // Map legacy 'all' to 'edit'
      const permValue = perm?.permission === "all" ? "edit" : perm?.permission;
      permsMap[r.id] = permValue || "none";
    });
    setEditPermissions(permsMap);
    setEditingUserId(userId);
  };

  const openEditUser = (profile: Profile) => {
    setEditingUserProfile(profile);
    setEditUserEmail(profile.email);
    setEditUserName(profile.full_name || "");
    setEditUserPassword("");
    setEditUserRole(getUserRole(profile.id) as "admin" | "user");
    // Load existing permissions
    const userPerms = getUserPermissions(profile.id);
    const permsMap: Record<string, "view" | "edit" | "none"> = {};
    userPerms.forEach(p => {
      // Map legacy 'all' to 'edit'
      permsMap[p.resource] = p.permission === "all" ? "edit" : p.permission;
    });
    setEditUserPermissions(permsMap);
    setEditUserDialogOpen(true);
  };

  const handleUpdateUser = async () => {
    if (!editingUserProfile) return;

    setUpdatingUser(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionData.session?.access_token}`,
          },
          body: JSON.stringify({
            userId: editingUserProfile.id,
            email: editUserEmail !== editingUserProfile.email ? editUserEmail : undefined,
            fullName: editUserName !== editingUserProfile.full_name ? editUserName : undefined,
            password: editUserPassword || undefined,
            role: editUserRole !== getUserRole(editingUserProfile.id) ? editUserRole : undefined,
            permissions: editUserPermissions,
          })
        }
      );

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Error al actualizar usuario');
      }

      toast({ title: "Usuario actualizado", description: "Los cambios se guardaron exitosamente" });
      setEditUserDialogOpen(false);
      setEditingUserProfile(null);
      setEditUserPermissions({});
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setUpdatingUser(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast({ variant: "destructive", title: "Error", description: "El nombre es requerido" });
      return;
    }

    setCreatingTemplate(true);
    try {
      const maxOrder = folderTemplates.length > 0 
        ? Math.max(...folderTemplates.map(t => t.display_order)) + 1 
        : 1;
      
      const folderType = newTemplateType.trim() || newTemplateName.toLowerCase().replace(/\s+/g, '_');
      
      const { error } = await supabase
        .from("folder_templates")
        .insert({
          name: newTemplateName.trim(),
          folder_type: folderType,
          display_order: maxOrder,
          parent_id: null,
        });

      if (error) throw error;

      toast({ title: "Carpeta creada", description: `La carpeta "${newTemplateName}" se aplicará a todos los contratos` });
      setNewTemplateName("");
      setNewTemplateType("");
      setTemplateDialogOpen(false);
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setCreatingTemplate(false);
    }
  };

  const handleCreateSubfolder = async () => {
    if (!newSubfolderName.trim() || !selectedParentTemplate) {
      toast({ variant: "destructive", title: "Error", description: "El nombre es requerido" });
      return;
    }

    setCreatingTemplate(true);
    try {
      const parentTemplate = folderTemplates.find(t => t.id === selectedParentTemplate);
      const siblingSubfolders = folderTemplates.filter(t => t.parent_id === selectedParentTemplate);
      const maxOrder = siblingSubfolders.length > 0 
        ? Math.max(...siblingSubfolders.map(t => t.display_order)) + 1 
        : 1;
      
      const folderType = newSubfolderName.toLowerCase().replace(/\s+/g, '_');
      
      const { error } = await supabase
        .from("folder_templates")
        .insert({
          name: newSubfolderName.trim(),
          folder_type: folderType,
          display_order: maxOrder,
          parent_id: selectedParentTemplate,
        });

      if (error) throw error;

      toast({ 
        title: "Subcarpeta creada", 
        description: `La subcarpeta "${newSubfolderName}" se agregará automáticamente dentro de "${parentTemplate?.name}"` 
      });
      setNewSubfolderName("");
      setSubfolderDialogOpen(false);
      setSelectedParentTemplate(null);
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setCreatingTemplate(false);
    }
  };

  const getSubfolders = (parentId: string): FolderTemplate[] => {
    return folderTemplates.filter(t => t.parent_id === parentId);
  };

  const getRootTemplates = (): FolderTemplate[] => {
    return folderTemplates.filter(t => t.parent_id === null);
  };

  const handleDeleteTemplate = async (templateId: string, templateName: string) => {
    if (!confirm(`¿Eliminar la carpeta "${templateName}" del template? Esto no eliminará las carpetas existentes en los contratos.`)) return;

    try {
      const { error } = await supabase
        .from("folder_templates")
        .delete()
        .eq("id", templateId);

      if (error) throw error;

      toast({ title: "Carpeta eliminada del template" });
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  if (authLoading || !roleLoaded || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-[108rem] mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Panel de Administración</h1>
              <p className="text-muted-foreground">Gestiona usuarios y permisos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/contracts/new")} className="gap-2">
              <Plus className="h-4 w-4" />
              Nuevo Contrato
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/contracts/bulk-upload")} className="gap-2">
              <Upload className="h-4 w-4" />
              Carga Masiva
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate("/deleted")} className="gap-2">
              <Trash2 className="h-4 w-4" />
              Eliminados
            </Button>
          </div>
        </div>

        <CollapsibleCard
          title="Usuarios"
          description="Lista de todos los usuarios registrados"
          icon={<Shield className="h-5 w-5" />}
          headerActions={
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo Usuario
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Crear Nuevo Usuario</DialogTitle>
                  <DialogDescription>
                    Ingresa los datos del nuevo usuario y asigna permisos
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-name">Nombre Completo</Label>
                    <Input
                      id="new-name"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder="Juan Pérez"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-email">Email</Label>
                    <Input
                      id="new-email"
                      type="email"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="usuario@email.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">Contraseña</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Rol</Label>
                    <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as "admin" | "user")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">Usuario</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {newUserRole === "user" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Permisos por Sección</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            startSelection({
                              email: newUserEmail,
                              password: newUserPassword,
                              name: newUserName,
                              role: newUserRole,
                            });
                            setDialogOpen(false);
                            navigate("/");
                          }}
                          className="gap-1"
                        >
                          <Navigation className="h-3 w-3" />
                          Navegar y Seleccionar
                        </Button>
                      </div>
                      {RESOURCES.map(resource => (
                        <div key={resource.id} className="flex items-center justify-between">
                          <span className="text-sm">{resource.label}</span>
                          <Select
                            value={newUserPermissions[resource.id] || "none"}
                            onValueChange={(v) => setNewUserPermissions(prev => ({ ...prev, [resource.id]: v as any }))}
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
                      {Object.keys(newUserPermissions).filter(k => !RESOURCES.find(r => r.id === k) && newUserPermissions[k] !== "none").length > 0 && (
                        <div className="pt-2 border-t">
                          <p className="text-xs text-muted-foreground mb-2">Permisos adicionales seleccionados:</p>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(newUserPermissions)
                              .filter(([k, v]) => !RESOURCES.find(r => r.id === k) && v !== "none")
                              .map(([key, value]) => (
                                <span key={key} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                                  {key}: {value}
                                </span>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={handleCreateUser} disabled={creating}>
                    {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Crear Usuario
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Permisos</TableHead>
                  <TableHead>Fecha Creación</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell>{profile.email}</TableCell>
                    <TableCell>{profile.full_name || "-"}</TableCell>
                    <TableCell>
                      {(() => {
                        const isOnline = profile.last_seen_at && 
                          (Date.now() - new Date(profile.last_seen_at).getTime()) < 5 * 60 * 1000;
                        return (
                          <div className="flex items-center gap-1.5">
                            <span className={`h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                            <span className={`text-xs ${isOnline ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
                              {isOnline ? 'Conectado' : 'Desconectado'}
                            </span>
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs ${
                        getUserRole(profile.id) === "admin" 
                          ? "bg-primary/20 text-primary" 
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {getUserRole(profile.id) === "admin" ? "Administrador" : "Usuario"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {getUserRole(profile.id) === "admin" ? (
                        <span className="text-sm text-muted-foreground">Acceso completo</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {getUserPermissions(profile.id).map(p => (
                            <span key={p.id} className="px-1.5 py-0.5 bg-secondary text-secondary-foreground rounded text-xs">
                              {RESOURCES.find(r => r.id === p.resource)?.label}: {p.permission}
                            </span>
                          ))}
                          {getUserPermissions(profile.id).length === 0 && (
                            <span className="text-sm text-muted-foreground">Sin permisos</span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(profile.created_at).toLocaleDateString("es-CL")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const userPerms = getUserPermissions(profile.id);
                            const permsMap: Record<string, "view" | "edit" | "none"> = {};
                            userPerms.forEach(p => {
                              permsMap[p.resource] = p.permission === "all" ? "edit" : p.permission;
                            });
                            setNewUserEmail("");
                            setNewUserPassword("");
                            setNewUserName("");
                            setNewUserRole(getUserRole(profile.id) as "admin" | "user");
                            setNewUserPermissions(permsMap);
                            setDialogOpen(true);
                          }}
                          title="Crear usuario con mismos permisos"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditUser(profile)}
                          title="Editar usuario"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {profile.id !== user?.id && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteUser(profile.id)}
                            title="Eliminar usuario"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        </CollapsibleCard>

        {/* Companies */}
        <CompanyManager defaultCollapsed />

        {/* Organigrama */}
        <OrgChartManager defaultCollapsed />

        {/* Logo Management */}
        <CollapsibleCard
          title="Logos de la Aplicación"
          description="Administra los logos que se muestran en la aplicación"
        >
          <LogoManager />
        </CollapsibleCard>

        {/* Cloud Storage Settings */}
        <CloudStorageSettings defaultCollapsed />

        {/* Budget Templates */}
        <BudgetTemplateManager defaultCollapsed />

        {/* Gantt Templates */}
        <GanttTemplateManager defaultCollapsed />

        {/* OC Request Templates */}
        <OCRequestTemplateManager defaultCollapsed />

        {/* Folder Templates */}
        <CollapsibleCard
          title="Carpetas del Repositorio"
          description="Define las carpetas base que se crearán automáticamente en todos los contratos"
          icon={<Folder className="h-5 w-5" />}
          headerActions={
            <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <FolderPlus className="mr-2 h-4 w-4" />
                  Nueva Carpeta
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Agregar Carpeta al Template</DialogTitle>
                  <DialogDescription>
                    Esta carpeta se creará automáticamente en todos los contratos existentes y futuros.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nombre de la Carpeta *</Label>
                    <Input
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      placeholder="Ej: Documentos Legales"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={handleCreateTemplate} disabled={creatingTemplate}>
                    {creatingTemplate && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Crear Carpeta
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        >
          <div className="space-y-2">
            {getRootTemplates().map((template) => (
              <FolderTemplateItem
                key={template.id}
                template={template}
                level={0}
                getSubfolders={getSubfolders}
                onAddSubfolder={(id) => {
                  setSelectedParentTemplate(id);
                  setSubfolderDialogOpen(true);
                }}
                onDelete={handleDeleteTemplate}
              />
            ))}
            {getRootTemplates().length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No hay carpetas definidas
              </p>
            )}
          </div>
        </CollapsibleCard>

        {/* Storage Provider Settings */}
        <StorageProviderSettings defaultCollapsed />

        {/* Comité GP Statuses */}
        <CollapsibleCard
          title="Estados Comité GP"
          description="Administra las opciones de estado para la columna Comité GP en contratos en negociación"
          defaultOpen={false}
        >
          <ComiteGPStatusManager />
        </CollapsibleCard>

        {/* Sub Estados de Mantenciones */}
        <CollapsibleCard
          title="Sub Estados de Mantenciones"
          description="Define los sub-estados del flujo de trabajo de mantenciones y su orden de avance"
          defaultOpen={false}
        >
          <MaintenanceSubStatusManager />
        </CollapsibleCard>

        {/* Criticidad de Mantenciones */}
        <CollapsibleCard
          title="Criticidad de Mantenciones"
          description="Define las categorías de criticidad para los formularios de mantención"
          defaultOpen={false}
          icon={<Shield className="h-5 w-5 text-orange-500" />}
        >
          <MaintenanceCriticalityManager />
        </CollapsibleCard>

        {/* Storage Monitor - Admin only */}
        <StorageMonitor defaultCollapsed />

        {/* Edit Permissions Dialog */}
        <Dialog open={!!editingUserId} onOpenChange={(open) => !open && setEditingUserId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar Permisos</DialogTitle>
              <DialogDescription>
                Configura los permisos para este usuario
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {RESOURCES.map(resource => (
                <div key={resource.id} className="flex items-center justify-between">
                  <span>{resource.label}</span>
                  <Select
                    value={editPermissions[resource.id] || "none"}
                    onValueChange={(v) => setEditPermissions(prev => ({ ...prev, [resource.id]: v as any }))}
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
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingUserId(null)}>Cancelar</Button>
              <Button onClick={() => editingUserId && handleUpdatePermissions(editingUserId)}>
                Guardar Permisos
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Subfolder Dialog */}
        <Dialog open={subfolderDialogOpen} onOpenChange={setSubfolderDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agregar Subcarpeta</DialogTitle>
              <DialogDescription>
                Esta subcarpeta se creará automáticamente dentro de la carpeta "{folderTemplates.find(t => t.id === selectedParentTemplate)?.name}" en todos los contratos.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nombre de la Subcarpeta *</Label>
                <Input
                  value={newSubfolderName}
                  onChange={(e) => setNewSubfolderName(e.target.value)}
                  placeholder="Ej: Anexos"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setSubfolderDialogOpen(false);
                setNewSubfolderName("");
                setSelectedParentTemplate(null);
              }}>Cancelar</Button>
              <Button onClick={handleCreateSubfolder} disabled={creatingTemplate}>
                {creatingTemplate && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear Subcarpeta
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Editar Usuario</DialogTitle>
              <DialogDescription>
                Modifica los datos del usuario. Deja la contraseña vacía para no cambiarla.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4 overflow-y-auto flex-1 pr-2">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nombre Completo</Label>
                <Input
                  id="edit-name"
                  value={editUserName}
                  onChange={(e) => setEditUserName(e.target.value)}
                  placeholder="Juan Pérez"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editUserEmail}
                  onChange={(e) => setEditUserEmail(e.target.value)}
                  placeholder="usuario@email.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-password">Nueva Contraseña (opcional)</Label>
                <div className="relative">
                  <Input
                    id="edit-password"
                    type={showPassword ? "text" : "password"}
                    value={editUserPassword}
                    onChange={(e) => setEditUserPassword(e.target.value)}
                    placeholder="Dejar vacío para no cambiar"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              {editingUserProfile?.id !== user?.id && (
                <div className="space-y-2">
                  <Label>Rol</Label>
                  <Select value={editUserRole} onValueChange={(v) => setEditUserRole(v as "admin" | "user")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Usuario</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {editUserRole === "user" && editingUserProfile && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Permisos por Sección</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Convert current permissions to ElementPermission format
                        const existingPerms: Record<string, { elementId: string; label: string; permission: "none" | "view" | "edit" }> = {};
                        Object.entries(editUserPermissions).forEach(([key, value]) => {
                          if (value !== "none") {
                            existingPerms[key] = {
                              elementId: key,
                              label: ALL_RESOURCES.find(r => r.id === key)?.label || key,
                              permission: value,
                            };
                          }
                        });
                        startSelection({
                          email: editUserEmail,
                          password: editUserPassword,
                          name: editUserName,
                          role: editUserRole,
                          userId: editingUserProfile.id,
                        }, existingPerms);
                        setEditUserDialogOpen(false);
                        navigate("/");
                      }}
                      className="gap-1"
                    >
                      <Navigation className="h-3 w-3" />
                      Navegar y Seleccionar
                    </Button>
                  </div>
                  
                  {/* Secciones Principales */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Secciones Principales</p>
                    {MAIN_RESOURCES.map(resource => (
                      <div key={resource.id} className="flex items-center justify-between">
                        <span className="text-sm">{resource.label}</span>
                        <Select
                          value={editUserPermissions[resource.id] || "none"}
                          onValueChange={(v) => setEditUserPermissions(prev => ({ ...prev, [resource.id]: v as any }))}
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

                  {/* Dashboard Cards */}
                  <div className="space-y-2 pt-2 border-t">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Cards del Dashboard</p>
                    {DASHBOARD_SECTIONS.map(resource => (
                      <div key={resource.id} className="flex items-center justify-between">
                        <span className="text-sm">{resource.label}</span>
                        <Select
                          value={editUserPermissions[resource.id] || "none"}
                          onValueChange={(v) => setEditUserPermissions(prev => ({ ...prev, [resource.id]: v as any }))}
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

                  {/* Contract Sections */}
                  <div className="space-y-2 pt-2 border-t">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Secciones de Contrato</p>
                    {CONTRACT_SECTIONS.map(resource => (
                      <div key={resource.id} className="flex items-center justify-between">
                        <span className="text-sm">{resource.label}</span>
                        <Select
                          value={editUserPermissions[resource.id] || "none"}
                          onValueChange={(v) => setEditUserPermissions(prev => ({ ...prev, [resource.id]: v as any }))}
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
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditUserDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleUpdateUser} disabled={updatingUser}>
                {updatingUser && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar Cambios
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default AdminPanel;
