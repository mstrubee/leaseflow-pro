import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

type AuthMode = "login" | "forgot" | "reset";
// "none": no hay invitación asociada (reset normal de admin/user/operador_terreno).
// "activatable": invitación pending/reset -> puede fijar contraseña.
// "used": la invitación ya fue consumida -> bloquear.
type InvitationGate = "checking" | "none" | "activatable" | "used";

// Supabase a veces dispara INITIAL_SESSION/SIGNED_IN antes que
// PASSWORD_RECOVERY al aterrizar en un enlace de recovery en una carga en
// frío (condición de carrera conocida de supabase-js) -- si eso pasa, el
// listener de abajo redirigiría a "/" antes de llegar a mostrar el
// formulario de nueva contraseña, dejando al usuario "logueado" sin haber
// fijado contraseña nunca. Se detecta el hash de la URL de forma síncrona,
// en el estado inicial, para blindar contra esa carrera sin importar qué
// evento llegue primero.
const isRecoveryLink = () => window.location.hash.includes("type=recovery");

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<AuthMode>(() => (isRecoveryLink() ? "reset" : "login"));
  const [invitationGate, setInvitationGate] = useState<InvitationGate>("none");
  const recoveryRef = useRef(isRecoveryLink());
  // Evita repetir la consulta a `invitations` si llegan varios eventos
  // (PASSWORD_RECOVERY, INITIAL_SESSION, TOKEN_REFRESHED...) para la misma sesión.
  const invitationCheckedRef = useRef(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        recoveryRef.current = true;
        setMode("reset");
      }

      if (recoveryRef.current && session && !invitationCheckedRef.current) {
        invitationCheckedRef.current = true;
        setInvitationGate("checking");
        supabase
          .from("invitations")
          .select("status")
          .eq("user_id", session.user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data }) => {
            if (!data) setInvitationGate("none");
            else if (data.status === "used") setInvitationGate("used");
            else setInvitationGate("activatable");
          });
      } else if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session && !recoveryRef.current) {
        navigate("/");
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate("/");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Credenciales incorrectas",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      toast({
        title: "Email enviado",
        description: `Revisa tu bandeja de entrada en ${email} y sigue el enlace para crear una nueva contraseña.`,
      });
      setMode("login");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invitationGate === "used") {
      toast({
        variant: "destructive",
        title: "Enlace ya utilizado",
        description: "Este enlace de activación ya fue usado. Pide a tu gerente o administrador que reenvíe la invitación.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ variant: "destructive", title: "Error", description: "Las contraseñas no coinciden." });
      return;
    }
    if (newPassword.length < 6) {
      toast({ variant: "destructive", title: "Error", description: "La contraseña debe tener al menos 6 caracteres." });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      if (invitationGate === "activatable") {
        await supabase.functions.invoke("complete-invitation");
      }
      recoveryRef.current = false;
      toast({ title: "Contraseña actualizada", description: "Tu contraseña fue cambiada exitosamente." });
      navigate("/");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        {mode === "login" && (
          <>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-semibold">Iniciar Sesión</CardTitle>
              <CardDescription>Ingresa tus credenciales para acceder al sistema</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Iniciar Sesión
                </Button>
              </form>
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setMode("forgot")}
                  className="text-sm text-primary hover:underline"
                >
                  Olvidé mi contraseña
                </button>
              </div>
              <p className="mt-3 text-sm text-center text-muted-foreground">
                Solo usuarios autorizados pueden acceder. Contacta al administrador si necesitas una cuenta.
              </p>
            </CardContent>
          </>
        )}

        {mode === "forgot" && (
          <>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-semibold">Recuperar Contraseña</CardTitle>
              <CardDescription>Te enviaremos un enlace para crear una nueva contraseña</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Email</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar Enlace de Recuperación
                </Button>
              </form>
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="text-sm text-primary hover:underline"
                >
                  Volver al inicio de sesión
                </button>
              </div>
            </CardContent>
          </>
        )}

        {mode === "reset" && invitationGate === "used" && (
          <>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-semibold">Enlace ya utilizado</CardTitle>
              <CardDescription>
                Este enlace de activación ya fue usado anteriormente. Pide a tu gerente o administrador
                que reenvíe la invitación desde "Reset Password".
              </CardDescription>
            </CardHeader>
          </>
        )}

        {mode === "reset" && invitationGate !== "used" && (
          <>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-semibold">Nueva Contraseña</CardTitle>
              <CardDescription>Ingresa tu nueva contraseña</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">Nueva Contraseña</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirmar Contraseña</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Repite la contraseña"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading || invitationGate === "checking"}>
                  {(loading || invitationGate === "checking") && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Guardar Nueva Contraseña
                </Button>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
};

export default Auth;
