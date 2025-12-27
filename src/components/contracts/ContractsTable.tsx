import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, AlertTriangle, FileCheck, FilePlus } from "lucide-react";
import { ContractStatusActions } from "@/components/contracts/ContractStatusActions";
import { addMonths, format, subMonths, parseISO, differenceInMonths, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";

interface TerminationNotice {
  id: string;
  notice_type: string;
  notice_date: string;
  document_url: string | null;
}

interface ContractVersion {
  id?: string;
  regime_rent: number;
  duration_months: number;
  is_current: boolean;
  effective_date: string | null;
  notice_type: string;
  notice_value: string;
  gastos_comunes_uf_m2: number | null;
  gastos_comunes_uf_ml_frente?: number | null;
  gastos_comunes_prorrata_kwh_clima?: number | null;
  fondo_promocion_percentage: number | null;
  adicional_administracion_percentage?: number | null;
  has_extended_gastos_comunes?: boolean | null;
  notice_ranges?: Array<{ start_month: number; end_month: number }>;
}

interface Contract {
  id: string;
  name: string;
  status: string;
  created_at: string;
  signed_date: string | null;
  operation_status: string | null;
  obra_status: string | null;
  patente_status: string | null;
  is_expired_but_operating: boolean | null;
  display_currency: string | null;
  contract_addresses: Array<{ region: string; commune: string }>;
  contract_versions: ContractVersion[];
  superficie_edificada_local: number | null;
  superficie_terreno: number | null;
  metros_lineales_frente?: number | null;
  termination_notices?: TerminationNotice[];
}

interface ContractsTableProps {
  contracts: Contract[];
  isFirmadoView: boolean;
  onDelete: (e: React.MouseEvent, contract: Contract) => void;
  onUpdateField: (e: React.MouseEvent, contractId: string, field: string, value: string) => void;
  onRefresh: () => void;
}

export function ContractsTable({ contracts, isFirmadoView, onDelete, onUpdateField, onRefresh }: ContractsTableProps) {
  const navigate = useNavigate();

  const calculateEndDate = (contract: Contract): Date | null => {
    const currentVersion = contract.contract_versions?.find((v) => v.is_current);
    if (!currentVersion) return null;

    const startDate = currentVersion.effective_date
      ? parseISO(currentVersion.effective_date)
      : contract.signed_date
        ? parseISO(contract.signed_date)
        : null;

    if (!startDate) return null;
    return addMonths(startDate, currentVersion.duration_months);
  };

  const calculateNoticeDeadline = (contract: Contract): Date | null => {
    const currentVersion = contract.contract_versions?.find((v) => v.is_current);
    if (!currentVersion) return null;

    const startDate = currentVersion.effective_date
      ? parseISO(currentVersion.effective_date)
      : contract.signed_date
        ? parseISO(contract.signed_date)
        : null;

    if (currentVersion.notice_type === "fecha" && currentVersion.notice_value) {
      return parseISO(currentVersion.notice_value);
    }

    if (currentVersion.notice_type === "rangos" && startDate) {
      const noticeRanges = currentVersion.notice_ranges || [];
      if (noticeRanges.length > 0) {
        const today = new Date();
        const sortedRanges = [...noticeRanges].sort((a, b) => a.start_month - b.start_month);
        
        for (const range of sortedRanges) {
          const rangeStartDate = addMonths(startDate, range.start_month - 1);
          if (rangeStartDate > today) {
            return rangeStartDate;
          }
        }
        
        if (sortedRanges.length > 0) {
          const lastRange = sortedRanges[sortedRanges.length - 1];
          return addMonths(startDate, lastRange.start_month - 1);
        }
      }
    }

    const endDate = calculateEndDate(contract);
    if (!endDate) return null;

    const noticeMonths = parseInt(currentVersion.notice_value) || 0;
    return subMonths(endDate, noticeMonths);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: { [key: string]: { label: string; className: string } } = {
      en_negociacion: { label: "En Negociación", className: "bg-yellow-500 text-white" },
      firmado: { label: "Vigente", className: "bg-green-500 text-white" },
      vencido: { label: "Vencido", className: "bg-red-500 text-white" },
    };

    const statusInfo = statusMap[status] || { label: status, className: "" };
    return <Badge className={`${statusInfo.className} text-xs`}>{statusInfo.label}</Badge>;
  };

  const formatUF = (amount: number) => {
    return `${amount.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} UF`;
  };

  const formatAmount = (amount: number, currency: string | null, ufValue: number = 39000) => {
    const displayCurrency = currency || "UF";
    if (displayCurrency === "CLP") {
      const clpAmount = amount * ufValue;
      return `$${clpAmount.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
    return `${amount.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} UF`;
  };

  const formatDateShort = (date: Date) => {
    return format(date, "dd/MM/yy", { locale: es });
  };

  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold">Contrato</TableHead>
            <TableHead className="font-semibold">Ubicación</TableHead>
            <TableHead className="font-semibold text-center min-w-[140px]"><div className="leading-tight">Costo<br/>Arriendo</div></TableHead>
            <TableHead className="font-semibold text-center">Duración</TableHead>
            {isFirmadoView && (
              <>
                <TableHead className="font-semibold text-center">Término</TableHead>
                <TableHead className="font-semibold text-center">Aviso</TableHead>
                <TableHead className="font-semibold text-center">Estado</TableHead>
              </>
            )}
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contracts.map((contract) => {
            const currentVersion = contract.contract_versions?.find((v) => v.is_current);
            const address = contract.contract_addresses?.[0];
            const endDate = calculateEndDate(contract);
            const noticeDeadline = calculateNoticeDeadline(contract);
            const isPastNotice = noticeDeadline && noticeDeadline < new Date();
            const isExpiredOperating = contract.status === "vencido" && contract.is_expired_but_operating;

            return (
              <TableRow
                key={contract.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => navigate(`/contracts/${contract.id}`)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="font-medium text-sm">{contract.name}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {getStatusBadge(isExpiredOperating ? "firmado" : contract.status)}
                        {isExpiredOperating && (
                          <Badge variant="destructive" className="text-[10px] px-1 py-0 gap-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            VENCIDO
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">{address ? `${address.commune}` : "-"}</span>
                </TableCell>
                <TableCell className="text-center min-w-[140px]">
                  {currentVersion ? (() => {
                    const superficie = contract.superficie_edificada_local || 0;
                    const metrosFrente = contract.metros_lineales_frente || 0;
                    const hasExtended = currentVersion.has_extended_gastos_comunes ?? false;
                    
                    // Gastos comunes: only include extended factors if flag is true
                    const gastosM2 = (currentVersion.gastos_comunes_uf_m2 || 0) * superficie;
                    const gastosMlFrente = hasExtended ? (currentVersion.gastos_comunes_uf_ml_frente || 0) * metrosFrente : 0;
                    const gastosKwhClima = hasExtended ? (currentVersion.gastos_comunes_prorrata_kwh_clima || 0) : 0;
                    const adicionalAdmin = hasExtended ? currentVersion.regime_rent * ((currentVersion.adicional_administracion_percentage || 0) / 100) : 0;
                    const gastosComunesTotal = gastosM2 + gastosMlFrente + gastosKwhClima + adicionalAdmin;
                    
                    // Fondo promoción
                    const fondoPromocionPct = currentVersion.fondo_promocion_percentage ?? 0;
                    const fondoPromocion = currentVersion.regime_rent * (fondoPromocionPct / 100);
                    
                    const total = currentVersion.regime_rent + gastosComunesTotal + fondoPromocion;
                    return (
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-medium">{formatAmount(total, contract.display_currency)}</span>
                        <div className="text-[9px] text-muted-foreground whitespace-nowrap">
                          <div>Canon: {formatAmount(currentVersion.regime_rent, contract.display_currency)}</div>
                          <div>GC: {formatAmount(gastosComunesTotal, contract.display_currency)}</div>
                          <div>F. Prom: {fondoPromocionPct > 0 ? formatAmount(fondoPromocion, contract.display_currency) : "-"}</div>
                        </div>
                      </div>
                    );
                  })() : "-"}
                </TableCell>
                <TableCell className="text-center">
                  <span className="text-sm text-muted-foreground">
                    {currentVersion ? `${currentVersion.duration_months}m` : "-"}
                  </span>
                </TableCell>
                {isFirmadoView && (
                  <>
                    <TableCell className="text-center">
                      <div className="flex flex-col">
                        <span className="text-sm">{endDate ? formatDateShort(endDate) : "-"}</span>
                        {endDate && currentVersion && (() => {
                          const startDate = currentVersion.effective_date
                            ? parseISO(currentVersion.effective_date)
                            : contract.signed_date
                              ? parseISO(contract.signed_date)
                              : null;
                          if (!startDate) return null;
                          const now = new Date();
                          const monthsElapsed = differenceInMonths(now, startDate);
                          const totalMonths = currentVersion.duration_months;
                          return <span className="text-[10px] text-muted-foreground">{monthsElapsed} de {totalMonths} meses</span>;
                        })()}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center">
                        <span className={`text-sm ${isPastNotice ? "text-destructive font-medium" : ""}`}>
                          {noticeDeadline ? formatDateShort(noticeDeadline) : "-"}
                        </span>
                        {noticeDeadline && (() => {
                          const now = new Date();
                          const monthsRemaining = differenceInMonths(noticeDeadline, now);
                          const daysRemaining = differenceInDays(noticeDeadline, now);
                          if (daysRemaining < 0) {
                            return <span className="text-[10px] text-destructive font-medium">Vencido</span>;
                          } else if (monthsRemaining < 1) {
                            return <span className="text-[10px] text-amber-600 font-medium">Faltan {daysRemaining} días</span>;
                          } else {
                            return <span className="text-[10px] text-muted-foreground">Faltan {monthsRemaining} meses</span>;
                          }
                        })()}
                        {/* Show termination notice if exists */}
                        {contract.termination_notices && contract.termination_notices.length > 0 && (
                          <div className="mt-1 flex flex-col gap-0.5">
                            {contract.termination_notices.map((notice) => (
                              <Badge 
                                key={notice.id} 
                                variant={notice.notice_type === 'sent' ? 'default' : 'secondary'}
                                className="text-[9px] px-1.5 py-0 gap-1"
                              >
                                {notice.notice_type === 'sent' ? (
                                  <><FilePlus className="h-2.5 w-2.5" /> Enviado {format(parseISO(notice.notice_date), "dd/MM/yy")}</>
                                ) : (
                                  <><FileCheck className="h-2.5 w-2.5" /> Recibido {format(parseISO(notice.notice_date), "dd/MM/yy")}</>
                                )}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col gap-1.5 items-center">
                        {/* Row 1: Operación & Obra */}
                        <div className="flex items-center gap-1.5 justify-center">
                          <div className="flex flex-col">
                            <span className="text-[9px] text-muted-foreground font-medium mb-0.5">Operación</span>
                            <Select
                              value={contract.operation_status || "operando"}
                              onValueChange={(value) =>
                                onUpdateField(
                                  { stopPropagation: () => {} } as React.MouseEvent,
                                  contract.id,
                                  "operation_status",
                                  value,
                                )
                              }
                            >
                              <SelectTrigger className="h-6 text-[10px] px-1.5 w-[85px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="operando" className="text-xs">
                                  Operando
                                </SelectItem>
                                <SelectItem value="cerrado" className="text-xs">
                                  Cerrado
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex flex-col">
                            <span className="text-[9px] text-muted-foreground font-medium mb-0.5">Obra</span>
                            <Select
                              value={contract.obra_status || "terminada"}
                              onValueChange={(value) =>
                                onUpdateField(
                                  { stopPropagation: () => {} } as React.MouseEvent,
                                  contract.id,
                                  "obra_status",
                                  value,
                                )
                              }
                            >
                              <SelectTrigger className="h-6 text-[10px] px-1.5 w-[100px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="terminada" className="text-xs">
                                  Terminada
                                </SelectItem>
                                <SelectItem value="construccion" className="text-xs">
                                  Construcción
                                </SelectItem>
                                <SelectItem value="remodelacion" className="text-xs">
                                  Remodelación
                                </SelectItem>
                                <SelectItem value="ampliacion" className="text-xs">
                                  Ampliación
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Row 2: Patente & Proyecto */}
                        <div className="flex items-center gap-1.5 justify-center">
                          <div className="flex flex-col">
                            <span className="text-[9px] text-muted-foreground font-medium mb-0.5">Patente</span>
                            <Select
                              value={contract.patente_status || "sin_patente"}
                              onValueChange={(value) =>
                                onUpdateField(
                                  { stopPropagation: () => {} } as React.MouseEvent,
                                  contract.id,
                                  "patente_status",
                                  value,
                                )
                              }
                            >
                              <SelectTrigger className="h-6 text-[10px] px-1.5 w-[85px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="sin_patente" className="text-xs">
                                  Sin Patente
                                </SelectItem>
                                <SelectItem value="provisoria" className="text-xs">
                                  Provisoria
                                </SelectItem>
                                <SelectItem value="definitiva" className="text-xs">
                                  Definitiva
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex flex-col">
                            <span className="text-[9px] text-muted-foreground font-medium mb-0.5">Proyecto</span>
                            <Select
                              value={(contract as any).proyecto_status || "sin_proyecto"}
                              onValueChange={(value) =>
                                onUpdateField(
                                  { stopPropagation: () => {} } as React.MouseEvent,
                                  contract.id,
                                  "proyecto_status",
                                  value,
                                )
                              }
                            >
                              <SelectTrigger className="h-6 text-[10px] px-1.5 w-[100px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="sin_proyecto" className="text-xs">
                                  Sin Proyecto
                                </SelectItem>
                                <SelectItem value="en_curso" className="text-xs">
                                  En Curso
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  </>
                )}
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => onDelete(e, contract)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
