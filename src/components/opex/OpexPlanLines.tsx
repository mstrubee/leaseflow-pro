import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Ban, ChevronDown, ChevronRight, Search, Undo2 } from "lucide-react";
import { CompanyLogo } from "@/components/contracts/CompanyLogo";
import type { PlanLine } from "@/lib/opexPlanning";

interface OpexPlanLinesProps {
  lines: PlanLine[];
  categoryName: (categoryId: string | null) => string;
  // Clave de la línea que se está guardando (deshabilita su botón).
  busyKey: string | null;
  onExclude: (line: PlanLine) => void;
  onRestore: (line: PlanLine) => void;
}

const formatClp = (value: number) => `$ ${Math.round(value).toLocaleString("es-CL")}`;

// Líneas consideradas en la propuesta. Excluir las tacha y las mueve a "Excluidas"
// (colapsado al final), desde donde se pueden reincorporar; nunca se borran.
export const OpexPlanLines = ({ lines, categoryName, busyKey, onExclude, onRestore }: OpexPlanLinesProps) => {
  const [search, setSearch] = useState("");
  const [excludedOpen, setExcludedOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return lines;
    return lines.filter((l) =>
      [l.reference, l.contractName, l.supplierName, l.description, categoryName(l.categoryId)]
        .filter(Boolean)
        .some((text) => (text as string).toLowerCase().includes(term)),
    );
  }, [lines, search, categoryName]);

  const included = filtered.filter((l) => !l.excluded);
  const excluded = filtered.filter((l) => l.excluded);
  const excludedTotal = excluded.reduce((sum, l) => sum + l.amountClp, 0);

  const renderRow = (line: PlanLine) => (
    <TableRow key={line.key} className={line.excluded ? "text-muted-foreground" : undefined}>
      <TableCell className={line.excluded ? "line-through whitespace-nowrap" : "whitespace-nowrap"}>
        {line.date ?? "—"}
      </TableCell>
      <TableCell className={line.excluded ? "line-through" : undefined}>
        {line.reference}
        {line.kind === "admin" && <Badge variant="secondary" className="ml-2 text-[10px]">ADMIN</Badge>}
      </TableCell>
      <TableCell className={line.excluded ? "line-through" : undefined}>
        {line.contractName ? (
          <div className="flex items-center gap-2">
            <CompanyLogo companyNames={line.companyNames} size="sm" />
            <span>{line.contractName}</span>
          </div>
        ) : (
          "Global"
        )}
      </TableCell>
      <TableCell className={line.excluded ? "line-through" : undefined}>{line.supplierName ?? "—"}</TableCell>
      <TableCell className={line.excluded ? "line-through" : undefined}>{categoryName(line.categoryId)}</TableCell>
      <TableCell className={`max-w-[220px] truncate ${line.excluded ? "line-through" : ""}`} title={line.description ?? undefined}>
        {line.description || "—"}
      </TableCell>
      <TableCell className={`text-right whitespace-nowrap ${line.excluded ? "line-through" : ""}`}>
        {formatClp(line.amountClp)}
      </TableCell>
      <TableCell>
        {line.excluded ? (
          <Button variant="outline" size="sm" disabled={busyKey === line.key} onClick={() => onRestore(line)}>
            <Undo2 className="h-4 w-4 mr-1" />
            Reincorporar
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled={busyKey === line.key} onClick={() => onExclude(line)}>
            <Ban className="h-4 w-4 mr-1" />
            Excluir
          </Button>
        )}
      </TableCell>
    </TableRow>
  );

  const header = (
    <TableHeader>
      <TableRow>
        <TableHead>Fecha</TableHead>
        <TableHead>Referencia</TableHead>
        <TableHead>Local</TableHead>
        <TableHead>Proveedor</TableHead>
        <TableHead>Categoría</TableHead>
        <TableHead>Descripción</TableHead>
        <TableHead className="text-right">Monto</TableHead>
        <TableHead className="w-32" />
      </TableRow>
    </TableHeader>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Estas son las líneas que alimentan la propuesta. Si una no corresponde (por ejemplo, un gasto puntual), exclúyela:
        se saca del cálculo y queda en "Excluidas", donde puedes reincorporarla.
      </p>
      <div className="relative max-w-sm">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Buscar línea..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="border rounded-md max-h-[28rem] overflow-y-auto">
        <Table>
          {header}
          <TableBody>
            {included.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No hay líneas que coincidan.
                </TableCell>
              </TableRow>
            )}
            {included.map(renderRow)}
          </TableBody>
        </Table>
      </div>

      <Collapsible open={excludedOpen} onOpenChange={setExcludedOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-start">
            {excludedOpen ? <ChevronDown className="h-4 w-4 mr-1" /> : <ChevronRight className="h-4 w-4 mr-1" />}
            Excluidas ({excluded.length}) — {formatClp(excludedTotal)}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border rounded-md max-h-[20rem] overflow-y-auto">
            <Table>
              {header}
              <TableBody>
                {excluded.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No hay líneas excluidas.
                    </TableCell>
                  </TableRow>
                )}
                {excluded.map(renderRow)}
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
