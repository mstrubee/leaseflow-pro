import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  CalendarPlus, ChevronDown, ChevronRight, ChevronsUpDown, FileDown,
  Plus, Trash2, X, Users, Loader2, Star, BookUser, Check,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { generateMeetingPDF, type MeetingContractSnapshot } from "./exportMeetingPDF";
import { downloadBlob } from "@/lib/downloadBlob";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contracts: MeetingContractSnapshot[];
}

interface Participant {
  id?: string;
  name: string;
  role?: string | null;
}

interface DirectoryEntry {
  id: string;
  name: string;
  role: string | null;
  is_recurring: boolean;
}

interface MeetingRow {
  id: string;
  meeting_date: string;
  notes: string | null;
  pdf_url: string | null;
  pdf_path: string | null;
  snapshot: MeetingContractSnapshot[] | null;
  participants: Participant[];
}

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function MeetingsRegistryDialog({ open, onOpenChange, contracts }: Props) {
  const { isAdmin } = useAuth();
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);

  // Inputs for new meeting
  const [newParticipants, setNewParticipants] = useState<Participant[]>([]);
  const [pName, setPName] = useState("");
  const [pRole, setPRole] = useState("");
  const [notes, setNotes] = useState("");

  // Directory of saved participants
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [savedToDirectory, setSavedToDirectory] = useState(true);
  const [markAsRecurring, setMarkAsRecurring] = useState(false);

  // Expansion state
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedMeetings, setExpandedMeetings] = useState<Set<string>>(new Set());

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newMeetingOpen, setNewMeetingOpen] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("special_attention_meetings")
      .select("id, meeting_date, notes, pdf_url, pdf_path, special_attention_meeting_participants(id, name, role)")
      .order("meeting_date", { ascending: false });
    if (error) {
      toast.error("Error al cargar reuniones");
      setLoading(false);
      return;
    }
    const rows: MeetingRow[] = (data || []).map((r: any) => ({
      id: r.id,
      meeting_date: r.meeting_date,
      notes: r.notes,
      pdf_url: r.pdf_url,
      pdf_path: r.pdf_path,
      participants: (r.special_attention_meeting_participants || []).map((p: any) => ({
        id: p.id, name: p.name, role: p.role,
      })),
    }));
    setMeetings(rows);

    // Auto-expand current year/month on first load
    const now = new Date();
    const yKey = String(now.getFullYear());
    const mKey = `${yKey}-${now.getMonth()}`;
    setExpandedYears(prev => prev.size === 0 ? new Set([yKey]) : prev);
    setExpandedMonths(prev => prev.size === 0 ? new Set([mKey]) : prev);

    setLoading(false);
  }, []);

  const loadDirectory = useCallback(async () => {
    const { data, error } = await supabase
      .from("special_attention_participants_directory")
      .select("id, name, role, is_recurring")
      .order("is_recurring", { ascending: false })
      .order("name", { ascending: true });
    if (error) {
      console.error("directory load error", error);
      return;
    }
    const list = (data || []) as DirectoryEntry[];
    setDirectory(list);
    // Preselect recurring participants if user hasn't manually edited yet
    setNewParticipants(prev => {
      if (prev.length > 0) return prev;
      return list
        .filter(d => d.is_recurring)
        .map(d => ({ name: d.name, role: d.role }));
    });
  }, []);

  useEffect(() => {
    if (open) {
      load();
      loadDirectory();
    } else {
      setPickerOpen(false);
      setDeleteId(null);
      document.body.style.pointerEvents = "";
    }
  }, [open, load, loadDirectory]);

  // Fix Radix freeze: nested modals can leave `pointer-events: none` stuck on
  // the body after the confirm dialog closes, freezing the whole app.
  useEffect(() => {
    if (!deleteId) {
      const t = setTimeout(() => {
        document.body.style.pointerEvents = "";
      }, 0);
      return () => clearTimeout(t);
    }
  }, [deleteId]);

  useEffect(() => {
    return () => {
      document.body.style.pointerEvents = "";
    };
  }, []);

  // Group meetings by year > month
  const grouped = useMemo(() => {
    const tree: Record<string, Record<string, MeetingRow[]>> = {};
    for (const m of meetings) {
      const d = new Date(m.meeting_date);
      const y = String(d.getFullYear());
      const mo = String(d.getMonth());
      if (!tree[y]) tree[y] = {};
      if (!tree[y][mo]) tree[y][mo] = [];
      tree[y][mo].push(m);
    }
    return tree;
  }, [meetings]);

  const sortedYears = useMemo(() => Object.keys(grouped).sort((a, b) => Number(b) - Number(a)), [grouped]);

  const allYearKeys = useMemo(() => sortedYears, [sortedYears]);
  const allMonthKeys = useMemo(() => {
    const out: string[] = [];
    for (const y of sortedYears) for (const m of Object.keys(grouped[y])) out.push(`${y}-${m}`);
    return out;
  }, [grouped, sortedYears]);
  const allMeetingIds = useMemo(() => meetings.map(m => m.id), [meetings]);

  const allExpanded =
    expandedYears.size === allYearKeys.length &&
    expandedMonths.size === allMonthKeys.length &&
    expandedMeetings.size === allMeetingIds.length;

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedYears(new Set());
      setExpandedMonths(new Set());
      setExpandedMeetings(new Set());
    } else {
      setExpandedYears(new Set(allYearKeys));
      setExpandedMonths(new Set(allMonthKeys));
      setExpandedMeetings(new Set(allMeetingIds));
    }
  };

  const toggleSet = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    setter(next);
  };

  const participantKey = (name: string, role?: string | null) =>
    `${name.trim().toLowerCase()}|${(role || "").trim().toLowerCase()}`;

  const isSelected = (entry: DirectoryEntry) =>
    newParticipants.some(p => participantKey(p.name, p.role) === participantKey(entry.name, entry.role));

  const addParticipant = () => {
    const name = pName.trim();
    if (!name) return;
    const role = pRole.trim() || null;
    const key = participantKey(name, role);
    if (newParticipants.some(p => participantKey(p.name, p.role) === key)) {
      toast.info("Ese participante ya está agregado");
      return;
    }
    setNewParticipants(prev => [...prev, { name, role }]);
    setPName("");
    setPRole("");
  };

  const removeParticipant = (idx: number) => {
    setNewParticipants(prev => prev.filter((_, i) => i !== idx));
  };

  const toggleDirectoryEntry = (entry: DirectoryEntry) => {
    if (isSelected(entry)) {
      setNewParticipants(prev =>
        prev.filter(p => participantKey(p.name, p.role) !== participantKey(entry.name, entry.role))
      );
    } else {
      setNewParticipants(prev => [...prev, { name: entry.name, role: entry.role }]);
    }
  };

  const toggleRecurring = async (entry: DirectoryEntry) => {
    const next = !entry.is_recurring;
    setDirectory(prev => prev.map(d => d.id === entry.id ? { ...d, is_recurring: next } : d));
    const { error } = await supabase
      .from("special_attention_participants_directory")
      .update({ is_recurring: next })
      .eq("id", entry.id);
    if (error) {
      toast.error("No se pudo actualizar");
      loadDirectory();
    }
  };

  const deleteDirectoryEntry = async (entry: DirectoryEntry) => {
    const { error } = await supabase
      .from("special_attention_participants_directory")
      .delete()
      .eq("id", entry.id);
    if (error) {
      toast.error("No se pudo eliminar");
      return;
    }
    setDirectory(prev => prev.filter(d => d.id !== entry.id));
    toast.success("Eliminado del directorio");
  };

  const handleRegister = async () => {
    setRegistering(true);
    try {
      const meetingDate = new Date();
      const snapshot = contracts.map(c => ({
        id: c.id, name: c.name, cebe: c.cebe, codigo: c.codigo,
        companyNames: c.companyNames, special_attention_reason: c.special_attention_reason,
      }));

      const { data: inserted, error: insErr } = await supabase
        .from("special_attention_meetings")
        .insert({
          meeting_date: meetingDate.toISOString(),
          notes: notes.trim() || null,
          snapshot,
        })
        .select("id")
        .single();
      if (insErr || !inserted) throw insErr || new Error("No se pudo crear el registro");

      const meetingId = inserted.id;

      if (newParticipants.length > 0) {
        const { error: pErr } = await supabase
          .from("special_attention_meeting_participants")
          .insert(newParticipants.map(p => ({
            meeting_id: meetingId,
            name: p.name,
            role: p.role,
          })));
        if (pErr) throw pErr;

        // Save new participants to the directory (idempotent via unique constraint)
        if (savedToDirectory) {
          const toUpsert = newParticipants
            .filter(p => !directory.some(d => participantKey(d.name, d.role) === participantKey(p.name, p.role)))
            .map(p => ({ name: p.name, role: p.role, is_recurring: markAsRecurring }));
          if (toUpsert.length > 0) {
            await supabase
              .from("special_attention_participants_directory")
              .upsert(toUpsert, { onConflict: "name,role", ignoreDuplicates: false });
          }
        }
      }

      // Generate + upload PDF — "Acta de Reunión" que incluye participantes y notas
      // (esto lo diferencia del informe descargable desde la pantalla frontal).
      try {
        const { blob, filename } = await generateMeetingPDF({
          meetingDate,
          notes: notes.trim() || null,
          participants: newParticipants.map(p => ({ name: p.name, role: p.role })),
          contracts: snapshot,
        });
        const yyyy = meetingDate.getFullYear();
        const mm = String(meetingDate.getMonth() + 1).padStart(2, "0");
        const path = `special-attention-meetings/${yyyy}/${mm}/${meetingId}_${filename}`;
        const { error: upErr } = await supabase.storage
          .from("repository-files")
          .upload(path, blob, { contentType: "application/pdf", upsert: true });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("repository-files").getPublicUrl(path);
        await supabase
          .from("special_attention_meetings")
          .update({ pdf_url: pub.publicUrl, pdf_path: path })
          .eq("id", meetingId);
      } catch (pdfErr: any) {
        console.error("PDF upload failed", pdfErr);
        toast.warning("Reunión registrada, pero el PDF no se pudo guardar");
      }

      toast.success("Reunión registrada");
      setNotes("");
      setMarkAsRecurring(false);
      setNewParticipants([]);
      // Defer to next tick so loadDirectory's preselect sees empty state
      setTimeout(() => { loadDirectory(); }, 0);
      await load();
    } catch (err: any) {
      console.error(err);
      toast.error("Error al registrar reunión: " + (err?.message || ""));
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async () => {
    const id = deleteId;
    if (!id) return;
    setDeletingId(id);
    const meeting = meetings.find(m => m.id === id);
    if (meeting?.pdf_path) {
      await supabase.storage.from("repository-files").remove([meeting.pdf_path]);
    }
    const { error } = await supabase
      .from("special_attention_meetings")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Error al eliminar");
    } else {
      toast.success("Reunión eliminada");
      await load();
    }
    setDeleteId(null);
    setDeletingId(null);
    document.body.style.pointerEvents = "";
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} hrs`;
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-amber-500" />
            Registro de Reuniones — Atención Especial
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
          {/* New meeting */}
          <section className="border rounded-lg p-4 bg-muted/30 space-y-3">
            <Collapsible open={newMeetingOpen} onOpenChange={setNewMeetingOpen}>
              <div className="flex items-center justify-between">
                <CollapsibleTrigger asChild>
                  <button type="button" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    {newMeetingOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <h3 className="font-semibold text-sm">Nueva reunión</h3>
                  </button>
                </CollapsibleTrigger>
                <span className="text-xs text-muted-foreground">
                  Fecha y hora se registran automáticamente
                </span>
              </div>

              <CollapsibleContent className="space-y-3 pt-3">
            {/* Participants */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Participantes</label>
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                      <BookUser className="h-3.5 w-3.5" />
                      Directorio
                      {directory.length > 0 && (
                        <span className="text-muted-foreground">({directory.length})</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="end">
                    <Command>
                      <CommandInput placeholder="Buscar participante guardado..." />
                      <CommandList>
                        <CommandEmpty>Sin participantes guardados</CommandEmpty>
                        <CommandGroup heading="Directorio">
                          {directory.map(entry => {
                            const selected = isSelected(entry);
                            return (
                              <CommandItem
                                key={entry.id}
                                value={`${entry.name} ${entry.role || ""}`}
                                onSelect={() => toggleDirectoryEntry(entry)}
                                className="flex items-center gap-2"
                              >
                                <Check className={`h-4 w-4 shrink-0 ${selected ? "opacity-100" : "opacity-0"}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm truncate">{entry.name}</p>
                                  {entry.role && (
                                    <p className="text-xs text-muted-foreground truncate">{entry.role}</p>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); toggleRecurring(entry); }}
                                  className={`p-1 rounded hover:bg-muted ${entry.is_recurring ? "text-amber-500" : "text-muted-foreground"}`}
                                  title={entry.is_recurring ? "Quitar de recurrentes" : "Marcar como recurrente"}
                                >
                                  <Star className={`h-3.5 w-3.5 ${entry.is_recurring ? "fill-current" : ""}`} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); deleteDirectoryEntry(entry); }}
                                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                  title="Eliminar del directorio"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Nombre"
                  value={pName}
                  onChange={e => setPName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addParticipant(); } }}
                  className="flex-1"
                />
                <Input
                  placeholder="Cargo (opcional)"
                  value={pRole}
                  onChange={e => setPRole(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addParticipant(); } }}
                  className="w-48"
                />
                <Button type="button" size="sm" onClick={addParticipant} disabled={!pName.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {pName.trim() && (
                <div className="flex items-center gap-4 px-1 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground">
                    <Checkbox
                      checked={savedToDirectory}
                      onCheckedChange={(v) => setSavedToDirectory(!!v)}
                      className="h-3.5 w-3.5"
                    />
                    Guardar en directorio
                  </label>
                  {savedToDirectory && (
                    <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground">
                      <Checkbox
                        checked={markAsRecurring}
                        onCheckedChange={(v) => setMarkAsRecurring(!!v)}
                        className="h-3.5 w-3.5"
                      />
                      <Star className="h-3 w-3 text-amber-500" />
                      Marcar como recurrente
                    </label>
                  )}
                </div>
              )}
              {newParticipants.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {newParticipants.map((p, i) => {
                    const inDir = directory.find(d => participantKey(d.name, d.role) === participantKey(p.name, p.role));
                    return (
                      <Badge key={i} variant="secondary" className="gap-1.5 pr-1">
                        {inDir?.is_recurring && <Star className="h-3 w-3 text-amber-500 fill-current" />}
                        <span>{p.name}{p.role ? ` · ${p.role}` : ""}</span>
                        <button
                          onClick={() => removeParticipant(i)}
                          className="hover:bg-destructive/20 rounded-sm p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Notas (opcional)</label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Acuerdos, temas tratados, próximos pasos…"
                rows={3}
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={handleRegister} disabled={registering} className="gap-2">
                {registering ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
                Registrar
              </Button>
            </div>
              </CollapsibleContent>
            </Collapsible>
          </section>


          {/* History */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Historial ({meetings.length})</h3>
              <Button variant="outline" size="sm" onClick={toggleAll} disabled={meetings.length === 0} className="gap-1.5">
                <ChevronsUpDown className="h-4 w-4" />
                {allExpanded ? "Contraer todo" : "Expandir todo"}
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : meetings.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                Sin reuniones registradas todavía.
              </p>
            ) : (
              <div className="space-y-1.5">
                {sortedYears.map(year => {
                  const months = grouped[year];
                  const totalY = Object.values(months).reduce((s, arr) => s + arr.length, 0);
                  const yOpen = expandedYears.has(year);
                  return (
                    <Collapsible key={year} open={yOpen} onOpenChange={() => toggleSet(expandedYears, setExpandedYears, year)}>
                      <CollapsibleTrigger asChild>
                        <button className="w-full flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/70 rounded-md text-left transition-colors">
                          {yOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <span className="font-semibold">{year}</span>
                          <span className="text-xs text-muted-foreground">({totalY} {totalY === 1 ? "reunión" : "reuniones"})</span>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pl-4 pt-1 space-y-1">
                        {Object.keys(months).sort((a, b) => Number(b) - Number(a)).map(monthIdx => {
                          const mKey = `${year}-${monthIdx}`;
                          const mOpen = expandedMonths.has(mKey);
                          const mList = months[monthIdx];
                          return (
                            <Collapsible key={mKey} open={mOpen} onOpenChange={() => toggleSet(expandedMonths, setExpandedMonths, mKey)}>
                              <CollapsibleTrigger asChild>
                                <button className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted/40 hover:bg-muted/70 rounded-md text-left transition-colors text-sm">
                                  {mOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                  <span className="font-medium">{MONTHS_ES[Number(monthIdx)]}</span>
                                  <span className="text-xs text-muted-foreground">({mList.length})</span>
                                </button>
                              </CollapsibleTrigger>
                              <CollapsibleContent className="pl-4 pt-1 space-y-1">
                                {mList.map(meeting => {
                                  const open = expandedMeetings.has(meeting.id);
                                  return (
                                    <div key={meeting.id} className="border rounded-md bg-card">
                                      <div className="flex items-center gap-2 px-3 py-2">
                                        <button
                                          onClick={() => toggleSet(expandedMeetings, setExpandedMeetings, meeting.id)}
                                          className="shrink-0 text-muted-foreground hover:text-foreground"
                                        >
                                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium">{fmt(meeting.meeting_date)}</p>
                                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Users className="h-3 w-3" />
                                            {meeting.participants.length} participante{meeting.participants.length !== 1 ? "s" : ""}
                                          </p>
                                        </div>
                                        {meeting.pdf_url && (
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="gap-1.5 h-7"
                                            onClick={() => window.open(meeting.pdf_url!, "_blank")}
                                          >
                                            <FileDown className="h-3.5 w-3.5" />
                                            PDF
                                          </Button>
                                        )}
                                        {isAdmin && deleteId === meeting.id ? (
                                          <div className="flex items-center gap-1.5">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-7 px-2 text-xs"
                                              onClick={() => setDeleteId(null)}
                                              disabled={deletingId === meeting.id}
                                            >
                                              Cancelar
                                            </Button>
                                            <Button
                                              variant="destructive"
                                              size="sm"
                                              className="h-7 px-2 gap-1.5 text-xs"
                                              onClick={handleDelete}
                                              disabled={deletingId === meeting.id}
                                            >
                                              {deletingId === meeting.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                              Eliminar
                                            </Button>
                                          </div>
                                        ) : isAdmin ? (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                            onClick={() => setDeleteId(meeting.id)}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        ) : null}
                                      </div>
                                      {open && (
                                        <div className="px-3 pb-3 pt-1 border-t bg-muted/20 space-y-2">
                                          {meeting.participants.length > 0 && (
                                            <div>
                                              <p className="text-xs font-semibold text-muted-foreground mb-1">Participantes:</p>
                                              <div className="flex flex-wrap gap-1">
                                                {meeting.participants.map(p => (
                                                  <Badge key={p.id} variant="outline" className="text-xs">
                                                    {p.name}{p.role ? ` · ${p.role}` : ""}
                                                  </Badge>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                          {meeting.notes && (
                                            <div>
                                              <p className="text-xs font-semibold text-muted-foreground mb-1">Notas:</p>
                                              <p className="text-sm whitespace-pre-wrap">{meeting.notes}</p>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        })}
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>

    </>
  );
}
