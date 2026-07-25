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
  isGerente: boolean;
  isEquipoGerencia: boolean;
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
  const [isGerente, setIsGerente] = useState(false);
  const [isEquipoGerencia, setIsEquipoGerencia] = useState(false);
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
      setIsGerente(roleRes.data?.role === "gerente");
      setIsEquipoGerencia(roleRes.data?.role === "equipo_gerencia");
      setPermissions(permRes.data || []);
    } catch (error) {
      console.error("Error loading user data:", error);
    } finally {
      loadingUserDataRef.current = false;
      setRoleLoaded(true);
      setLoading(false);
    }
  }, []);

  // Lightweight refresh: only re-fetches user_permissions without touching
  // role or loading state. Called by the realtime subscription when an admin
  // propagates a role change so logged-in users pick up new permissions
  // immediately without having to log out and back in.
  const refreshPermissions = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("user_permissions")
      .select("resource, permission")
      .eq("user_id", userId);
    setPermissions(data || []);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Track which userId we've loaded data for, so we don't re-fetch on
    // TOKEN_REFRESHED or other non-identity-change events.
    const loadedForUserId = { current: null as string | null };

    const maybeFetch = (userId: string) => {
      if (cancelled) return;
      if (loadedForUserId.current === userId) return; // already loaded
      if (loadingUserDataRef.current) return;         // fetch in-flight
      loadedForUserId.current = userId;
      loadUserData(userId);
    };

    // 1. Subscribe to auth events first (handles INITIAL_SESSION too in Supabase v2)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (cancelled) return;
        applySession(session);

        if (session?.user) {
          // Only (re)load role data when the identity changes or on first sign-in.
          // TOKEN_REFRESHED fires frequently and must NOT reset permissions.
          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'USER_UPDATED') {
            maybeFetch(session.user.id);
          }
        } else {
          // User signed out — clear derived state
          loadedForUserId.current = null;
          setIsAdmin(false);
          setIsOperador(false);
          setIsGerente(false);
          setIsEquipoGerencia(false);
          setPermissions([]);
          setRoleLoaded(true);
          setLoading(false);
        }
      }
    );

    // 2. Fallback: if INITIAL_SESSION hasn't fired yet (older Supabase versions),
    //    getSession() guarantees we always bootstrap auth state.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      applySession(session);
      if (session?.user) {
        maybeFetch(session.user.id);
      } else if (!loadedForUserId.current) {
        // No user and nothing loaded → mark as ready
        setRoleLoaded(true);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [applySession, loadUserData]);

  // Realtime subscription: picks up permission changes pushed by an admin
  // (e.g. role propagation) so the current session reflects them immediately.
  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;

    const channel = supabase
      .channel(`user_permissions_${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_permissions", filter: `user_id=eq.${userId}` },
        () => { refreshPermissions(userId); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, refreshPermissions]);

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
    isGerente,
    isEquipoGerencia,
    roleLoaded,
    permissions,
    hasPermission,
    signOut,
  }), [user, session, loading, isAdmin, isOperador, isGerente, isEquipoGerencia, roleLoaded, permissions]);
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
