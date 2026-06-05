import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Save,
  FileDown,
  FileSpreadsheet,
  RotateCcw,
  TrendingUp,
  DollarSign,
  CalendarClock,
  Wallet,
  Percent,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { toast } from "sonner";
import { useBusinessCase } from "@/hooks/useBusinessCase";
import { ContractSeed, BusinessCaseInputs } from "@/lib/businessCase/calc";
import { fmtMM, fmtPct, fmtUf } from "@/lib/businessCase/format";
import { exportBusinessCaseExcel } from "@/lib/businessCase/exportExcel";
import { exportBusinessCasePDF } from "@/lib/businessCase/exportPDF";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  seed: ContractSeed;
  canEdit: boolean;
}

const NumField = ({
  label,
  value,
  onChange,
  disabled,
  step = "any",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  step?: string;
}) => (
  <div className="space-y-1">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    <Input
      type="number"
      step={step}
      value={Number.isFinite(value) ? value : 0}
      disabled={disabled}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="h-8"
    />
  </div>
);

const TextField = ({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) => (
  <div className="space-y-1">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    <Input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-8" />
  </div>
);

export function BusinessCaseFinanciero({ open, onOpenChange, contractId, seed, canEdit }: Props) {
  const {
    inputs,
    result,
    loading,
    saving,
    dirty,
    updateInput,
    updateArrayInput,
    resetToDefaults,
    save,
  } = useBusinessCase({ contractId, seed, enabled: open });

  const chartData = useMemo(() => {
    if (!result) return [];
    return result.years.map((y) => ({
      year: String(y.year),
      Ingresos: Math.round(y.ingresos * 10) / 10,
      EBITDA: Math.round(y.ebitda * 10) / 10,
      Flujo: Math.round(y.flujoOperativo * 10) / 10,
      Acumulado: Math.round(y.flujoAcumulado * 10) / 10,
    }));
  }, [result]);

  const handleSave = async () => {
    try {
      await save();
      toast.success("Business case guardado");
    } catch {
      toast.error("No se pudo guardar el business case");
    }
  };

  const set = <K extends keyof BusinessCaseInputs>(k: K) => (v: BusinessCaseInputs[K]) => updateInput(k, v);

  const kpis = result
    ? [
        { icon: TrendingUp, label: "TIR", value: result.tir != null ? fmtPct(result.tir, 1) : "N/A" },
        { icon: DollarSign, label: "VAN", value: `MM$ ${fmtMM(result.van)}` },
        {
          icon: CalendarClock,
          label: "Payback",
          value: result.paybackAnios != null ? `${fmtMM(result.paybackAnios)} años` : "N/A",
        },
        { icon: Wallet, label: "Inversión total", value: `MM$ ${fmtMM(result.inversionTotal)}` },
        { icon: Percent, label: "Canon", value: fmtUf(result.canonUfMensual) },
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-4">
            <span>Business Case Financiero</span>
            <div className="flex items-center gap-2 pr-6">
              <Button
                size="sm"
                variant="outline"
                disabled={!result}
                onClick={() => inputs && result && exportBusinessCasePDF(inputs, result)}
              >
                <FileDown className="h-4 w-4 mr-1" /> PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!result}
                onClick={() => inputs && result && exportBusinessCaseExcel(inputs, result)}
              >
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
              </Button>
              {canEdit && (
                <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  Guardar
                </Button>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {loading || !inputs || !result ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="resultados" className="w-full">
            <TabsList>
              <TabsTrigger value="resultados">Resultados</TabsTrigger>
              <TabsTrigger value="datos">Datos & Supuestos</TabsTrigger>
              <TabsTrigger value="pl">Estado de Resultados</TabsTrigger>
            </TabsList>

            {/* ---------- RESULTADOS ---------- */}
            <TabsContent value="resultados" className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {kpis.map((k) => (
                  <Card key={k.label}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                        <k.icon className="h-4 w-4" />
                        {k.label}
                      </div>
                      <div className="text-xl font-bold text-primary">{k.value}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardContent className="p-4">
                    <h4 className="text-sm font-semibold mb-3">Ingresos vs EBITDA (MM$)</h4>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="year" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip />
                        <Bar dataKey="Ingresos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="EBITDA" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <h4 className="text-sm font-semibold mb-3">Flujo acumulado (MM$)</h4>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="year" fontSize={12} />
                        <YAxis fontSize={12} />
                        <Tooltip />
                        <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="Flujo" stroke="hsl(var(--muted-foreground))" strokeWidth={2} />
                        <Line type="monotone" dataKey="Acumulado" stroke="hsl(var(--primary))" strokeWidth={2.5} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ---------- DATOS ---------- */}
            <TabsContent value="datos" className="space-y-6">
              {!canEdit && (
                <p className="text-xs text-muted-foreground">
                  Solo lectura. Los administradores pueden editar y guardar.
                </p>
              )}
              <section className="space-y-3">
                <h4 className="text-sm font-semibold">Ficha</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <TextField label="Nombre" value={inputs.nombre} onChange={set("nombre")} disabled={!canEdit} />
                  <TextField label="Dirección" value={inputs.direccion} onChange={set("direccion")} disabled={!canEdit} />
                  <TextField label="Comuna" value={inputs.comuna} onChange={set("comuna")} disabled={!canEdit} />
                  <TextField label="Empresa" value={inputs.empresa} onChange={set("empresa")} disabled={!canEdit} />
                  <TextField label="Tipo" value={inputs.tipo} onChange={set("tipo")} disabled={!canEdit} />
                </div>
              </section>

              <section className="space-y-3">
                <h4 className="text-sm font-semibold">Contrato</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <NumField label="Superficie (m²)" value={inputs.superficieM2} onChange={set("superficieM2")} disabled={!canEdit} />
                  <NumField label="Valor UF / m²" value={inputs.valorUfM2} onChange={set("valorUfM2")} disabled={!canEdit} />
                  <NumField label="Canon (UF/mes)" value={inputs.canonUf} onChange={set("canonUf")} disabled={!canEdit} />
                  <NumField label="Gasto común (UF/mes)" value={inputs.gastoComunUf} onChange={set("gastoComunUf")} disabled={!canEdit} />
                  <NumField label="Plazo (años)" value={inputs.plazoAnios} onChange={set("plazoAnios")} disabled={!canEdit} />
                  <NumField label="Garantía (UF)" value={inputs.garantiaUf} onChange={set("garantiaUf")} disabled={!canEdit} />
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Fecha entrega</Label>
                    <Input
                      type="date"
                      value={inputs.fechaEntrega}
                      disabled={!canEdit}
                      onChange={(e) => updateInput("fechaEntrega", e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <NumField label="Gracia (meses)" value={inputs.graciaMeses} onChange={set("graciaMeses")} disabled={!canEdit} />
                </div>
              </section>

              <section className="space-y-3">
                <h4 className="text-sm font-semibold">Económico</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <NumField label="UF actual (CLP)" value={inputs.ufActual} onChange={set("ufActual")} disabled={!canEdit} />
                  <NumField label="Crecim. UF anual" value={inputs.ufCrecimientoAnual} onChange={set("ufCrecimientoAnual")} disabled={!canEdit} />
                  <NumField label="Tasa descuento" value={inputs.tasaDescuento} onChange={set("tasaDescuento")} disabled={!canEdit} />
                  <NumField label="Impuesto" value={inputs.impuestoPct} onChange={set("impuestoPct")} disabled={!canEdit} />
                </div>
              </section>

              <section className="space-y-3">
                <h4 className="text-sm font-semibold">Inversiones (CLP)</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <NumField label="Habilitación" value={inputs.invHabilitacion} onChange={set("invHabilitacion")} disabled={!canEdit} />
                  <NumField label="Mobiliario" value={inputs.invMobiliario} onChange={set("invMobiliario")} disabled={!canEdit} />
                  <NumField label="Inventario" value={inputs.invInventario} onChange={set("invInventario")} disabled={!canEdit} />
                  <NumField label="Tecnología" value={inputs.invTecnologia} onChange={set("invTecnologia")} disabled={!canEdit} />
                  <NumField label="Marketing" value={inputs.invMarketing} onChange={set("invMarketing")} disabled={!canEdit} />
                  <NumField label="Depreciación anual (MM$)" value={inputs.depreciacionAnualMM} onChange={set("depreciacionAnualMM")} disabled={!canEdit} />
                </div>
              </section>

              <section className="space-y-3">
                <h4 className="text-sm font-semibold">Operación</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <NumField label="Margen directo %" value={inputs.margenDirectoPct} onChange={set("margenDirectoPct")} disabled={!canEdit} />
                  <NumField label="Otros costos dir. %" value={inputs.otrosCostosDirectosPct} onChange={set("otrosCostosDirectosPct")} disabled={!canEdit} />
                  <NumField label="Costos variables %" value={inputs.costosVariablesPct} onChange={set("costosVariablesPct")} disabled={!canEdit} />
                  <NumField label="Tecnología % ventas" value={inputs.tecnologiaPctVentas} onChange={set("tecnologiaPctVentas")} disabled={!canEdit} />
                  <NumField label="Ocupación % ventas" value={inputs.ocupacionPctVentas} onChange={set("ocupacionPctVentas")} disabled={!canEdit} />
                </div>
                <div className="space-y-2">
                  <ArrayEditor label="Venta/mes (MM$)" values={inputs.ventaMesMM} field="ventaMesMM" years={result.years.map((y) => y.year)} onChange={updateArrayInput} disabled={!canEdit} />
                  <ArrayEditor label="Gasto personal (MM$)" values={inputs.gastoPersonalMM} field="gastoPersonalMM" years={result.years.map((y) => y.year)} onChange={updateArrayInput} disabled={!canEdit} />
                  <ArrayEditor label="Publicidad (MM$)" values={inputs.publicidadMM} field="publicidadMM" years={result.years.map((y) => y.year)} onChange={updateArrayInput} disabled={!canEdit} />
                  <ArrayEditor label="Gastos generales (MM$)" values={inputs.gastosGeneralesMM} field="gastosGeneralesMM" years={result.years.map((y) => y.year)} onChange={updateArrayInput} disabled={!canEdit} />
                </div>
              </section>

              {canEdit && (
                <Button variant="outline" size="sm" onClick={resetToDefaults}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Restablecer valores
                </Button>
              )}
            </TabsContent>

            {/* ---------- P&L ---------- */}
            <TabsContent value="pl">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Concepto (MM$)</TableHead>
                      {result.years.map((y) => (
                        <TableHead key={y.year} className="text-right">{y.year}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[
                      { l: "Ingresos", f: (y: typeof result.years[number]) => y.ingresos },
                      { l: "Costo de ventas", f: (y: typeof result.years[number]) => y.costoVentas },
                      { l: "Margen de contribución", f: (y: typeof result.years[number]) => y.margenContribucion, bold: true },
                      { l: "Gasto personal", f: (y: typeof result.years[number]) => y.gastoPersonal },
                      { l: "Publicidad", f: (y: typeof result.years[number]) => y.publicidad },
                      { l: "Gastos generales", f: (y: typeof result.years[number]) => y.gastosGenerales },
                      { l: "Tecnología", f: (y: typeof result.years[number]) => y.tecnologia },
                      { l: "Ocupación", f: (y: typeof result.years[number]) => y.ocupacion },
                      { l: "Canon", f: (y: typeof result.years[number]) => y.canon },
                      { l: "Gasto común", f: (y: typeof result.years[number]) => y.gastoComun },
                      { l: "EBITDA", f: (y: typeof result.years[number]) => y.ebitda, bold: true },
                      { l: "Depreciación", f: (y: typeof result.years[number]) => y.depreciacion },
                      { l: "EBIT", f: (y: typeof result.years[number]) => y.ebit, bold: true },
                      { l: "Impuesto", f: (y: typeof result.years[number]) => y.impuesto },
                      { l: "UDI", f: (y: typeof result.years[number]) => y.udi },
                      { l: "Flujo operativo", f: (y: typeof result.years[number]) => y.flujoOperativo, bold: true },
                      { l: "Flujo acumulado", f: (y: typeof result.years[number]) => y.flujoAcumulado, bold: true },
                    ].map((row) => (
                      <TableRow key={row.l} className={row.bold ? "bg-muted/50 font-semibold" : ""}>
                        <TableCell>{row.l}</TableCell>
                        {result.years.map((y) => (
                          <TableCell key={y.year} className="text-right tabular-nums">
                            {fmtMM(row.f(y))}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ArrayEditor({
  label,
  values,
  field,
  years,
  onChange,
  disabled,
}: {
  label: string;
  values: number[];
  field: keyof BusinessCaseInputs;
  years: number[];
  onChange: (field: keyof BusinessCaseInputs, index: number, value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="grid grid-cols-5 gap-2 mt-1">
        {years.map((yr, i) => (
          <div key={yr} className="space-y-0.5">
            <span className="text-[10px] text-muted-foreground">{yr}</span>
            <Input
              type="number"
              step="any"
              value={Number.isFinite(values[i]) ? values[i] : 0}
              disabled={disabled}
              onChange={(e) => onChange(field, i, parseFloat(e.target.value) || 0)}
              className="h-8"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
