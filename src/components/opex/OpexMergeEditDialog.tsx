import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { matchesSearch, updateSelection } from "@/lib/opexCategories";
import type { CategoryFusion } from "@/components/opex/useOpexCategoryChanges";

interface OpexMergeEditDialogProps {
  planYear: number;
  fusion: CategoryFusion;
  categoryName: (id: string) => string;
  // Categorías vigentes que se pueden agregar (sin la final, sin las que ya están en la fusión).
  candidates: Array<{ id: string; name: string }>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { toId: string; newName: string | null; add: string[]; remove: string[] }) => Promise<boolean>;
}

// Editar una fusión: cambiar el nombre de la categoría final, quitar categorías y agregar otras (con búsqueda).
// Lo que se marca para agregar se conserva aunque se cambie la búsqueda.
export const OpexMergeEditDialog = ({ planYear, fusion, categoryName, candidates, busy, onClose, onSubmit }: OpexMergeEditDialogProps) => {
  const currentName = categoryName(fusion.toId);
  const [name, setName] = useState(currentName);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const results = useMemo(() => candidates.filter((c) => matchesSearch(c.name, search)), [candidates, search]);
  const addedList = candidates.filter((c) => added.has(c.id));
  const remaining = fusion.fromIds.length - removed.size + added.size;
  const nameChanged = fusion.createdByChange && name.trim() !== currentName;
  const hasChanges = nameChanged || removed.size > 0 || added.size > 0;

  const handleSubmit = async () => {
    if (fusion.createdByChange && !name.trim()) return toast.error("Ingresa el nombre de la categoría final");
    if (remaining < 1) return toast.error('La fusión necesita al menos una categoría. Para eliminarla usa "Deshacer"');
    const ok = await onSubmit({
      toId: fusion.toId,
      newName: nameChanged ? name.trim() : null,
      add: Array.from(added),
      remove: Array.from(removed),
    });
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar fusión «{currentName}»</DialogTitle>
          <DialogDescription>
            Los cambios rigen desde {planYear}; {planYear - 1} no se toca. Puedes editarla hasta que se apliquen las categorías {planYear}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1">
            <Label htmlFor="fusion-name">Nombre de la categoría final</Label>
            <Input
              id="fusion-name"
              maxLength={100}
              value={name}
              disabled={!fusion.createdByChange}
              onChange={(e) => setName(e.target.value)}
            />
            {!fusion.createdByChange && (
              <p className="text-xs text-muted-foreground">
                Esta categoría ya existía antes de la fusión y su nombre también rige para años anteriores, por eso no se cambia aquí.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Categorías en esta fusión ({fusion.fromIds.length - removed.size + added.size})</Label>
            <ul className="space-y-1">
              {fusion.fromIds.map((id) => {
                const isRemoved = removed.has(id);
                return (
                  <li key={id} className="flex items-center justify-between gap-2 border rounded-md px-2 py-1 text-sm">
                    <span className={isRemoved ? "line-through text-muted-foreground" : undefined}>{categoryName(id)}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRemoved((prev) => updateSelection(prev, [id], !isRemoved))}
                    >
                      {isRemoved ? (
                        <>
                          <Undo2 className="h-4 w-4 mr-1" />
                          No quitar
                        </>
                      ) : (
                        <>
                          <X className="h-4 w-4 mr-1" />
                          Quitar
                        </>
                      )}
                    </Button>
                  </li>
                );
              })}
              {addedList.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 border border-primary/40 rounded-md px-2 py-1 text-sm">
                  <span>
                    {c.name} <Badge variant="secondary" className="ml-1">Nueva en la fusión</Badge>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setAdded((prev) => updateSelection(prev, [c.id], false))}>
                    <X className="h-4 w-4 mr-1" />
                    Quitar
                  </Button>
                </li>
              ))}
            </ul>
            {remaining < 1 && (
              <p className="text-xs text-destructive">
                La fusión necesita al menos una categoría. Para eliminarla por completo usa "Deshacer".
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="fusion-search">Agregar categorías</Label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="fusion-search"
                  className="pl-8"
                  placeholder="Buscar categoría por nombre..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {search.trim() ? `${results.length} de ${candidates.length}` : `${candidates.length} disponibles`}
              </span>
              {search.trim() && results.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setAdded((prev) =>
                      updateSelection(prev, results.map((c) => c.id), true),
                    )
                  }
                >
                  Agregar los {results.length} resultados
                </Button>
              )}
            </div>
            <div className="border rounded-md max-h-56 overflow-y-auto divide-y">
              {results.length === 0 && (
                <p className="p-3 text-sm text-muted-foreground">
                  {candidates.length === 0 ? "No hay más categorías disponibles." : `Ninguna categoría coincide con «${search.trim()}».`}
                </p>
              )}
              {results.map((c) => (
                <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/50">
                  <Checkbox
                    checked={added.has(c.id)}
                    onCheckedChange={(checked) => setAdded((prev) => updateSelection(prev, [c.id], checked === true))}
                  />
                  {c.name}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Lo que marques se conserva aunque cambies la búsqueda.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={busy || !hasChanges || remaining < 1}>
            {busy ? "Guardando..." : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
