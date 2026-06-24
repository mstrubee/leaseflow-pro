import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface UserPermission {
  resource: string;
  permission: "view" | "edit" | "all";
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isOperador: boolean;
  roleLoaded: boolean;
  permissions: UserPermission[];
  hasPermission: (resource: string, requiredPermission: "view" | "edit" | "all") => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function useProvideAuth(): AuthContextValue {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOperador, setIsOperador] = useState(false);
  const [permissions, setPermissions] = useState<UserPermission[]>([]);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const loadingUserDataRef = useRef(false);
  // Track current user ID to avoid re-triggering effects when only the object reference changes
  const currentUserIdRef = useRef<string | null>(null);

  const applySession = useCallback((newSession: typeof session) => {
    setSession(newSession);
    const newUserId = newSession?.user?.id ?? null;
    if (newUserId !== currentUserIdRef.current) {
      currentUserIdRef.current = newUserId;
      setUser(newSession?.user ?? null);
    }
  }, []);

  const loadUserData = useCallback(async (userId: string) => {
    if (loadingUserDataRef.current) return;
    loadingUserDataRef.current = true;
    try {
      const [roleRes, permRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
        supabase.from("user_permissions").select("resource, permission").eq("user_id", userId)
      ]);

      setIsAdmin(roleRes.data?.role === "admin");
      setIsOperador(roleRes.data?.role === "operador_terreno");
      setPermissions(permRes.data || []);
    } catch (error) {
      console.error("Error loading user data:", error);
    } finally {
      loadingUserDataRef.current = false;
      setRoleLoaded(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        applySession(session);

        if (session?.user) {
          setTimeout(() => {
            loadUserData(session.user.id);
          }, 0);
        } else {
          setIsAdmin(false);
          setIsOperador(false);
          setPermissions([]);
          setRoleLoaded(true);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      applySession(session);
      if (session?.user) {
        loadUserData(session.user.id);
      } else {
        setRoleLoaded(true);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [applySession, loadUserData]);

  const hasPermission = (resource: string, requiredPermission: "view" | "edit" | "all"): boolean => {
    if (isAdmin) return true;
    
    const userPermission = permissions.find(p => p.resource === resource);
    if (!userPermission) return false;
    
    // User has 'all' permission - grants full access
    if (userPermission.permission === "all") return true;
    
    // Check view permission - requires at least view or edit
    if (requiredPermission === "view" && 
        (userPermission.permission === "view" || userPermission.permission === "edit")) {
      return true;
    }
    
    // Check edit permission - requires edit permission
    if (requiredPermission === "edit" && userPermission.permission === "edit") return true;
    
    return false;
  };

  const signOut = async () => {
    // Global scope invalidates the session on every device for this user
    await supabase.auth.signOut({ scope: "global" });
  };

  return useMemo(() => ({
    user,
    session,
    loading,
    isAdmin,
    isOperador,
    roleLoaded,
    permissions,
    hasPermission,
    signOut,
  }), [user, session, loading, isAdmin, isOperador, roleLoaded, permissions]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useProvideAuth();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
};
