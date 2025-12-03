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
import { ArrowLeft, Plus, Trash2, Shield, Loader2 } from "lucide-react";

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
  const { user, isAdmin, loading: authLoading } = useAuth();
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

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate("/");
      return;
    }
    if (isAdmin) {
      loadData();
    }
  }, [authLoading, isAdmin, navigate]);

  const loadData = async () => {
    setLoading(true);
    
    const [profilesRes, rolesRes, permissionsRes] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("*"),
      supabase.from("user_permissions").select("*"),
    ]);

    setProfiles(profilesRes.data || []);
    setUserRoles(rolesRes.data || []);
    setUserPermissions(permissionsRes.data || []);
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

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
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
                        {getUserRole(profile.id) !== "admin" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditPermissions(profile.id)}
                          >
                            <Shield className="h-4 w-4" />
                          </Button>
                        )}
                        {profile.id !== user?.id && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteUser(profile.id)}
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
      </div>
    </div>
  );
};

export default AdminPanel;
