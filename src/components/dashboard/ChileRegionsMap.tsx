import { useState } from "react";
import { motion } from "framer-motion";

// Chile regions data with SVG paths (simplified polygons representing each region)
// Ordered from North to South
export const CHILE_REGIONS = [
  { id: "arica", name: "Arica y Parinacota", numeral: "XV", path: "M 85 0 L 100 0 L 100 15 L 90 20 L 80 15 Z" },
  { id: "tarapaca", name: "Tarapacá", numeral: "I", path: "M 80 15 L 90 20 L 100 15 L 100 45 L 85 50 L 75 40 Z" },
  { id: "antofagasta", name: "Antofagasta", numeral: "II", path: "M 75 40 L 85 50 L 100 45 L 100 100 L 80 105 L 65 90 Z" },
  { id: "atacama", name: "Atacama", numeral: "III", path: "M 65 90 L 80 105 L 100 100 L 100 140 L 70 145 L 55 130 Z" },
  { id: "coquimbo", name: "Coquimbo", numeral: "IV", path: "M 55 130 L 70 145 L 100 140 L 100 175 L 60 180 L 45 165 Z" },
  { id: "valparaiso", name: "Valparaíso", numeral: "V", path: "M 45 165 L 60 180 L 100 175 L 100 200 L 70 205 L 55 195 L 40 190 Z" },
  { id: "metropolitana", name: "Metropolitana de Santiago", numeral: "RM", path: "M 70 205 L 100 200 L 100 220 L 75 225 L 65 215 Z" },
  { id: "ohiggins", name: "O'Higgins", numeral: "VI", path: "M 55 195 L 65 215 L 75 225 L 100 220 L 100 250 L 65 255 L 50 240 Z" },
  { id: "maule", name: "Maule", numeral: "VII", path: "M 50 240 L 65 255 L 100 250 L 100 295 L 60 300 L 45 280 Z" },
  { id: "nuble", name: "Ñuble", numeral: "XVI", path: "M 45 280 L 60 300 L 100 295 L 100 320 L 55 325 L 40 310 Z" },
  { id: "biobio", name: "Biobío", numeral: "VIII", path: "M 40 310 L 55 325 L 100 320 L 100 360 L 50 365 L 35 345 Z" },
  { id: "araucania", name: "La Araucanía", numeral: "IX", path: "M 35 345 L 50 365 L 100 360 L 100 400 L 45 405 L 30 385 Z" },
  { id: "losrios", name: "Los Ríos", numeral: "XIV", path: "M 30 385 L 45 405 L 100 400 L 100 430 L 40 435 L 25 415 Z" },
  { id: "loslagos", name: "Los Lagos", numeral: "X", path: "M 25 415 L 40 435 L 100 430 L 100 500 L 35 510 L 20 480 Z" },
  { id: "aysen", name: "Aysén", numeral: "XI", path: "M 20 480 L 35 510 L 100 500 L 100 600 L 30 610 L 15 570 Z" },
  { id: "magallanes", name: "Magallanes y Antártica Chilena", numeral: "XII", path: "M 15 570 L 30 610 L 100 600 L 100 700 L 40 720 L 10 680 L 0 650 Z" }
];

// Pastel colors for regions with contracts
const REGION_COLORS = [
  "hsl(195, 80%, 75%)", // Cyan
  "hsl(280, 70%, 80%)", // Purple
  "hsl(340, 75%, 78%)", // Pink/Magenta
  "hsl(25, 85%, 75%)",  // Orange
  "hsl(45, 85%, 75%)",  // Yellow
  "hsl(60, 70%, 75%)",  // Light Yellow
  "hsl(280, 60%, 82%)", // Light Purple
  "hsl(0, 75%, 75%)",   // Red
  "hsl(30, 80%, 70%)",  // Dark Orange
  "hsl(55, 80%, 70%)",  // Gold
  "hsl(120, 50%, 75%)", // Green
  "hsl(180, 60%, 75%)", // Teal
  "hsl(200, 70%, 80%)", // Light Blue
  "hsl(220, 70%, 80%)", // Blue
  "hsl(260, 60%, 80%)", // Violet
  "hsl(320, 60%, 85%)", // Light Pink
];

interface ChileRegionsMapProps {
  contractsByRegion: Record<string, { count: number }>;
  onRegionClick: (regionName: string) => void;
  selectedRegion?: string | null;
}

export function ChileRegionsMap({ contractsByRegion, onRegionClick, selectedRegion }: ChileRegionsMapProps) {
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);

  const getRegionColor = (regionName: string, index: number): string => {
    const hasContracts = contractsByRegion[regionName]?.count > 0;
    if (!hasContracts) return "hsl(220, 10%, 88%)";
    return REGION_COLORS[index % REGION_COLORS.length];
  };

  const getRegionData = (regionName: string) => {
    return contractsByRegion[regionName] || { count: 0 };
  };

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Tooltip */}
      {hoveredRegion && (
        <div className="absolute top-2 left-2 z-20 bg-background/95 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-lg">
          <p className="font-semibold text-sm">
            {CHILE_REGIONS.find(r => r.name === hoveredRegion)?.name} ({CHILE_REGIONS.find(r => r.name === hoveredRegion)?.numeral})
          </p>
          <p className="text-xs text-muted-foreground">
            {getRegionData(hoveredRegion).count} locales
          </p>
        </div>
      )}

      {/* SVG Map */}
      <svg
        viewBox="0 0 100 720"
        className="w-full h-full max-h-[500px]"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="1" dy="1" stdDeviation="2" floodOpacity="0.2" />
          </filter>
        </defs>
        
        {CHILE_REGIONS.map((region, index) => {
          const hasContracts = contractsByRegion[region.name]?.count > 0;
          const isHovered = hoveredRegion === region.name;
          const isSelected = selectedRegion === region.name;

          return (
            <motion.path
              key={region.id}
              d={region.path}
              fill={isHovered || isSelected ? "hsl(var(--primary))" : getRegionColor(region.name, index)}
              stroke="hsl(220, 30%, 50%)"
              strokeWidth={isHovered || isSelected ? 1.5 : 0.5}
              style={{
                cursor: hasContracts ? "pointer" : "default",
                filter: isHovered ? "url(#shadow)" : undefined
              }}
              onMouseEnter={() => setHoveredRegion(region.name)}
              onMouseLeave={() => setHoveredRegion(null)}
              onClick={() => hasContracts && onRegionClick(region.name)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: index * 0.03, duration: 0.3 }}
              whileHover={{ scale: hasContracts ? 1.02 : 1 }}
            />
          );
        })}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-2 right-2 bg-background/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2 text-xs space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: REGION_COLORS[0] }}></div>
          <span>Con locales</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "hsl(220, 10%, 88%)" }}></div>
          <span>Sin locales</span>
        </div>
      </div>
    </div>
  );
}

export default ChileRegionsMap;
