import { useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useRouteExecution } from "@/hooks/useRouteExecution";
import type { ExecutionStop, ExecutionForm } from "@/hooks/useRouteExecution";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronUp,
  MessageSquare, Camera, CalendarDays, Loader2, MapPin, ArrowLeft,
  Image as ImageIcon, Link2,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { useNavigate } from "react-router-dom";

// ---------------------------------------------------------------------------
// Postpone sheet
// ---------------------------------------------------------------------------
function PostponeSheet({
  open, onClose, onConfirm, saving,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (date: string, note: string) => void;
  saving: boolean;
}) {
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-amber-500" />
            Posponer parada
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Nueva fecha</label>
            <input
              type="date"
              value={date}
              min={format(new Date(), "yyyy-MM-dd")}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Motivo (opcional)</label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej: Local cerrado, reagendar"
              rows={2}
              className="text-sm resize-none"
            />
          </div>
        </div>
        <SheetFooter className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button
            className="flex-1 bg-amber-500 hover:bg-amber-600"
            disabled={!date || saving}
            onClick={() => onConfirm(date, note)}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Posponer"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Notes sheet
// ---------------------------------------------------------------------------
function NotesSheet({
  open, onClose, onSave, saving, initialValue,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (text: string) => void;
  saving: boolean;
  initialValue: string;
}) {
  const [text, setText] = useState(initialValue);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-500" />
            Comentario del proveedor
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ingresa observaciones o comentarios…"
            rows={4}
            className="text-sm resize-none"
            autoFocus
          />
        </div>
        <SheetFooter className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" disabled={!text.trim() || saving} onClick={() => onSave(text)}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Form card
// ---------------------------------------------------------------------------
function FormCard({
  form, stopId, saving, onComplete, onNotes, onPhoto,
}: {
  form: ExecutionForm;
  stopId: string;
  saving: string | null;
  onComplete: (routeFormId: string) => void;
  onNotes: (form: ExecutionForm) => void;
  onPhoto: (form: ExecutionForm) => void;
}) {
  function typeLabel() {
    if (form.electrical_description) return "Eléctrico";
    if (form.civil_description) return "Civil";
    if (form.hvac_description) return "Climatización";
    if (form.fixed_assets_description) return "Activos Fijos";
    return "General";
  }

  const isSaving = saving === form.id;

  return (
    <div className={`rounded-xl border-2 p-3 space-y-2 transition-all
      ${form.completed ? "border-green-200 bg-green-50/60" : "border-gray-200 bg-white"}`}>

      {/* Form header */}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-xs font-bold text-gray-600">{form.form_number}</span>
            <span className="text-xs text-gray-400">· {typeLabel()}</span>
            {form.criticality_name && (
              <Badge
                className="text-[10px] px-1.5 py-0 h-4"
                style={{ backgroundColor: form.criticality_color ?? "#6b7280", color: "#fff", border: "none" }}
              >
                {form.criticality_name}
              </Badge>
            )}
            {form.merge_group_id && form.mergedCount > 1 && (
              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-purple-600 text-white border-none gap-0.5">
                <Link2 className="w-2.5 h-2.5" /> Fusionado ×{form.mergedCount}
              </Badge>
            )}
          </div>
          {form.merge_group_id && form.mergedCount > 1 && (
            <p className="text-[10px] text-purple-500 mt-0.5">Al completar este form se completan los {form.mergedCount} fusionados.</p>
          )}
          {(form.general_description || form.electrical_description || form.civil_description) && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
              {form.general_description || form.electrical_description || form.civil_description}
            </p>
          )}
        </div>
        {form.completed && <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />}
      </div>

      {/* Operator notes preview */}
      {form.operator_notes && (
        <div className="flex items-start gap-1 text-xs text-blue-600 bg-blue-50 rounded-lg px-2 py-1">
          <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
          <span className="line-clamp-2">{form.operator_notes}</span>
        </div>
      )}

      {/* Evidence thumbnails */}
      {form.visit_evidence_urls.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {form.visit_evidence_urls.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-purple-600 bg-purple-50 rounded px-1.5 py-0.5">
              <ImageIcon className="w-3 h-3" />
              Foto {i + 1}
            </a>
          ))}
        </div>
      )}

      {/* Action buttons */}
      {!form.completed && (
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 h-8 text-xs text-blue-600 border border-blue-200 hover:bg-blue-50"
            onClick={() => onNotes(form)}
          >
            <MessageSquare className="w-3.5 h-3.5 mr-1" />
            Comentar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 h-8 text-xs text-purple-600 border border-purple-200 hover:bg-purple-50"
            onClick={() => onPhoto(form)}
          >
            <Camera className="w-3.5 h-3.5 mr-1" />
            Foto
          </Button>
          <Button
            size="sm"
            className="flex-1 h-8 text-xs bg-green-500 hover:bg-green-600 text-white"
            disabled={isSaving}
            onClick={() => onComplete(form.id)}
          >
            {isSaving
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Listo</>
            }
          </Button>
        </div>
      )}
      {form.completed && (
        <div className="flex gap-2 pt-0.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-purple-600 border border-purple-200 hover:bg-purple-50"
            onClick={() => onPhoto(form)}
          >
            <Camera className="w-3.5 h-3.5 mr-1" />
            + Foto
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stop card
// ---------------------------------------------------------------------------
function StopCard({
  stop, saving, onCompleteForm, onCompleteStop, onPostpone, onNotes, onPhoto,
}: {
  stop: ExecutionStop;
  saving: string | null;
  onCompleteForm: (routeFormId: string) => void;
  onCompleteStop: (stopId: string) => void;
  onPostpone: (stop: ExecutionStop) => void;
  onNotes: (form: ExecutionForm) => void;
  onPhoto: (form: ExecutionForm) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const completedForms = stop.forms.filter((f) => f.completed).length;
  const allDone = stop.forms.length > 0 && completedForms === stop.forms.length;

  const statusIcon = {
    completed: <CheckCircle2 className="w-5 h-5 text-green-500" />,
    postponed: <Clock className="w-5 h-5 text-amber-500" />,
    pending:   <MapPin className="w-5 h-5 text-blue-500" />,
  }[stop.status];

  return (
    <div className={`rounded-2xl border-2 overflow-hidden shadow-sm
      ${stop.status === "completed" ? "border-green-300 bg-green-50/30"
      : stop.status === "postponed" ? "border-amber-300 bg-amber-50/30"
      : "border-gray-200 bg-white"}`}>

      {/* Stop header */}
      <button
        className="w-full flex items-center gap-3 p-4 text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="w-8 h-8 rounded-full bg-blue-500 text-white text-sm font-bold flex items-center justify-center shrink-0">
          {stop.stop_order}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm leading-tight truncate">
            {stop.location_local_name || stop.location_name}
          </div>
          {stop.forms.length > 0 && (
            <div className="text-xs text-gray-400 mt-0.5">
              {completedForms}/{stop.forms.length} forms
              {stop.postponed_to && ` · Reagendado ${format(parseISO(stop.postponed_to), "d MMM", { locale: es })}`}
            </div>
          )}
        </div>
        {statusIcon}
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {/* Expandable content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100">
          {/* Forms */}
          {stop.forms.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-2">Sin forms asignados a esta parada</p>
          ) : (
            stop.forms.map((f) => (
              <FormCard
                key={f.id}
                form={f}
                stopId={stop.id}
                saving={saving}
                onComplete={onCompleteForm}
                onNotes={onNotes}
                onPhoto={onPhoto}
              />
            ))
          )}

          {/* Stop-level actions */}
          {stop.status === "pending" && (
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-9 text-xs text-amber-600 border-amber-300 hover:bg-amber-50"
                onClick={() => onPostpone(stop)}
              >
                <Clock className="w-3.5 h-3.5 mr-1" />
                Posponer
              </Button>
              {allDone && (
                <Button
                  size="sm"
                  className="flex-1 h-9 text-xs bg-green-500 hover:bg-green-600"
                  disabled={saving === stop.id}
                  onClick={() => onCompleteStop(stop.id)}
                >
                  {saving === stop.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Marcar parada lista</>
                  }
                </Button>
              )}
            </div>
          )}
          {stop.status === "postponed" && stop.postponed_to && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              <CalendarDays className="w-3.5 h-3.5" />
              Reagendado para {format(parseISO(stop.postponed_to), "EEEE d 'de' MMMM", { locale: es })}
              {stop.postpone_note && ` · ${stop.postpone_note}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------
export function RouteExecutionView({ routeId }: { routeId: string }) {
  const navigate = useNavigate();
  const exec = useRouteExecution(routeId);

  // Sheet state
  const [postponeStop, setPostponeStop] = useState<ExecutionStop | null>(null);
  const [notesForm, setNotesForm]       = useState<ExecutionForm | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoForm, setPhotoForm]       = useState<ExecutionForm | null>(null);
  const [uploading, setUploading]       = useState(false);

  if (exec.loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-sm text-gray-500">Cargando ruta…</p>
      </div>
    );
  }

  if (!exec.route) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 bg-gray-50 px-4">
        <AlertTriangle className="w-8 h-8 text-red-400" />
        <p className="text-sm text-gray-500 text-center">No se encontró la ruta o no tienes acceso.</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Volver</Button>
      </div>
    );
  }

  const { route } = exec;
  const completedStops = route.stops.filter((s) => s.status === "completed").length;
  const totalStops     = route.stops.length;
  const pct            = totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0;

  async function handleCompleteForm(routeFormId: string) {
    await exec.completeForm(routeFormId);
    // Find which stop this form belongs to and auto-complete if all done
    const stop = route!.stops.find((s) => s.forms.some((f) => f.id === routeFormId));
    if (stop) await exec.autoCompleteStopIfDone(stop.id);
  }

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !photoForm) return;
    setUploading(true);
    await exec.uploadEvidence(
      photoForm.id,
      photoForm.maintenance_form_id,
      photoForm.contract_id,
      photoForm.form_number,
      file,
    );
    setUploading(false);
    setPhotoForm(null);
    e.target.value = "";
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-white border-b shadow-sm px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1 text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sm truncate">{route.name}</h1>
            {route.scheduled_date && (
              <p className="text-xs text-gray-400 capitalize">
                {format(parseISO(route.scheduled_date), "EEEE d 'de' MMMM", { locale: es })}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold text-blue-600">{pct}%</div>
            <div className="text-[10px] text-gray-400">{completedStops}/{totalStops} paradas</div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className="bg-green-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Stops */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 pb-20">
        {route.stops.map((stop) => (
          <StopCard
            key={stop.id}
            stop={stop}
            saving={exec.saving}
            onCompleteForm={handleCompleteForm}
            onCompleteStop={exec.completeStop}
            onPostpone={(s) => setPostponeStop(s)}
            onNotes={(f) => setNotesForm(f)}
            onPhoto={(f) => {
              setPhotoForm(f);
              setTimeout(() => photoInputRef.current?.click(), 100);
            }}
          />
        ))}

        {route.stops.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <MapPin className="w-8 h-8 text-gray-300" />
            <p className="text-sm text-gray-400">Esta ruta no tiene paradas.</p>
          </div>
        )}
      </div>

      {/* Hidden file input for camera */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoSelected}
      />

      {/* Uploading overlay */}
      {uploading && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-3 mx-6">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm font-medium">Subiendo foto a Drive…</p>
          </div>
        </div>
      )}

      {/* Postpone sheet */}
      <PostponeSheet
        open={!!postponeStop}
        onClose={() => setPostponeStop(null)}
        saving={exec.saving === postponeStop?.id}
        onConfirm={async (date, note) => {
          if (!postponeStop) return;
          await exec.postponeStop(postponeStop.id, date, note);
          setPostponeStop(null);
        }}
      />

      {/* Notes sheet */}
      <NotesSheet
        open={!!notesForm}
        onClose={() => setNotesForm(null)}
        saving={exec.saving === notesForm?.id}
        initialValue={notesForm?.operator_notes ?? ""}
        onSave={async (text) => {
          if (!notesForm) return;
          await exec.saveNotes(notesForm.id, notesForm.maintenance_form_id, text);
          setNotesForm(null);
        }}
      />
    </div>
  );
}
