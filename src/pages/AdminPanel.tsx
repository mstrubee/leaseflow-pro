import { useState, useEffect } from "react";
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
import { ArrowLeft, Plus, Trash2, Shield, Loader2, FolderPlus, Folder, ChevronRight, Cloud, Pencil } from "lucide-react";
import { CloudStorageSettings } from "@/components/contracts/CloudStorageSettings";
import { BudgetTemplateManager } from "@/components/budget/BudgetTemplateManager";
import { GanttTemplateManager } from "@/components/gantt/GanttTemplateManager";
import { StorageProviderSettings } from "@/components/admin/StorageProviderSettings";
interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

interface UserRole {
  user_id: string;
  role: "admin" | "user";
}

interface UserPermission {
  id: string;
  user_id: string;
  resource: string;
  permission: "view" | "edit" | "all";
}

interface FolderTemplate {
  id: string;
  name: string;
  folder_type: string | null;
  display_order: number;
  parent_id: string | null;
}

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

interface UserRole {
  user_id: string;
  role: "admin" | "user";
}

interface UserPermission {
  id: string;
  user_id: string;
  resource: string;
  permission: "view" | "edit" | "all";
}

const RESOURCES = [
  { id: "contracts", label: "Contratos" },
  { id: "dashboard", label: "Dashboard" },
  { id: "repository", label: "Repositorio" },
];

const AdminPanel = () => {
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading, roleLoaded } = useAuth();
  const { toast } = useToast();
  
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [loading, setLoading] = useState(true);
  
  // New user form
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState<"admin" | "user">("user");
  const [newUserPermissions, setNewUserPermissions] = useState<Record<string, "view" | "edit" | "all" | "none">>({});
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Permission edit
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editPermissions, setEditPermissions] = useState<Record<string, "view" | "edit" | "all" | "none">>({});

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
  const [updatingUser, setUpdatingUser] = useState(false);

  useEffect(() => {
    if (!authLoading && roleLoaded && !isAdmin) {
      navigate("/");
      return;
    }
    if (roleLoaded && isAdmin) {
      loadData();
    }
  }, [authLoading, isAdmin, roleLoaded, navigate]);

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
          permission: permission as "view" | "edit" | "all"
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
    const permsMap: Record<string, "view" | "edit" | "all" | "none"> = {};
    RESOURCES.forEach(r => {
      const perm = userPerms.find(p => p.resource === r.id);
      permsMap[r.id] = perm?.permission || "none";
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
      <div className="max-w-[90rem] mx-auto space-y-6">
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
          
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
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
                    <Label>Permisos por Sección</Label>
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
                            <SelectItem value="all">Todo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
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
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Usuarios</CardTitle>
            <CardDescription>Lista de todos los usuarios registrados</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nombre</TableHead>
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
                          onClick={() => openEditUser(profile)}
                          title="Editar usuario"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {getUserRole(profile.id) !== "admin" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditPermissions(profile.id)}
                            title="Editar permisos"
                          >
                            <Shield className="h-4 w-4" />
                          </Button>
                        )}
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
          </CardContent>
        </Card>

        {/* Cloud Storage Settings */}
        <CloudStorageSettings />

        {/* Budget Templates */}
        <BudgetTemplateManager />

        {/* Gantt Templates */}
        <GanttTemplateManager />

        {/* Folder Templates */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Folder className="h-5 w-5" />
                  Carpetas del Repositorio
                </CardTitle>
                <CardDescription>
                  Define las carpetas base que se crearán automáticamente en todos los contratos
                </CardDescription>
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
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {getRootTemplates().map((template) => (
                <div key={template.id} className="space-y-1">
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Folder className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{template.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedParentTemplate(template.id);
                          setSubfolderDialogOpen(true);
                        }}
                        title="Agregar subcarpeta"
                      >
                        <FolderPlus className="h-4 w-4 text-primary" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteTemplate(template.id, template.name)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  {/* Subfolders */}
                  {getSubfolders(template.id).map((subfolder) => (
                    <div key={subfolder.id} className="flex items-center justify-between p-2 pl-8 bg-muted/30 rounded-lg ml-4">
                      <div className="flex items-center gap-2">
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        <Folder className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{subfolder.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteTemplate(subfolder.id, subfolder.name)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
              {getRootTemplates().length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay carpetas definidas
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Storage Provider Settings */}
        <StorageProviderSettings />

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
                      <SelectItem value="all">Todo</SelectItem>
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
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Editar Usuario</DialogTitle>
              <DialogDescription>
                Modifica los datos del usuario. Deja la contraseña vacía para no cambiarla.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
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
                <Input
                  id="edit-password"
                  type="password"
                  value={editUserPassword}
                  onChange={(e) => setEditUserPassword(e.target.value)}
                  placeholder="Dejar vacío para no cambiar"
                />
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
