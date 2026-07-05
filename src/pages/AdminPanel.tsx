import { useState, useEffect } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Shield, Loader2, FolderPlus, Folder, ChevronRight, Cloud, Pencil, Eye, Upload, Copy, Settings2, FileText, Building2, ListChecks, Columns3, Wrench, AlertTriangle, MoveRight, ExternalLink, ShieldCheck, UserCog } from "lucide-react";
import { RoleManager } from "@/components/admin/RoleManager";
import { UserFormDialog, UserFormData } from "@/components/admin/UserFormDialog";
import { PermissionTreeEditor, PermissionsMap, getAllResources } from "@/components/admin/PermissionTreeEditor";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UnifiedCloudStorage } from "@/components/admin/UnifiedCloudStorage";
import { BudgetTemplateManager } from "@/components/budget/BudgetTemplateManager";
import { GanttTemplateManager } from "@/components/gantt/GanttTemplateManager";
import { CompanyManager } from "@/components/admin/CompanyManager";
import { StorageMonitor } from "@/components/admin/StorageMonitor";
import { OCRequestTemplateManager } from "@/components/admin/OCRequestTemplateManager";
import { LogoManager } from "@/components/admin/LogoManager";
import { BusinessCaseAdminConfig } from "@/components/admin/BusinessCaseAdminConfig";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { ComiteGPStatusManager } from "@/components/admin/ComiteGPStatusManager";
import { BudgetProgressStatusManager } from "@/components/admin/BudgetProgressStatusManager";
import { OrgChartManager } from "@/components/admin/OrgChartManager";
import { ServiceContractApproversManager } from "@/components/admin/ServiceContractApproversManager";
import { MaintenanceCriticalityManager } from "@/components/admin/MaintenanceCriticalityManager";
import { MaintenanceSubStatusManager } from "@/components/admin/MaintenanceSubStatusManager";
import { GeneralFoldersManager } from "@/components/admin/GeneralFoldersManager";
import { SecuritySessionsPanel } from "@/components/admin/SecuritySessionsPanel";
import { DataExportDialog } from "@/components/admin/DataExportDialog";
interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  cargo: string | null;
  created_at: string;
  last_seen_at: string | null;
  activity_status: string | null;
  current_section: string | null;
}

