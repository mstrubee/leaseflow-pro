import { useState, useEffect } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface UserRole {
  role: "admin" | "user";
}

interface UserPermission {
  resource: string;
  permission: "view" | "edit" | "all";
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions, setPermissions] = useState<UserPermission[]>([]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            fetchUserRole(session.user.id);
            fetchUserPermissions(session.user.id);
          }, 0);
        } else {
          setIsAdmin(false);
          setPermissions([]);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRole(session.user.id);
        fetchUserPermissions(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRole = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();
    
    setIsAdmin(data?.role === "admin");
  };

  const fetchUserPermissions = async (userId: string) => {
    const { data } = await supabase
      .from("user_permissions")
      .select("resource, permission")
      .eq("user_id", userId);
    
    setPermissions(data || []);
  };

  const hasPermission = (resource: string, requiredPermission: "view" | "edit" | "all"): boolean => {
    if (isAdmin) return true;
    
    const userPermission = permissions.find(p => p.resource === resource);
    if (!userPermission) return false;
    
    if (userPermission.permission === "all") return true;
    if (requiredPermission === "view") return true;
    if (requiredPermission === "edit" && userPermission.permission === "edit") return true;
    
    return false;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return {
    user,
    session,
    loading,
    isAdmin,
    permissions,
    hasPermission,
    signOut,
  };
};
