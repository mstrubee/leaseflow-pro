import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CollapsibleCard } from "@/components/admin/CollapsibleCard";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ShieldCheck, Search, AlertTriangle, Loader2, UserCheck } from "lucide-react";

interface OrgMember {
  id: string;
  name: string;
  position: string | null;
  email: string | null;
}

interface ProfileLite {
  id: string;
  email: string;
  full_name: string | null;
}

export function ServiceContractApproversManager() {
  const { toast } = useToast();
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [profilesByEmail, setProfilesByEmail] = useState<Record<string, ProfileLite>>({});
  const [approverOrgIds, setApproverOrgIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: orgData }, { data: profileData }, { data: approverData }] = await Promise.all([
      supabase.rpc("get_org_members_admin"),
      supabase.from("profiles").select("id, email, full_name"),
      supabase.from("service_contract_approvers").select("org_member_id"),
    ]);

    setOrgMembers(
      ((orgData as OrgMember[]) ?? []).sort((a, b) => a.name.localeCompare(b.name))
    );

    const emailMap: Record<string, ProfileLite> = {};
    for (const p of ((profileData as ProfileLite[]) ?? [])) {
      if (p.email) emailMap[p.email.toLowerCase()] = p;
    }
    setProfilesByEmail(emailMap);

    setApproverOrgIds(new Set(((approverData as { org_member_id: string }[]) ?? []).map(a => a.org_member_id)));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (member: OrgMember) => {
    setBusyId(member.id);
    const isApprover = approverOrgIds.has(member.id);
    if (isApprover) {
      const { error } = await supabase
        .from("service_contract_approvers")
        .delete()
        .eq("org_member_id", member.id);
      if (error) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo quitar el aprobador" });
      } else {
        setApproverOrgIds(prev => { const n = new Set(prev); n.delete(member.id); return n; });
      }
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const profile = member.email ? profilesByEmail[member.email.toLowerCase()] : undefined;
      const { error } = await supabase
        .from("service_contract_approvers")
        .insert({
          org_member_id: member.id,
          profile_id: profile?.id ?? null,
          created_by: user?.id ?? null,
        });
      if (error) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo agregar el aprobador" });
      } else {
        setApproverOrgIds(prev => new Set(prev).add(member.id));
        if (!profile) {
          toast({
            title: "Aprobador agregado sin cuenta de plataforma",
            description: `${member.name} no tiene un usuario que coincida por email. No podrá aprobar hasta que tenga una cuenta activa.`,
          });
        }
      }
    }
    setBusyId(null);
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return orgMembers.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.position ?? "").toLowerCase().includes(q)
    );
  }, [orgMembers, search]);

  const approverCount = approverOrgIds.size;

  return (
    <CollapsibleCard
      title="Aprobadores de contratos de servicio"
      description="Designa quiénes pueden aprobar contratos de servicio. Se alimenta del organigrama."
      icon={<ShieldCheck className="h-5 w-5 text-violet-600" />}
      headerActions={
        approverCount > 0 ? (
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {approverCount} aprobador{approverCount !== 1 ? "es" : ""}
          </span>
        ) : null
      }
    >
      <div className="space-y-3 pt-2">
        <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3 leading-relaxed">
          El aprobador de cada contrato se determina automáticamente: al crearlo, el sistema sube por el
          organigrama desde el creador hasta encontrar al <strong>primer superior designado como aprobador</strong>.
          Solo los miembros con cuenta de plataforma (email coincidente) pueden iniciar sesión y aprobar.
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o cargo..."
            className="pl-8 h-9"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {orgMembers.length === 0
              ? "No hay miembros en el organigrama. Configúralo primero en la sección Organigrama."
              : "Sin resultados para la búsqueda."}
          </p>
        ) : (
          <div className="border rounded-md divide-y max-h-96 overflow-y-auto">
            {filtered.map(member => {
              const hasAccount = !!(member.email && profilesByEmail[member.email.toLowerCase()]);
              const isApprover = approverOrgIds.has(member.id);
              return (
                <label
                  key={member.id}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 cursor-pointer"
                >
                  <Checkbox
                    checked={isApprover}
                    disabled={busyId === member.id}
                    onCheckedChange={() => toggle(member)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate flex items-center gap-1.5">
                      {member.name}
                      {isApprover && hasAccount && (
                        <UserCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      )}
                    </p>
                    {member.position && (
                      <p className="text-xs text-muted-foreground truncate">{member.position}</p>
                    )}
                  </div>
                  {!hasAccount && (
                    <span className="flex items-center gap-1 text-xs text-amber-600 shrink-0" title="Sin cuenta de plataforma que coincida por email">
                      <AlertTriangle className="h-3 w-3" />
                      Sin cuenta
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </CollapsibleCard>
  );
}