interface UserRole {
  user_id: string;
  role: "admin" | "user" | "operador_terreno";
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
  onRename,
  onMove,
}: {
  template: FolderTemplate;
  level: number;
  getSubfolders: (parentId: string) => FolderTemplate[];
  onAddSubfolder: (parentId: string) => void;
  onDelete: (id: string, name: string) => void;
  onRename: (id: string, newName: string) => void;
  onMove: (id: string, name: string) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(template.name);
  const subfolders = getSubfolders(template.id);
  const isRoot = level === 0;
  const paddingLeft = level * 16;

  const handleSave = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== template.name) {
      onRename(template.id, trimmed);
    } else {
      setEditName(template.name);
    }
    setIsEditing(false);
  };
  
  return (
    <div className="space-y-1">
      <div 
        className={`flex items-center justify-between p-2 ${isRoot ? 'p-3 bg-muted/50' : 'bg-muted/30'} rounded-lg`}
        style={{ marginLeft: `${paddingLeft}px` }}
      >
        <div className="flex items-center gap-2">
          {!isRoot && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          <Folder className={`${isRoot ? 'h-4 w-4' : 'h-3 w-3'} text-muted-foreground`} />
          {isEditing ? (
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSave}
              onKeyDown={(e) => { if (e.key === "Escape") { setEditName(template.name); setIsEditing(false); } }}
              className="h-7 text-sm w-40"
              autoFocus
            />
          ) : (
            <span
              className={`${isRoot ? 'font-medium' : 'text-sm'} cursor-pointer hover:underline`}
              onDoubleClick={() => setIsEditing(true)}
            >
              {template.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
            title="Renombrar"
          >
            <Pencil className={`${isRoot ? 'h-4 w-4' : 'h-3 w-3'} text-muted-foreground`} />
          </Button>
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
            onClick={() => onMove(template.id, template.name)}
            title="Mover a otra carpeta"
          >
            <MoveRight className={`${isRoot ? 'h-4 w-4' : 'h-3 w-3'} text-muted-foreground`} />
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
      {subfolders.map((subfolder) => (
        <FolderTemplateItem
          key={subfolder.id}
          template={subfolder}
          level={level + 1}
          getSubfolders={getSubfolders}
          onAddSubfolder={onAddSubfolder}
          onDelete={onDelete}
          onRename={onRename}
          onMove={onMove}
        />
      ))}
    </div>
  );
};

// Recursos principales
const MAIN_RESOURCES = [
  { id: "contracts", label: "Contratos", category: "principal" },
  { id: "dashboard", label: "Dashboard", category: "principal" },
  { id: "repository", label: "Repositorio", category: "principal" },
  { id: "suppliers", label: "Proveedores", category: "principal" },
  { id: "maintenance", label: "Mantenciones", category: "principal" },
  { id: "purchase_orders", label: "Órdenes de Compra", category: "principal" },
  { id: "capex", label: "CAPEX", category: "principal" },
  { id: "opex", label: "OPEX", category: "principal" },
  { id: "alerts", label: "Alertas", category: "principal" },
  { id: "reports", label: "Informes", category: "principal" },
  { id: "kpi", label: "KPI", category: "principal" },
  { id: "patents", label: "Patentes", category: "principal" },
  { id: "special_attention", label: "Atención Especial", category: "principal" },
  { id: "geoloc", label: "GEOLOC", category: "principal" },
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
  const { user, isAdmin, loading: authLoading, roleLoaded } = useAuth();
  const { toast } = useToast();
  
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [allSuppliers, setAllSuppliers] = useState<{ id: string; name: string }[]>([]);

  // UserFormDialog state (create + edit unified)
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [userFormInitialData, setUserFormInitialData] = useState<Partial<UserFormData> | undefined>(undefined);

  // Role manager refresh key — increments after each user save to force reload
  const [roleManagerKey, setRoleManagerKey] = useState(0);

  // "Ver credenciales" modal
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [credentialsUser, setCredentialsUser] = useState<{ name: string; perms: PermissionsMap } | null>(null);

  // Folder templates
  const [folderTemplates, setFolderTemplates] = useState<FolderTemplate[]>([]);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateType, setNewTemplateType] = useState("");
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [selectedParentTemplate, setSelectedParentTemplate] = useState<string | null>(null);
  const [subfolderDialogOpen, setSubfolderDialogOpen] = useState(false);
  const [newSubfolderName, setNewSubfolderName] = useState("");

  // Activity thresholds
  interface ActivityThreshold { user_id: string; idle_minutes: number; inactive_minutes: number; }
  const [activityThresholds, setActivityThresholds] = useState<ActivityThreshold[]>([]);
  const [editingThresholdUserId, setEditingThresholdUserId] = useState<string | null>(null);
  const [thresholdIdle, setThresholdIdle] = useState(5);
  const [thresholdInactive, setThresholdInactive] = useState(15);

  useEffect(() => {
    if (!authLoading && roleLoaded && !isAdmin) {
      navigate("/");
      return;
    }
    if (roleLoaded && isAdmin) {
      loadData();

      // Realtime subscription for profiles updates
      const channel = supabase
        .channel("profiles-presence")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "profiles" },
          (payload) => {
            setProfiles((prev) =>
              prev.map((p) =>
                p.id === payload.new.id ? { ...p, ...payload.new } : p
              )
            );
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [authLoading, isAdmin, roleLoaded, navigate]);

  function initAllNone(): PermissionsMap {
    const m: PermissionsMap = {};
    getAllResources().forEach(r => { m[r] = "none"; });
    return m;
  }

  function openCreateUser() {
    setUserFormInitialData(undefined);
    setUserFormOpen(true);
  }

  function openEditUser(profile: Profile) {
    const parts = (profile.full_name || "").split(" ");
    const firstName = parts[0] ?? "";
    const lastName = parts.slice(1).join(" ");
    const userPerms: PermissionsMap = initAllNone();
    getUserPermissions(profile.id).forEach(p => {
      userPerms[p.resource] = p.permission === "all" ? "edit" : p.permission;
    });

    setUserFormInitialData({
      userId: profile.id,
      firstName,
      lastName,
      email: profile.email,
      role: getUserRole(profile.id) as any,
      isActive: (profile as any).is_active ?? true,
      profileTemplateId: (profile as any).profile_template_id ?? null,
      permissions: userPerms,
      supplierIds: [],
    });

    // Async: load supplier IDs
    supabase.from("operator_suppliers").select("supplier_id").eq("user_id", profile.id)
      .then(({ data }) => {
        if (data) {
          setUserFormInitialData(prev => prev ? { ...prev, supplierIds: data.map((r: any) => r.supplier_id) } : prev);
        }
      });

    setUserFormOpen(true);
  }

  async function openCredentials(profile: Profile) {
    const userPerms: PermissionsMap = initAllNone();
    getUserPermissions(profile.id).forEach(p => {
      userPerms[p.resource] = p.permission === "all" ? "edit" : p.permission;
    });
    setCredentialsUser({ name: profile.full_name || profile.email, perms: userPerms });
    setCredentialsOpen(true);
  }

  const [roleTemplates, setRoleTemplates] = useState<{ id: string; name: string }[]>([]);

  const loadData = async () => {
    setLoading(true);

    const [profilesRes, rolesRes, permissionsRes, templatesRes, thresholdsRes, suppliersRes, roleTemplatesRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("*"),
      supabase.from("user_permissions").select("*"),
      supabase.from("folder_templates").select("*").order("display_order", { ascending: true }),
      supabase.from("user_activity_thresholds").select("*" as any),
      supabase.from("suppliers").select("id,name").order("name"),
      supabase.from("user_profile_templates" as any).select("id, name").order("name"),
    ]);

    setProfiles(profilesRes.data || []);
    setUserRoles(rolesRes.data || []);
    setUserPermissions(permissionsRes.data || []);
    setFolderTemplates(templatesRes.data || []);
    setActivityThresholds((thresholdsRes.data as any) || []);
    setAllSuppliers(suppliersRes.data || []);
    setRoleTemplates((roleTemplatesRes.data as any) || []);
    setLoading(false);
  };

  const getUserRole = (userId: string) => {
    return userRoles.find(r => r.user_id === userId)?.role || "user";
  };

  const getThresholds = (userId: string) => {
    const t = activityThresholds.find(th => th.user_id === userId);
    return { idle: t?.idle_minutes ?? 5, inactive: t?.inactive_minutes ?? 15 };
  };

  const getActivityStatus = (profile: Profile) => {
    const { idle, inactive } = getThresholds(profile.id);
    const now = Date.now();
    const lastSeen = profile.last_seen_at ? new Date(profile.last_seen_at).getTime() : 0;
    const diffMin = (now - lastSeen) / 60000;

    if (!profile.last_seen_at || diffMin >= inactive) {
      return {
        color: "bg-gray-400",
        pulse: false,
        label: "Desconectado",
        detail: profile.last_seen_at
          ? `Visto: ${format(new Date(profile.last_seen_at), "dd/MM/yyyy HH:mm")}`
          : "Sin actividad registrada",
        textColor: "text-muted-foreground",
      };
    }
    if (diffMin >= idle || profile.activity_status === "idle") {
      return {
        color: "bg-amber-400",
        pulse: false,
        label: "Detenido",
        detail: `Hace ${Math.round(diffMin)} min`,
        textColor: "text-amber-600 dark:text-amber-400",
      };
    }
    return {
      color: "bg-green-500",
      pulse: true,
      label: "Activo",
      detail: `Trabajando en ${profile.current_section || "Inicio"}`,
      textColor: "text-green-600 dark:text-green-400",
    };
  };

  const handleSaveThreshold = async (userId: string) => {
    await supabase.from("user_activity_thresholds" as any).upsert({
      user_id: userId,
      idle_minutes: thresholdIdle,
      inactive_minutes: thresholdInactive,
    } as any);
    setEditingThresholdUserId(null);
    // Update local state
    setActivityThresholds(prev => {
      const filtered = prev.filter(t => t.user_id !== userId);
      return [...filtered, { user_id: userId, idle_minutes: thresholdIdle, inactive_minutes: thresholdInactive }];
    });
  };

  const getUserPermissions = (userId: string) => {
    return userPermissions.filter(p => p.user_id === userId);
  };

  const handleDeleteUser = async (userId: string) => {
    if (userId === user?.id) {
      toast({ variant: "destructive", title: "Error", description: "No puedes eliminar tu propia cuenta" });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { userId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      toast({ title: "Usuario eliminado completamente" });
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
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

  const handleRenameTemplate = async (templateId: string, newName: string) => {
    try {
      const { error } = await supabase
        .from("folder_templates")
        .update({ name: newName })
        .eq("id", templateId);

      if (error) throw error;

      toast({ title: "Carpeta renombrada", description: "El cambio se aplicó en todos los contratos." });
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  const getSubfolders = (parentId: string): FolderTemplate[] => {
    return folderTemplates.filter(t => t.parent_id === parentId);
  };

  const getRootTemplates = (): FolderTemplate[] => {
    return folderTemplates.filter(t => t.parent_id === null);
  };

  const handleDeleteTemplate = async (templateId: string, templateName: string) => {
    if (!confirm(`¿Eliminar la carpeta "${templateName}"? Se eliminará de TODOS los contratos. Los archivos contenidos se moverán a la carpeta "Eliminados" de cada contrato.`)) return;

    try {
      // First delete child templates (cascade)
      const childIds = getDescendantIds(templateId);
      if (childIds.length > 0) {
        for (const childId of childIds) {
          await supabase.from("folder_templates").delete().eq("id", childId);
        }
      }

      const { error } = await supabase
        .from("folder_templates")
        .delete()
        .eq("id", templateId);

      if (error) throw error;

      toast({ title: "Carpeta eliminada", description: "Se eliminó de todos los contratos. Los archivos se movieron a 'Eliminados'." });
      loadData();
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  };

  // Move folder state
  const [moveFolderId, setMoveFolderId] = useState<string | null>(null);
  const [moveFolderName, setMoveFolderName] = useState("");
  const [moveTargetId, setMoveTargetId] = useState<string | null>(null);
  const [showMoveDialog, setShowMoveDialog] = useState(false);

  const handleMoveTemplate = (id: string, name: string) => {
    setMoveFolderId(id);
    setMoveFolderName(name);
    setMoveTargetId(null);
    setShowMoveDialog(true);
  };

  // Get all folders that are valid move targets (exclude the folder itself and its descendants)
  const getDescendantIds = (parentId: string): string[] => {
    const children = folderTemplates.filter(t => t.parent_id === parentId);
    const ids: string[] = [];
    for (const child of children) {
      ids.push(child.id);
      ids.push(...getDescendantIds(child.id));
    }
    return ids;
  };

  const getMoveTargets = (): (FolderTemplate & { depth: number })[] => {
    if (!moveFolderId) return [];
    const excludeIds = new Set([moveFolderId, ...getDescendantIds(moveFolderId)]);
    
    const buildList = (parentId: string | null, depth: number): (FolderTemplate & { depth: number })[] => {
      const items = folderTemplates.filter(t => t.parent_id === parentId && !excludeIds.has(t.id));
      const result: (FolderTemplate & { depth: number })[] = [];
      for (const item of items) {
        result.push({ ...item, depth });
        result.push(...buildList(item.id, depth + 1));
      }
      return result;
    };
    
    return buildList(null, 0);
  };

  const confirmMove = async () => {
    if (!moveFolderId) return;
    try {
      const { error } = await supabase
        .from("folder_templates")
        .update({ parent_id: moveTargetId })
        .eq("id", moveFolderId);

      if (error) throw error;
      toast({ title: "Carpeta movida", description: "El cambio se aplicó en todos los contratos." });
      setShowMoveDialog(false);
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
            <DataExportDialog />
          </div>
        </div>

        {/* ── Roles ── */}
        <CollapsibleCard
          title="Roles"
          description="Define conjuntos de permisos reutilizables para asignar a usuarios"
          icon={<ShieldCheck className="h-5 w-5 text-violet-600" />}
        >
          <RoleManager
            refreshKey={roleManagerKey}
            onSaved={() => { loadData(); setRoleManagerKey(k => k + 1); }}
          />
        </CollapsibleCard>

        {/* ── Usuarios ── */}
        <CollapsibleCard
          title="Usuarios"
          description="Lista de todos los usuarios registrados"
          icon={<Shield className="h-5 w-5 text-indigo-600" />}
          headerActions={
            <Button size="sm" onClick={openCreateUser}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Usuario
            </Button>
          }
        >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Actividad</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell>
                      <div className="font-medium">{profile.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{profile.email}</div>
                      {(profile as any).cargo && <div className="text-xs text-muted-foreground">{(profile as any).cargo}</div>}
                    </TableCell>
                    <TableCell>
                      {(profile as any).is_active === false ? (
                        <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-500 border border-gray-200">Inactivo</span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs bg-green-50 text-green-700 border border-green-200">Activo</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const status = getActivityStatus(profile);
                        const { idle, inactive } = getThresholds(profile.id);
                        return (
                          <div className="flex items-start gap-1">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${status.color} ${status.pulse ? "animate-pulse" : ""}`} />
                                <span className={`text-xs font-medium ${status.textColor}`}>{status.label}</span>
                              </div>
                              <span className="text-[10px] text-muted-foreground ml-4">{status.detail}</span>
                            </div>
                            <Popover open={editingThresholdUserId === profile.id} onOpenChange={(open) => {
                              if (open) { setEditingThresholdUserId(profile.id); setThresholdIdle(idle); setThresholdInactive(inactive); }
                              else setEditingThresholdUserId(null);
                            }}>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0 mt-0.5">
                                  <Settings2 className="h-3 w-3 text-muted-foreground" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-56 p-3" side="right">
                                <div className="space-y-3">
                                  <p className="text-xs font-semibold">Umbrales de actividad</p>
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Detenido (amarillo) — min</Label>
                                    <Input type="number" min={1} value={thresholdIdle} onChange={e => setThresholdIdle(Number(e.target.value))} className="h-7 text-xs" />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[11px]">Desconectado (gris) — min</Label>
                                    <Input type="number" min={1} value={thresholdInactive} onChange={e => setThresholdInactive(Number(e.target.value))} className="h-7 text-xs" />
                                  </div>
                                  <Button size="sm" className="w-full h-7 text-xs" onClick={() => handleSaveThreshold(profile.id)}>Guardar</Button>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const templateId = (profile as any).profile_template_id;
                        const templateName = templateId
                          ? roleTemplates.find(t => t.id === templateId)?.name
                          : null;
                        return templateName
                          ? <span className="px-2 py-1 rounded text-xs bg-violet-100 text-violet-700">{templateName}</span>
                          : <span className="text-xs text-muted-foreground">—</span>;
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => openCredentials(profile)} title="Ver credenciales">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openEditUser(profile)} title="Editar usuario">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {profile.id !== user?.id && (
                          <Button variant="destructive" size="sm" onClick={() => handleDeleteUser(profile.id)} title="Eliminar usuario">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* UserFormDialog (create + edit) */}
            <UserFormDialog
              open={userFormOpen}
              onOpenChange={setUserFormOpen}
              initialData={userFormInitialData}
              onSaved={() => { loadData(); setRoleManagerKey(k => k + 1); }}
              suppliers={allSuppliers}
            />

            {/* "Ver Credenciales" modal */}
            <Dialog open={credentialsOpen} onOpenChange={setCredentialsOpen}>
              <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
                <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
                  <DialogTitle className="flex items-center gap-2">
                    <UserCog className="h-5 w-5 text-primary" />
                    Credenciales de {credentialsUser?.name}
                  </DialogTitle>
                  <DialogDescription>Vista de solo lectura de los permisos asignados a este usuario.</DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto px-6 py-4">
                  {credentialsUser && (
                    <PermissionTreeEditor permissions={credentialsUser.perms} readOnly />
                  )}
                </div>
                <div className="px-6 py-4 border-t shrink-0 flex justify-end">
                  <Button variant="outline" onClick={() => setCredentialsOpen(false)}>Cerrar</Button>
                </div>
              </DialogContent>
            </Dialog>

        </CollapsibleCard>

        {/* ── Grupo: Empresas ── */}
        <CollapsibleCard
          title="Empresas"
          description="Administración de empresas, organigrama y logos"
          icon={<Building2 className="h-5 w-5 text-blue-600" />}
        >
          <div className="space-y-4">
            <CompanyManager defaultCollapsed />
            <OrgChartManager defaultCollapsed />
            <ServiceContractApproversManager />
            <CollapsibleCard
              title="Logos de la Aplicación"
              description="Administra los logos que se muestran en la aplicación"
              icon={<FileText className="h-5 w-5 text-purple-500" />}
            >
              <LogoManager />
            </CollapsibleCard>
          </div>
        </CollapsibleCard>

        {/* ── Grupo: Plantillas Tipo ── */}
        <CollapsibleCard
          title="Plantillas Tipo"
          description="Formatos de presupuesto, líneas de tiempo y solicitudes de OC"
          icon={<Columns3 className="h-5 w-5 text-emerald-600" />}
        >
          <div className="space-y-4">
            <BudgetTemplateManager defaultCollapsed />
            <GanttTemplateManager defaultCollapsed />
            <OCRequestTemplateManager defaultCollapsed />
          </div>
        </CollapsibleCard>

        {/* ── Grupo: Business Case ── */}
        <CollapsibleCard
          title="Business Case"
          description="Configuración global del Business Case Financiero (tipos, categorías, líneas de inversión, aprobadores)"
          icon={<Columns3 className="h-5 w-5 text-blue-600" />}
        >
          <BusinessCaseAdminConfig />
        </CollapsibleCard>

        {/* ── Grupo: Estados y Categorías ── */}
        <CollapsibleCard
          title="Estados y Categorías"
          description="Estados de Comité GP, subestados y criticidad de mantenciones"
          icon={<ListChecks className="h-5 w-5 text-amber-600" />}
        >
          <div className="space-y-4">
            <CollapsibleCard
              title="Estados Comité GP"
              description="Administra las opciones de estado para la columna Comité GP en contratos en negociación"
              icon={<Columns3 className="h-5 w-5 text-sky-500" />}
              defaultOpen={false}
            >
              <ComiteGPStatusManager />
            </CollapsibleCard>

            <CollapsibleCard
              title="Sub Estados de Mantenciones"
              description="Define los sub-estados del flujo de trabajo de mantenciones y su orden de avance"
              icon={<Wrench className="h-5 w-5 text-slate-500" />}
              defaultOpen={false}
            >
              <MaintenanceSubStatusManager />
            </CollapsibleCard>

            <CollapsibleCard
              title="Criticidad de Mantenciones"
              description="Define las categorías de criticidad para los formularios de mantención"
              icon={<AlertTriangle className="h-5 w-5 text-orange-500" />}
              defaultOpen={false}
            >
              <MaintenanceCriticalityManager />
            </CollapsibleCard>

            <CollapsibleCard
              title="Estados de Avance de Presupuesto"
              description="Estados para las líneas de presupuesto (seleccionables o asignados automáticamente)"
              icon={<ListChecks className="h-5 w-5 text-emerald-500" />}
              defaultOpen={false}
            >
              <BudgetProgressStatusManager />
            </CollapsibleCard>
          </div>
        </CollapsibleCard>

        {/* Unified Cloud Storage */}
        <UnifiedCloudStorage defaultCollapsed />

        {/* Folder Templates */}
        <CollapsibleCard
          title="Carpetas del Repositorio"
          description="Gestiona las carpetas generales y las carpetas comunes de contratos"
          icon={<Folder className="h-5 w-5 text-yellow-600" />}
        >
          <div className="space-y-6">
            {/* Carpetas Generales */}
            <div className="space-y-3">
              <div className="border-b pb-2">
                <h3 className="text-base font-semibold">Carpetas Generales</h3>
                <p className="text-sm text-muted-foreground">
                  Carpetas independientes de contratos. Se sincronizan en Drive bajo la carpeta "Carpeta General".
                </p>
              </div>
              <GeneralFoldersManager />
            </div>

            {/* Carpetas Comunes de Contratos */}
            <div className="space-y-3">
              <div className="border-b pb-2 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">Carpetas Comunes de Repositorios de Contratos</h3>
                  <p className="text-sm text-muted-foreground">
                    Se crean automáticamente en cada contrato existente y futuro, y se sincronizan con Drive.
                  </p>
                </div>
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
              </div>
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
                    onRename={handleRenameTemplate}
                    onMove={handleMoveTemplate}
                  />
                ))}
                {getRootTemplates().length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No hay carpetas definidas
                  </p>
                )}
              </div>
            </div>
          </div>
        </CollapsibleCard>

        {/* Security & Sessions - Admin only */}
        <SecuritySessionsPanel />

        {/* Storage Monitor - Admin only */}
        <StorageMonitor defaultCollapsed />

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

        {/* Move Folder Dialog */}
        <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MoveRight className="h-5 w-5" />
                Mover carpeta: {moveFolderName}
              </DialogTitle>
              <DialogDescription>
                Seleccione la carpeta destino o elija la raíz para convertirla en carpeta principal.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1 max-h-[300px] overflow-y-auto border rounded-md p-2">
              <button
                className={`w-full flex items-center gap-2 p-2 rounded-md text-sm hover:bg-accent/50 transition-colors ${moveTargetId === null ? 'bg-primary/10 text-primary font-medium' : ''}`}
                onClick={() => setMoveTargetId(null)}
              >
                <Folder className="h-4 w-4 text-amber-500" />
                <span>Raíz (nivel principal)</span>
              </button>
              {getMoveTargets().map((target) => (
                <button
                  key={target.id}
                  className={`w-full flex items-center gap-2 p-2 rounded-md text-sm hover:bg-accent/50 transition-colors ${moveTargetId === target.id ? 'bg-primary/10 text-primary font-medium' : ''}`}
                  style={{ paddingLeft: `${target.depth * 16 + 8}px` }}
                  onClick={() => setMoveTargetId(target.id)}
                >
                  <Folder className="h-4 w-4 text-amber-500" />
                  <span>{target.name}</span>
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowMoveDialog(false)}>Cancelar</Button>
              <Button onClick={confirmMove}>
                <MoveRight className="h-4 w-4 mr-1" />
                Mover
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default AdminPanel;
