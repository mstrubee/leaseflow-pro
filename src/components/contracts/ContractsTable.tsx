import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, AlertTriangle, ExternalLink } from "lucide-react";
import { ContractStatusActions } from "@/components/contracts/ContractStatusActions";
import { addMonths, format, subMonths, parseISO } from "date-fns";
import { es } from "date-fns/locale";

interface ContractVersion {
  regime_rent: number;
  duration_months: number;
  is_current: boolean;
  effective_date: string | null;
  notice_type: string;
  notice_value: string;
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
  contract_addresses: Array<{ region: string; commune: string }>;
  contract_versions: ContractVersion[];
}

interface ContractsTableProps {
  contracts: Contract[];
  isFirmadoView: boolean;
  onDelete: (e: React.MouseEvent, contract: Contract) => void;
  onUpdateField: (e: React.MouseEvent, contractId: string, field: string, value: string) => void;
  onRefresh: () => void;
}

export function ContractsTable({ 
  contracts, 
  isFirmadoView, 
  onDelete, 
  onUpdateField,
  onRefresh 
}: ContractsTableProps) {
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

    if (currentVersion.notice_type === "fecha") {
      return parseISO(currentVersion.notice_value);
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
            <TableHead className="font-semibold text-right">Canon</TableHead>
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
                  <span className="text-sm text-muted-foreground">
                    {address ? `${address.commune}` : "-"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-sm font-medium">
                    {currentVersion ? formatUF(currentVersion.regime_rent) : "-"}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <span className="text-sm text-muted-foreground">
                    {currentVersion ? `${currentVersion.duration_months}m` : "-"}
                  </span>
                </TableCell>
                {isFirmadoView && (
                  <>
                    <TableCell className="text-center">
                      <span className="text-sm">
                        {endDate ? formatDateShort(endDate) : "-"}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`text-sm ${isPastNotice ? "text-destructive font-medium" : ""}`}>
                        {noticeDeadline ? formatDateShort(noticeDeadline) : "-"}
                      </span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Select
                          value={contract.operation_status || "operando"}
                          onValueChange={(value) => onUpdateField({ stopPropagation: () => {} } as React.MouseEvent, contract.id, "operation_status", value)}
                        >
                          <SelectTrigger className="h-6 text-[10px] px-1.5 w-[70px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="operando" className="text-xs">Op.</SelectItem>
                            <SelectItem value="cerrado" className="text-xs">Cerr.</SelectItem>
                          </SelectContent>
                        </Select>
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
