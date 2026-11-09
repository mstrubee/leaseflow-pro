import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Merge, Search, X } from "lucide-react";

interface OpexCategorySelectionBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  resultCount: number;
  totalCount: number;
  // Cuántos de los resultados visibles todavía no están seleccionados.
  unselectedResultCount: number;
  // Selección acumulada: se conserva aunque cambie la búsqueda.
  selected: Array<{ id: string; name: string }>;
  locked: boolean;
  planYear: number;
  baseYear: number;
  onSelectResults: () => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onMerge: () => void;
}

// Búsqueda por nombre y selección acumulada de categorías para fusionar.
// Se puede buscar, marcar, buscar otra cosa y seguir marcando: lo ya seleccionado no se pierde.
export const OpexCategorySelectionBar = ({
  search,
  onSearchChange,
  resultCount,
  totalCount,
  unselectedResultCount,
  selected,
  locked,
  planYear,
  baseYear,
  onSelectResults,
  onRemove,
  onClear,
  onMerge,
}: OpexCategorySelectionBarProps) => {
  const searching = search.trim().length > 0;
  return (
    <div className="space-y-2 mb-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 pr-8"
            placeholder="Buscar categoría por nombre..."
            aria-label="Buscar categoría por nombre"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searching && (
            <button
              type="button"
              aria-label="Borrar búsqueda"
              className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
              onClick={() => onSearchChange("")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {searching ? `${resultCount} de ${totalCount} categorías` : `${totalCount} categorías`}
        </span>
        {searching && resultCount > 0 && (
          <Button size="sm" variant="outline" disabled={locked || unselectedResultCount === 0} onClick={onSelectResults}>
            Seleccionar los {resultCount} resultados
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Busca, marca y vuelve a buscar: lo que ya marcaste se conserva. Con 2 o más categorías puedes fusionarlas.
          Renombrar, fusionar y retirar rigen desde {planYear}; {baseYear} no se toca.
        </p>
        <Button size="sm" disabled={selected.length < 2 || locked} onClick={onMerge}>
          <Merge className="h-4 w-4 mr-1" />
          Fusionar ({selected.length})
        </Button>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border p-2">
          <span className="text-xs font-medium mr-1">Seleccionadas ({selected.length}):</span>
          {selected.map((c) => (
            <Badge key={c.id} variant="secondary" className="gap-1">
              {c.name}
              <button
                type="button"
                aria-label={`Quitar ${c.name} de la selección`}
                disabled={locked}
                className="hover:text-destructive"
                onClick={() => onRemove(c.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={locked} onClick={onClear}>
            Limpiar selección
          </Button>
        </div>
      )}
    </div>
  );
};
