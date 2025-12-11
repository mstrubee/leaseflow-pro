import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SurfaceData {
  superficie_terreno: number;
  superficie_edificada_local: number;
  superficie_showroom: number;
  superficie_bodega_backoffice: number;
  superficie_exterior_cubierto: number;
  superficie_exterior_descubierto: number;
  num_estacionamientos: number;
  metros_lineales_frente: number;
}

interface ContractSurfacesProps {
  data: SurfaceData;
  onChange: (data: SurfaceData) => void;
  readOnly?: boolean;
}

export const ContractSurfaces = ({ data, onChange, readOnly = false }: ContractSurfacesProps) => {
  const handleChange = (field: keyof SurfaceData, value: string) => {
    const numValue = parseFloat(value) || 0;
    const newData = { ...data, [field]: numValue };
    
    // Auto-calculate edificada local as sum of showroom + bodega/backoffice
    if (field === "superficie_showroom" || field === "superficie_bodega_backoffice") {
      newData.superficie_edificada_local = (newData.superficie_showroom || 0) + (newData.superficie_bodega_backoffice || 0);
    }
    
    // Auto-calculate exterior descubierto
    if (field !== "superficie_exterior_descubierto" && field !== "superficie_edificada_local") {
      newData.superficie_exterior_descubierto = Math.max(
        0,
        newData.superficie_terreno - newData.superficie_edificada_local - newData.superficie_exterior_cubierto
      );
    }
    
    onChange(newData);
  };

  const fields: { key: keyof SurfaceData; label: string; unit: string; calculated?: boolean }[] = [
    { key: "superficie_terreno", label: "Terreno", unit: "m²" },
    { key: "superficie_showroom", label: "Showroom", unit: "m²" },
    { key: "superficie_bodega_backoffice", label: "Bodega & Backoffice", unit: "m²" },
    { key: "superficie_edificada_local", label: "Edificada Local", unit: "m²", calculated: true },
    { key: "superficie_exterior_cubierto", label: "Exterior Cubierto", unit: "m²" },
    { key: "superficie_exterior_descubierto", label: "Exterior Descubierto", unit: "m²", calculated: true },
    { key: "num_estacionamientos", label: "Estacionamientos", unit: "unid." },
    { key: "metros_lineales_frente", label: "Metros Lineales Frente", unit: "mL" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Superficies y Datos</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {fields.map(({ key, label, unit, calculated }) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  step="0.01"
                  value={data[key] || 0}
                  onChange={(e) => handleChange(key, e.target.value)}
                  disabled={readOnly || calculated}
                  className={calculated ? "bg-muted" : ""}
                />
                <span className="text-xs text-muted-foreground w-8">{unit}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};