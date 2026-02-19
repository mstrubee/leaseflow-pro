import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X, ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface InfluenceZone {
  region: string;
  commune: string | null;
}

interface InfluenceZoneSelectProps {
  value: InfluenceZone[];
  onChange: (zones: InfluenceZone[]) => void;
}

interface RegionData {
  region: string;
  communes: string[];
}

export const InfluenceZoneSelect = ({ value, onChange }: InfluenceZoneSelectProps) => {
  const [regions, setRegions] = useState<RegionData[]>([]);
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRegions();
  }, []);

  const loadRegions = async () => {
    const { data } = await supabase
      .from("contract_addresses")
      .select("region, commune")
      .not("region", "is", null)
      .order("region")
      .order("commune");

    if (data) {
      const grouped = new Map<string, Set<string>>();
      data.forEach(({ region, commune }) => {
        if (!grouped.has(region)) grouped.set(region, new Set());
        if (commune) grouped.get(region)!.add(commune);
      });
      setRegions(
        Array.from(grouped.entries()).map(([region, communes]) => ({
          region,
          communes: Array.from(communes).sort(),
        }))
      );
    }
    setLoading(false);
  };

  const isRegionFullySelected = (region: string) =>
    value.some((z) => z.region === region && z.commune === null);

  const isCommuneSelected = (region: string, commune: string) =>
    value.some((z) => z.region === region && (z.commune === commune || z.commune === null));

  const toggleRegion = (region: string) => {
    if (isRegionFullySelected(region)) {
      onChange(value.filter((z) => z.region !== region));
    } else {
      const withoutRegion = value.filter((z) => z.region !== region);
      onChange([...withoutRegion, { region, commune: null }]);
    }
  };

  const toggleCommune = (region: string, commune: string) => {
    if (isRegionFullySelected(region)) {
      // Deselecting a commune from a fully-selected region: replace with individual communes minus this one
      const regionData = regions.find((r) => r.region === region);
      if (!regionData) return;
      const withoutRegion = value.filter((z) => z.region !== region);
      const otherCommunes = regionData.communes
        .filter((c) => c !== commune)
        .map((c) => ({ region, commune: c }));
      onChange([...withoutRegion, ...otherCommunes]);
    } else if (value.some((z) => z.region === region && z.commune === commune)) {
      onChange(value.filter((z) => !(z.region === region && z.commune === commune)));
    } else {
      const updated = [...value, { region, commune }];
      // Check if all communes are now selected → upgrade to full region
      const regionData = regions.find((r) => r.region === region);
      if (regionData) {
        const selectedCommunes = updated.filter((z) => z.region === region && z.commune !== null);
        if (selectedCommunes.length >= regionData.communes.length) {
          const withoutRegion = updated.filter((z) => z.region !== region);
          onChange([...withoutRegion, { region, commune: null }]);
          return;
        }
      }
      onChange(updated);
    }
  };

  const removeZone = (zone: InfluenceZone) => {
    if (zone.commune === null) {
      onChange(value.filter((z) => z.region !== zone.region));
    } else {
      onChange(value.filter((z) => !(z.region === zone.region && z.commune === zone.commune)));
    }
  };

  const toggleExpand = (region: string) => {
    setExpandedRegions((prev) => {
      const next = new Set(prev);
      next.has(region) ? next.delete(region) : next.add(region);
      return next;
    });
  };

  if (loading) return <p className="text-sm text-muted-foreground">Cargando ubicaciones...</p>;

  if (regions.length === 0)
    return <p className="text-sm text-muted-foreground">No hay ubicaciones disponibles</p>;

  // Build display badges
  const badges: { label: string; zone: InfluenceZone }[] = value.map((z) => ({
    label: z.commune ? `${z.commune}, ${z.region}` : z.region,
    zone: z,
  }));

  return (
    <div className="space-y-3">
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {badges.map((b, i) => (
            <Badge key={i} variant="secondary" className="gap-1 text-xs">
              <MapPin className="h-3 w-3" />
              {b.label}
              <button type="button" onClick={() => removeZone(b.zone)}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="border rounded-md max-h-60 overflow-y-auto p-2 space-y-1">
        {regions.map((r) => (
          <Collapsible
            key={r.region}
            open={expandedRegions.has(r.region)}
            onOpenChange={() => toggleExpand(r.region)}
          >
            <div className="flex items-center gap-2 py-1 px-1 hover:bg-muted/50 rounded">
              <Checkbox
                checked={isRegionFullySelected(r.region)}
                onCheckedChange={() => toggleRegion(r.region)}
              />
              <CollapsibleTrigger className="flex items-center gap-1 flex-1 text-sm font-medium text-left">
                {expandedRegions.has(r.region) ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                {r.region}
                <span className="text-muted-foreground font-normal">({r.communes.length})</span>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              <div className="ml-8 space-y-0.5 pb-1">
                {r.communes.map((commune) => (
                  <label
                    key={commune}
                    className="flex items-center gap-2 py-0.5 px-1 hover:bg-muted/50 rounded cursor-pointer text-sm"
                  >
                    <Checkbox
                      checked={isCommuneSelected(r.region, commune)}
                      onCheckedChange={() => toggleCommune(r.region, commune)}
                    />
                    {commune}
                  </label>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </div>
  );
};
