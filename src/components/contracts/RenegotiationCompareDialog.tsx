import { useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRight, TrendingUp, TrendingDown, Minus, CheckCircle2, Download } from "lucide-react";
import { RenegotiationDraft } from "@/hooks/useRenegotiationDrafts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface CompareItem {
  type: "current" | "draft" | "version";
  id: string;
  name: string;
  data: any;
  escalations?: Array<{ month_number: number; amount: number }>;
}

interface RenegotiationCompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CompareItem[];
  contractName?: string;
}

export function RenegotiationCompareDialog({
  open,
  onOpenChange,
  items,
  contractName = "Contrato",
}: RenegotiationCompareDialogProps) {
  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return "-";
    return `UF ${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercentage = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "-";
    return `${value}%`;
  };

  const formatMonths = (months: number | null | undefined) => {
    if (months === null || months === undefined) return "-";
    return `${months} meses`;
  };

  const getChangeIndicator = (current: number | null | undefined, proposed: number | null | undefined) => {
    if (current === null || current === undefined || proposed === null || proposed === undefined) {
      return null;
    }
    if (proposed > current) {
      const percentChange = ((proposed - current) / current * 100).toFixed(1);
      return (
        <span className="flex items-center text-xs text-green-600">
          <TrendingUp className="h-3 w-3 mr-1" />
          +{percentChange}%
        </span>
      );
    } else if (proposed < current) {
      const percentChange = ((current - proposed) / current * 100).toFixed(1);
      return (
        <span className="flex items-center text-xs text-red-600">
          <TrendingDown className="h-3 w-3 mr-1" />
          -{percentChange}%
        </span>
      );
    }
    return (
      <span className="flex items-center text-xs text-muted-foreground">
        <Minus className="h-3 w-3 mr-1" />
        Sin cambio
      </span>
    );
  };

  const getChangeText = (current: number | null | undefined, proposed: number | null | undefined): string => {
    if (current === null || current === undefined || proposed === null || proposed === undefined) {
      return "";
    }
    if (proposed > current) {
      const percentChange = ((proposed - current) / current * 100).toFixed(1);
      return ` (+${percentChange}%)`;
    } else if (proposed < current) {
      const percentChange = ((current - proposed) / current * 100).toFixed(1);
      return ` (-${percentChange}%)`;
    }
    return "";
  };

  const fields = [
    { key: "initial_rent", label: "Canon Inicial", format: formatCurrency },
    { key: "regime_rent", label: "Canon Régimen", format: formatCurrency },
    { key: "variable_rent_percentage", label: "Arriendo Variable", format: formatPercentage },
    { key: "duration_months", label: "Duración", format: formatMonths },
    { key: "notice_value", label: "Aviso", format: (v: any, item: CompareItem) => 
      item.data.notice_type === "meses" ? `${v} meses` : v 
    },
    { key: "guarantee_multiplier", label: "Multiplicador Garantía", format: (v: number) => v ? `${v}x` : "-" },
    { key: "grace_months", label: "Meses de Gracia", format: formatMonths },
    { key: "gastos_comunes_uf_m2", label: "GGCC (UF/m²)", format: formatCurrency },
    { key: "gastos_comunes_percentage", label: "GGCC (%)", format: formatPercentage },
    { key: "fondo_promocion_percentage", label: "Fondo Promoción", format: formatPercentage },
    { key: "otros_egresos_amount", label: "Otros Egresos", format: formatCurrency },
  ];

  const baseItem = items[0];

  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Comparación de Condiciones Comerciales`, pageWidth / 2, 20, { align: "center" });
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(contractName, pageWidth / 2, 28, { align: "center" });
    
    doc.setFontSize(10);
    doc.text(`Fecha: ${new Date().toLocaleDateString("es-CL")}`, pageWidth / 2, 35, { align: "center" });

    // Build table data
    const headers = ["Campo", ...items.map(item => {
      const typeLabel = item.type === "current" ? "(Actual) " : item.type === "version" ? "(Versión) " : "(Borrador) ";
      return typeLabel + item.name;
    })];

    const tableData: string[][] = [];

    // Add field rows
    fields.forEach((field) => {
      const row = [field.label];
      items.forEach((item, index) => {
        const value = item.data[field.key];
        let formatted = String(field.format(value, item));
        if (index > 0 && typeof value === "number" && typeof baseItem.data[field.key] === "number") {
          formatted += getChangeText(baseItem.data[field.key], value);
        }
        row.push(formatted);
      });
      tableData.push(row);
    });

    // Add escalations row
    const escalationsRow = ["Escalonamientos"];
    items.forEach((item) => {
      if (item.escalations && item.escalations.length > 0) {
        const escalationText = item.escalations
          .map((esc) => `Mes ${esc.month_number}: ${formatCurrency(esc.amount)}`)
          .join("\n");
        escalationsRow.push(escalationText);
      } else {
        escalationsRow.push("Sin escalonamientos");
      }
    });
    tableData.push(escalationsRow);

    // Add periodic adjustments row
    const adjustmentsRow = ["Ajustes Periódicos"];
    items.forEach((item) => {
      if (item.data.has_periodic_adjustments) {
        const adjustmentText = [
          `Inicio: Mes ${item.data.first_adjustment_month}`,
          `Cada: ${item.data.adjustment_periodicity_months} meses`,
          `Valor: ${item.data.adjustment_type === "percentage" 
            ? `${item.data.adjustment_value}%` 
            : formatCurrency(item.data.adjustment_value)}`
        ].join("\n");
        adjustmentsRow.push(adjustmentText);
      } else {
        adjustmentsRow.push("Sin ajustes");
      }
    });
    tableData.push(adjustmentsRow);

    // Generate table
    autoTable(doc, {
      head: [headers],
      body: tableData,
      startY: 42,
      styles: {
        fontSize: 9,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: 255,
        fontStyle: "bold",
      },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 40 },
      },
      alternateRowStyles: {
        fillColor: [245, 247, 250],
      },
    });

    // Save PDF
    const fileName = `Comparacion_${contractName.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
    doc.save(fileName);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh]">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Comparar Condiciones</DialogTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPDF}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Descargar PDF
          </Button>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="grid gap-4" style={{ gridTemplateColumns: `200px repeat(${items.length}, 1fr)` }}>
            {/* Header row */}
            <div className="font-medium text-sm text-muted-foreground p-2">Campo</div>
            {items.map((item, index) => (
              <Card key={item.id} className={item.type === "current" ? "border-primary/50 bg-primary/5" : ""}>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {item.type === "current" && (
                      <Badge variant="default" className="text-xs">Actual</Badge>
                    )}
                    {item.type === "version" && (
                      <Badge variant="secondary" className="text-xs">Versión</Badge>
                    )}
                    {item.name}
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}

            {/* Data rows */}
            {fields.map((field) => (
              <>
                <div key={`label-${field.key}`} className="text-sm font-medium p-2 flex items-center border-b">
                  {field.label}
                </div>
                {items.map((item, index) => {
                  const value = item.data[field.key];
                  const formatted = field.format(value, item);
                  const showChange = index > 0 && baseItem;
                  
                  return (
                    <div
                      key={`${item.id}-${field.key}`}
                      className={`p-2 border-b ${item.type === "current" ? "bg-primary/5" : ""}`}
                    >
                      <div className="text-sm font-medium">{formatted}</div>
                      {showChange && typeof value === "number" && typeof baseItem.data[field.key] === "number" && (
                        <div className="mt-1">
                          {getChangeIndicator(baseItem.data[field.key], value)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            ))}

            {/* Escalations row */}
            <div className="text-sm font-medium p-2 flex items-center border-b">
              Escalonamientos
            </div>
            {items.map((item) => (
              <div
                key={`${item.id}-escalations`}
                className={`p-2 border-b ${item.type === "current" ? "bg-primary/5" : ""}`}
              >
                {item.escalations && item.escalations.length > 0 ? (
                  <div className="space-y-1">
                    {item.escalations.map((esc) => (
                      <div key={esc.month_number} className="text-xs">
                        Mes {esc.month_number}: {formatCurrency(esc.amount)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Sin escalonamientos</span>
                )}
              </div>
            ))}

            {/* Periodic adjustments row */}
            <div className="text-sm font-medium p-2 flex items-center border-b">
              Ajustes Periódicos
            </div>
            {items.map((item) => (
              <div
                key={`${item.id}-adjustments`}
                className={`p-2 border-b ${item.type === "current" ? "bg-primary/5" : ""}`}
              >
                {item.data.has_periodic_adjustments ? (
                  <div className="text-xs space-y-1">
                    <div>Inicio: Mes {item.data.first_adjustment_month}</div>
                    <div>Cada: {item.data.adjustment_periodicity_months} meses</div>
                    <div>
                      Valor: {item.data.adjustment_type === "percentage" 
                        ? `${item.data.adjustment_value}%` 
                        : formatCurrency(item.data.adjustment_value)}
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Sin ajustes</span>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
