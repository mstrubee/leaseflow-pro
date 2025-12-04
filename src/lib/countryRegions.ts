export const COUNTRY_REGIONS = {
  Chile: {
    order: [
      "Arica y Parinacota", "Tarapacá", "Antofagasta", "Atacama", "Coquimbo",
      "Valparaíso", "Metropolitana de Santiago", "O'Higgins", "Maule", "Ñuble",
      "Biobío", "La Araucanía", "Los Ríos", "Los Lagos", "Aysén",
      "Magallanes y Antártica Chilena"
    ],
    // Approximate coordinates for each region (for simplified map)
    coordinates: {
      "Arica y Parinacota": { x: 50, y: 5 },
      "Tarapacá": { x: 50, y: 10 },
      "Antofagasta": { x: 50, y: 18 },
      "Atacama": { x: 48, y: 28 },
      "Coquimbo": { x: 45, y: 35 },
      "Valparaíso": { x: 40, y: 42 },
      "Metropolitana de Santiago": { x: 42, y: 45 },
      "O'Higgins": { x: 40, y: 50 },
      "Maule": { x: 38, y: 55 },
      "Ñuble": { x: 36, y: 60 },
      "Biobío": { x: 34, y: 65 },
      "La Araucanía": { x: 32, y: 70 },
      "Los Ríos": { x: 30, y: 75 },
      "Los Lagos": { x: 28, y: 82 },
      "Aysén": { x: 25, y: 90 },
      "Magallanes y Antártica Chilena": { x: 20, y: 98 }
    }
  },
  Peru: {
    order: [
      "Tumbes", "Piura", "Lambayeque", "Cajamarca", "Amazonas", "Loreto",
      "San Martín", "La Libertad", "Áncash", "Huánuco", "Ucayali", "Pasco",
      "Junín", "Huancavelica", "Lima", "Callao", "Ica", "Ayacucho", "Apurímac",
      "Cusco", "Madre de Dios", "Puno", "Arequipa", "Moquegua", "Tacna"
    ],
    coordinates: {
      "Tumbes": { x: 15, y: 8 },
      "Piura": { x: 20, y: 12 },
      "Lambayeque": { x: 22, y: 18 },
      "Cajamarca": { x: 30, y: 18 },
      "Amazonas": { x: 38, y: 15 },
      "Loreto": { x: 60, y: 20 },
      "San Martín": { x: 45, y: 25 },
      "La Libertad": { x: 25, y: 28 },
      "Áncash": { x: 28, y: 35 },
      "Huánuco": { x: 40, y: 35 },
      "Ucayali": { x: 60, y: 40 },
      "Pasco": { x: 38, y: 42 },
      "Junín": { x: 42, y: 48 },
      "Huancavelica": { x: 35, y: 55 },
      "Lima": { x: 25, y: 50 },
      "Callao": { x: 20, y: 50 },
      "Ica": { x: 25, y: 60 },
      "Ayacucho": { x: 38, y: 60 },
      "Apurímac": { x: 45, y: 58 },
      "Cusco": { x: 55, y: 58 },
      "Madre de Dios": { x: 70, y: 55 },
      "Puno": { x: 58, y: 68 },
      "Arequipa": { x: 45, y: 72 },
      "Moquegua": { x: 50, y: 80 },
      "Tacna": { x: 52, y: 88 }
    }
  },
  Colombia: {
    order: [
      "La Guajira", "Cesar", "Atlántico", "Magdalena", "Bolívar", "Sucre",
      "Córdoba", "Antioquia", "Santander", "Norte de Santander", "Boyacá",
      "Arauca", "Casanare", "Cundinamarca", "Bogotá D.C.", "Tolima", "Huila",
      "Caldas", "Risaralda", "Quindío", "Valle del Cauca", "Chocó", "Cauca",
      "Nariño", "Putumayo", "Meta", "Guaviare", "Vaupés", "Guainía", "Vichada",
      "Amazonas"
    ],
    coordinates: {
      "La Guajira": { x: 70, y: 5 },
      "Cesar": { x: 60, y: 12 },
      "Atlántico": { x: 45, y: 8 },
      "Magdalena": { x: 55, y: 10 },
      "Bolívar": { x: 45, y: 18 },
      "Sucre": { x: 38, y: 15 },
      "Córdoba": { x: 32, y: 18 },
      "Antioquia": { x: 35, y: 28 },
      "Santander": { x: 55, y: 25 },
      "Norte de Santander": { x: 62, y: 18 },
      "Boyacá": { x: 55, y: 32 },
      "Arauca": { x: 70, y: 25 },
      "Casanare": { x: 68, y: 32 },
      "Cundinamarca": { x: 50, y: 40 },
      "Bogotá D.C.": { x: 52, y: 42 },
      "Tolima": { x: 42, y: 45 },
      "Huila": { x: 45, y: 55 },
      "Caldas": { x: 38, y: 38 },
      "Risaralda": { x: 32, y: 40 },
      "Quindío": { x: 35, y: 45 },
      "Valle del Cauca": { x: 28, y: 50 },
      "Chocó": { x: 20, y: 40 },
      "Cauca": { x: 30, y: 58 },
      "Nariño": { x: 28, y: 68 },
      "Putumayo": { x: 42, y: 68 },
      "Meta": { x: 62, y: 45 },
      "Guaviare": { x: 58, y: 58 },
      "Vaupés": { x: 68, y: 65 },
      "Guainía": { x: 78, y: 55 },
      "Vichada": { x: 78, y: 38 },
      "Amazonas": { x: 58, y: 78 }
    }
  },
  Ecuador: {
    order: [
      "Carchi", "Esmeraldas", "Sucumbíos", "Imbabura", "Napo", "Pichincha",
      "Santo Domingo de los Tsáchilas", "Orellana", "Manabí", "Los Ríos",
      "Cotopaxi", "Tungurahua", "Bolívar", "Pastaza", "Guayas", "Santa Elena",
      "Chimborazo", "Cañar", "Morona Santiago", "Azuay", "El Oro",
      "Zamora Chinchipe", "Loja", "Galápagos"
    ],
    coordinates: {
      "Carchi": { x: 45, y: 5 },
      "Esmeraldas": { x: 25, y: 10 },
      "Sucumbíos": { x: 65, y: 10 },
      "Imbabura": { x: 45, y: 15 },
      "Napo": { x: 60, y: 25 },
      "Pichincha": { x: 42, y: 22 },
      "Santo Domingo de los Tsáchilas": { x: 32, y: 25 },
      "Orellana": { x: 75, y: 25 },
      "Manabí": { x: 20, y: 35 },
      "Los Ríos": { x: 35, y: 40 },
      "Cotopaxi": { x: 45, y: 35 },
      "Tungurahua": { x: 52, y: 38 },
      "Bolívar": { x: 40, y: 45 },
      "Pastaza": { x: 65, y: 42 },
      "Guayas": { x: 28, y: 52 },
      "Santa Elena": { x: 15, y: 52 },
      "Chimborazo": { x: 48, y: 50 },
      "Cañar": { x: 45, y: 58 },
      "Morona Santiago": { x: 62, y: 55 },
      "Azuay": { x: 50, y: 65 },
      "El Oro": { x: 32, y: 68 },
      "Zamora Chinchipe": { x: 58, y: 72 },
      "Loja": { x: 45, y: 78 },
      "Galápagos": { x: 5, y: 50 }
    }
  }
} as const;

export type Country = keyof typeof COUNTRY_REGIONS;

export const PASTEL_COLORS = [
  "hsl(210, 80%, 85%)", // Light blue
  "hsl(150, 60%, 80%)", // Light green
  "hsl(340, 70%, 85%)", // Light pink
  "hsl(45, 80%, 85%)",  // Light yellow
  "hsl(280, 60%, 85%)", // Light purple
  "hsl(180, 60%, 80%)", // Light teal
  "hsl(20, 80%, 85%)",  // Light orange
  "hsl(120, 50%, 82%)", // Light lime
];

export const getRegionColor = (index: number, hasContracts: boolean): string => {
  if (!hasContracts) return "hsl(220, 10%, 90%)"; // Neutral gray
  return PASTEL_COLORS[index % PASTEL_COLORS.length];
};
