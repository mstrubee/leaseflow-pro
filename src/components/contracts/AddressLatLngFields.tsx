import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, RefreshCw, Lock } from "lucide-react";
import { geocodeAddress } from "@/lib/geocodeAddress";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  street: string;
  number: string;
  commune: string;
  region: string;
  lat: string;
  lng: string;
  geocodeSource: string;          // '' | 'nominatim' | 'manual'
  onLatChange: (v: string) => void;
  onLngChange: (v: string) => void;
  onGeocodeSource: (v: string) => void;
  /** Se llama cuando el geocoding automático obtiene nuevas coords */
  onAutoGeocoded?: (lat: number, lng: number) => void;
}

export function AddressLatLngFields({
  street,
  number,
  commune,
  region,
  lat,
  lng,
  geocodeSource,
  onLatChange,
  onLngChange,
  onGeocodeSource,
  onAutoGeocoded,
}: Props) {
  const { isAdmin } = useAuth();
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState(false);

  // Auto-geocode when address fields are complete enough
  useEffect(() => {
    // Only auto-geocode if no coords yet and we have enough data
    if (lat || lng) return;
    if (!street.trim() || !commune.trim()) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setGeocoding(true);
      setGeocodeError(false);
      const result = await geocodeAddress(street, number, commune, region);
      if (cancelled) return;
      setGeocoding(false);
      if (result) {
        onLatChange(result.lat.toFixed(7));
        onLngChange(result.lng.toFixed(7));
        onGeocodeSource("nominatim");
        onAutoGeocoded?.(result.lat, result.lng);
      } else {
        setGeocodeError(true);
      }
    }, 800); // debounce 800ms

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [street, number, commune, region]);

  async function handleManualGeocode() {
    if (!street.trim() || !commune.trim()) return;
    setGeocoding(true);
    setGeocodeError(false);
    const result = await geocodeAddress(street, number, commune, region);
    setGeocoding(false);
    if (result) {
      onLatChange(result.lat.toFixed(7));
      onLngChange(result.lng.toFixed(7));
      onGeocodeSource("nominatim");
      onAutoGeocoded?.(result.lat, result.lng);
    } else {
      setGeocodeError(true);
    }
  }

  const hasCoords = !!lat && !!lng;
  const isManual = geocodeSource === "manual";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <MapPin className="w-4 h-4 text-muted-foreground" />
        <Label className="text-sm font-medium">Coordenadas</Label>
        {geocoding && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        {hasCoords && !geocoding && (
          <span className={`text-[11px] px-1.5 py-0.5 rounded ${isManual ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
            {isManual ? "Manual" : "Geocodificado"}
          </span>
        )}
        {geocodeError && (
          <span className="text-[11px] text-red-500">No se pudo geocodificar</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="lat" className="text-xs text-muted-foreground">Latitud</Label>
          <Input
            id="lat"
            value={lat}
            onChange={(e) => {
              onLatChange(e.target.value);
              onGeocodeSource("manual");
            }}
            placeholder="-33.4567890"
            className="h-8 text-sm font-mono"
            readOnly={!isAdmin}
            title={!isAdmin ? "Solo administradores pueden editar las coordenadas" : undefined}
          />
        </div>
        <div>
          <Label htmlFor="lng" className="text-xs text-muted-foreground">Longitud</Label>
          <Input
            id="lng"
            value={lng}
            onChange={(e) => {
              onLngChange(e.target.value);
              onGeocodeSource("manual");
            }}
            placeholder="-70.6543210"
            className="h-8 text-sm font-mono"
            readOnly={!isAdmin}
            title={!isAdmin ? "Solo administradores pueden editar las coordenadas" : undefined}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Re-geocode button: always visible if address is filled */}
        {(street.trim() && commune.trim()) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleManualGeocode}
            disabled={geocoding}
          >
            <RefreshCw className={`w-3 h-3 ${geocoding ? "animate-spin" : ""}`} />
            {hasCoords ? "Re-geocodificar" : "Geocodificar"}
          </Button>
        )}
        {!isAdmin && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="w-3 h-3" />
            Edición manual solo para administradores
          </span>
        )}
      </div>
    </div>
  );
}
