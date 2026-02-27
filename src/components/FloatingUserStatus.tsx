import { useState, useEffect } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  last_seen_at: string | null;
  activity_status: string | null;
  current_section: string | null;
}

function getStatus(profile: Profile) {
  const now = Date.now();
  const lastSeen = profile.last_seen_at ? new Date(profile.last_seen_at).getTime() : 0;
  const isOnline = now - lastSeen < 5 * 60 * 1000;

  if (!isOnline) {
    return {
      color: "bg-gray-400",
      pulse: false,
      text: profile.last_seen_at
        ? `Visto: ${format(new Date(profile.last_seen_at), "dd/MM/yyyy HH:mm")}`
        : "Sin actividad registrada",
    };
  }
  if (profile.activity_status === "idle") {
    return { color: "bg-amber-400", pulse: false, text: "Detenido" };
  }
  return {
    color: "bg-green-500",
    pulse: true,
    text: `Trabajando en ${profile.current_section || "Inicio"}`,
  };
}

export function FloatingUserStatus() {
  const { isAdmin, roleLoaded } = useAuth();
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    if (!open) return;

    const fetchProfiles = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, email, full_name, last_seen_at, activity_status, current_section" as any);
      if (data) setProfiles(data as any);
    };

    fetchProfiles();

    const channel = supabase
      .channel("admin-presence")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          setProfiles((prev) =>
            prev.map((p) => (p.id === (payload.new as any).id ? { ...p, ...(payload.new as any) } : p))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open]);

  if (!roleLoaded || !isAdmin) return null;

  return (
    <div className="fixed bottom-[52px] left-4 z-50">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setOpen((v) => !v)}
              className="h-10 w-10 rounded-full shadow-lg bg-card hover:bg-accent border-border"
            >
              <Users className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Estado de usuarios</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {open && (
        <div className="absolute bottom-12 left-0 w-72 rounded-lg border bg-popover shadow-xl">
          <div className="p-3 border-b">
            <h4 className="text-sm font-semibold text-foreground">Usuarios conectados</h4>
          </div>
          <ScrollArea className="max-h-72">
            <div className="p-2 space-y-1">
              {profiles.map((profile) => {
                const status = getStatus(profile);
                return (
                  <div key={profile.id} className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${status.color} ${status.pulse ? "animate-pulse" : ""}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {profile.full_name || profile.email}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{status.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
