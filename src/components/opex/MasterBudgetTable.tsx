import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChevronRight, ChevronDown, ChevronsUpDown } from "lucide-react";

interface MasterBudgetData {
  id: string;
  category_id: string;
  category_name: string;
  amount_clp: number;
  amount_uf: number;
  months: number[]; // 12 months in CLP
  consumed_clp: number;
  consumed_uf: number;
}

interface MasterBudgetTableProps {
  data: MasterBudgetData[];
  ufValue: number;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export const MasterBudgetTable = ({ data, ufValue }: MasterBudgetTableProps) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showMonths, setShowMonths] = useState(false);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const toggleAllMonths = () => {
    if (showMonths) {
      setExpandedCategories(new Set());
    } else {
      setExpandedCategories(new Set(data.map(d => d.category_id)));
    }
    setShowMonths(!showMonths);
  };

  const formatCLP = (value: number) => {
    return `$ ${Math.round(value).toLocaleString("es-CL")}`;
  };

  const formatUF = (value: number) => {
    return `${value.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UF`;
  };

  const convertToUF = (clp: number) => {
    if (ufValue <= 0) return 0;
    return clp / ufValue;
  };

  // Calculate totals
  const totals = data.reduce(
    (acc, row) => ({
      budget_clp: acc.budget_clp + row.amount_clp,
      consumed_clp: acc.consumed_clp + row.consumed_clp,
      months: acc.months.map((m, i) => m + (row.months[i] || 0)),
    }),
    { budget_clp: 0, consumed_clp: 0, months: Array(12).fill(0) }
  );

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={toggleAllMonths}>
          <ChevronsUpDown className="h-4 w-4 mr-1" />
          {showMonths ? "Ocultar Meses" : "Mostrar Meses"}
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-8"></TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Presupuesto (CLP)</TableHead>
              <TableHead className="text-right text-muted-foreground">≈ UF</TableHead>
              <TableHead className="text-right">Consumido (CLP)</TableHead>
              <TableHead className="text-right">Disponible (CLP)</TableHead>
              <TableHead className="w-[150px]">Uso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row) => {
              const available = row.amount_clp - row.consumed_clp;
              const usagePercent = row.amount_clp > 0 ? (row.consumed_clp / row.amount_clp) * 100 : 0;
              const isExpanded = expandedCategories.has(row.category_id);

              return (
                <Collapsible key={row.category_id} asChild open={isExpanded}>
                  <>
                    <TableRow className="hover:bg-muted/30">
                      <TableCell className="p-0">
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => toggleCategory(row.category_id)}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                      </TableCell>
                      <TableCell className="font-medium">{row.category_name}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCLP(row.amount_clp)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">
                        {formatUF(convertToUF(row.amount_clp))}
                      </TableCell>
                      <TableCell className="text-right text-orange-600">
                        {formatCLP(row.consumed_clp)}
                      </TableCell>
                      <TableCell className={`text-right ${available < 0 ? "text-destructive" : "text-green-600"}`}>
                        {formatCLP(available)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={Math.min(usagePercent, 100)} className="h-2 flex-1" />
                          <span className="text-xs text-muted-foreground w-10 text-right">
                            {usagePercent.toFixed(0)}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                    <CollapsibleContent asChild>
                      <TableRow className="bg-muted/20">
                        <TableCell colSpan={7} className="p-0">
                          <div className="px-6 py-3">
                            <div className="grid grid-cols-6 gap-2 text-sm">
                              {MONTH_NAMES.map((month, i) => (
                                <div key={i} className="flex flex-col p-2 rounded bg-card border">
                                  <span className="text-xs text-muted-foreground">{month}</span>
                                  <span className="font-medium">{formatCLP(row.months[i] || 0)}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {formatUF(convertToUF(row.months[i] || 0))}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    </CollapsibleContent>
                  </>
                </Collapsible>
              );
            })}

            {/* Totals Row */}
            <TableRow className="bg-muted/50 font-bold border-t-2">
              <TableCell></TableCell>
              <TableCell>TOTAL</TableCell>
              <TableCell className="text-right">{formatCLP(totals.budget_clp)}</TableCell>
              <TableCell className="text-right text-muted-foreground text-sm">
                {formatUF(convertToUF(totals.budget_clp))}
              </TableCell>
              <TableCell className="text-right text-orange-600">
                {formatCLP(totals.consumed_clp)}
              </TableCell>
              <TableCell className={`text-right ${totals.budget_clp - totals.consumed_clp < 0 ? "text-destructive" : "text-green-600"}`}>
                {formatCLP(totals.budget_clp - totals.consumed_clp)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Progress
                    value={totals.budget_clp > 0 ? Math.min((totals.consumed_clp / totals.budget_clp) * 100, 100) : 0}
                    className="h-2 flex-1"
                  />
                  <span className="text-xs w-10 text-right">
                    {totals.budget_clp > 0 ? ((totals.consumed_clp / totals.budget_clp) * 100).toFixed(0) : 0}%
                  </span>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
