import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export interface ContractDataForBC {
  ufValue: number;
  canonUF: number;
  arriendoTotalUF: number;
  superficieM2: number;
  duracionAnios: number;
  garantiaUF: number;
  gastosComunesUF: number;
  ubicacion: string;
  empresa: string;
}

interface ContractDataPanelProps {
  contractData: ContractDataForBC;
  onRefresh?: () => void;
}

export const ContractDataPanel: React.FC<ContractDataPanelProps> = ({
  contractData,
  onRefresh
}) => {
  const dataItems = [
    { label: "Valor UF", value: contractData.ufValue, format: (v: number) => `$ ${v.toLocaleString('es-CL', { maximumFractionDigits: 2 })}` },
    { label: "Canon", value: contractData.canonUF, format: (v: number) => `UF ${v.toFixed(2)}` },
    { label: "Arriendo Total", value: contractData.arriendoTotalUF, format: (v: number) => `UF ${v.toFixed(2)}` },
    { label: "Gastos Comunes", value: contractData.gastosComunesUF, format: (v: number) => `UF ${v.toFixed(2)}` },
    { label: "Superficie", value: contractData.superficieM2, format: (v: number) => `${v} m²` },
    { label: "Duración", value: contractData.duracionAnios, format: (v: number) => `${v} años` },
    { label: "Garantía", value: contractData.garantiaUF, format: (v: number) => `UF ${v.toFixed(0)}` },
  ];

  const handleCopyValue = (value: number, label: string) => {
    navigator.clipboard.writeText(String(value));
    toast.success(`${label} copiado al portapapeles`);
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Datos del Contrato</CardTitle>
          {onRefresh && (
            <Button variant="ghost" size="icon" onClick={onRefresh} className="h-7 w-7">
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Click en "Copiar" para usar el valor
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {contractData.ubicacion && (
          <div className="p-2 bg-muted/50 rounded-md">
            <p className="text-xs text-muted-foreground">Ubicación</p>
            <p className="text-sm font-medium truncate">{contractData.ubicacion}</p>
          </div>
        )}
        
        {contractData.empresa && (
          <div className="p-2 bg-muted/50 rounded-md">
            <p className="text-xs text-muted-foreground">Empresa</p>
            <p className="text-sm font-medium">{contractData.empresa}</p>
          </div>
        )}

        <div className="border-t pt-2 mt-2">
          <p className="text-xs font-medium text-muted-foreground mb-2">Valores</p>
          <div className="space-y-1.5">
            {dataItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between p-2 bg-muted/30 rounded-md hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-medium">{item.format(item.value)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => handleCopyValue(item.value, item.label)}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copiar
                </Button>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
