// Chilean Regions demographic data
// Source: INE Chile (Instituto Nacional de Estadísticas)

export interface CommuneData {
  name: string;
  population?: number;
  mayor?: string;
  politicalTendency?: string;
}

export interface RegionDemographics {
  population?: number;
  capital: string;
  communes: CommuneData[];
}

export const CHILE_DEMOGRAPHICS: Record<string, RegionDemographics> = {
  "Arica y Parinacota": {
    capital: "Arica",
    communes: [
      { name: "Arica" },
      { name: "Camarones" },
      { name: "Putre" },
      { name: "General Lagos" }
    ]
  },
  "Tarapacá": {
    capital: "Iquique",
    communes: [
      { name: "Iquique" },
      { name: "Alto Hospicio" },
      { name: "Pozo Almonte" },
      { name: "Camiña" },
      { name: "Colchane" },
      { name: "Huara" },
      { name: "Pica" }
    ]
  },
  "Antofagasta": {
    capital: "Antofagasta",
    communes: [
      { name: "Antofagasta" },
      { name: "Mejillones" },
      { name: "Sierra Gorda" },
      { name: "Taltal" },
      { name: "Calama" },
      { name: "Ollagüe" },
      { name: "San Pedro de Atacama" },
      { name: "Tocopilla" },
      { name: "María Elena" }
    ]
  },
  "Atacama": {
    capital: "Copiapó",
    communes: [
      { name: "Copiapó" },
      { name: "Caldera" },
      { name: "Tierra Amarilla" },
      { name: "Chañaral" },
      { name: "Diego de Almagro" },
      { name: "Vallenar" },
      { name: "Freirina" },
      { name: "Huasco" },
      { name: "Alto del Carmen" }
    ]
  },
  "Coquimbo": {
    capital: "La Serena",
    communes: [
      { name: "La Serena" },
      { name: "Coquimbo" },
      { name: "Andacollo" },
      { name: "La Higuera" },
      { name: "Paiguano" },
      { name: "Vicuña" },
      { name: "Ovalle" },
      { name: "Combarbalá" },
      { name: "Monte Patria" },
      { name: "Punitaqui" },
      { name: "Río Hurtado" },
      { name: "Illapel" },
      { name: "Canela" },
      { name: "Los Vilos" },
      { name: "Salamanca" }
    ]
  },
  "Valparaíso": {
    capital: "Valparaíso",
    communes: [
      { name: "Valparaíso" },
      { name: "Viña del Mar" },
      { name: "Concón" },
      { name: "Quintero" },
      { name: "Puchuncaví" },
      { name: "Casablanca" },
      { name: "Juan Fernández" },
      { name: "San Antonio" },
      { name: "Algarrobo" },
      { name: "Cartagena" },
      { name: "El Quisco" },
      { name: "El Tabo" },
      { name: "Santo Domingo" },
      { name: "Quillota" },
      { name: "La Calera" },
      { name: "Hijuelas" },
      { name: "La Cruz" },
      { name: "Nogales" },
      { name: "Petorca" },
      { name: "La Ligua" },
      { name: "Cabildo" },
      { name: "Zapallar" },
      { name: "Papudo" },
      { name: "San Felipe" },
      { name: "Catemu" },
      { name: "Llaillay" },
      { name: "Panquehue" },
      { name: "Putaendo" },
      { name: "Santa María" },
      { name: "Los Andes" },
      { name: "Calle Larga" },
      { name: "Rinconada" },
      { name: "San Esteban" },
      { name: "Quilpué" },
      { name: "Villa Alemana" },
      { name: "Limache" },
      { name: "Olmué" }
    ]
  },
  "Metropolitana de Santiago": {
    capital: "Santiago",
    communes: [
      { name: "Alhué" },
      { name: "Buin" },
      { name: "Calera de Tango" },
      { name: "Cerrillos" },
      { name: "Cerro Navia" },
      { name: "Colina" },
      { name: "Conchalí" },
      { name: "Curacaví" },
      { name: "El Bosque" },
      { name: "El Monte" },
      { name: "Estación Central" },
      { name: "Huechuraba" },
      { name: "Independencia" },
      { name: "Isla de Maipo" },
      { name: "La Cisterna" },
      { name: "La Florida" },
      { name: "La Granja" },
      { name: "La Pintana" },
      { name: "La Reina" },
      { name: "Lampa" },
      { name: "Las Condes" },
      { name: "Lo Barnechea" },
      { name: "Lo Espejo" },
      { name: "Lo Prado" },
      { name: "Macul" },
      { name: "Maipú" },
      { name: "María Pinto" },
      { name: "Melipilla" },
      { name: "Ñuñoa" },
      { name: "Padre Hurtado" },
      { name: "Paine" },
      { name: "Pedro Aguirre Cerda" },
      { name: "Peñaflor" },
      { name: "Peñalolén" },
      { name: "Pirque" },
      { name: "Providencia" },
      { name: "Pudahuel" },
      { name: "Puente Alto" },
      { name: "Quilicura" },
      { name: "Quinta Normal" },
      { name: "Recoleta" },
      { name: "Renca" },
      { name: "San Bernardo" },
      { name: "San Joaquín" },
      { name: "San José de Maipo" },
      { name: "San Miguel" },
      { name: "San Pedro" },
      { name: "San Ramón" },
      { name: "Santiago" },
      { name: "Talagante" },
      { name: "Tiltil" },
      { name: "Vitacura" }
    ]
  },
  "O'Higgins": {
    capital: "Rancagua",
    communes: [
      { name: "Rancagua" },
      { name: "Machalí" },
      { name: "Graneros" },
      { name: "Mostazal" },
      { name: "Codegua" },
      { name: "Doñihue" },
      { name: "Coltauco" },
      { name: "Coinco" },
      { name: "Olivar" },
      { name: "Requínoa" },
      { name: "Rengo" },
      { name: "Malloa" },
      { name: "Quinta de Tilcoco" },
      { name: "San Vicente" },
      { name: "Pichidegua" },
      { name: "Peumo" },
      { name: "Las Cabras" },
      { name: "San Fernando" },
      { name: "Chimbarongo" },
      { name: "Nancagua" },
      { name: "Placilla" },
      { name: "Pumanque" },
      { name: "Santa Cruz" },
      { name: "Lolol" },
      { name: "Peralillo" },
      { name: "Marchigüe" },
      { name: "Pichilemu" },
      { name: "Navidad" },
      { name: "La Estrella" },
      { name: "Litueche" }
    ]
  },
  "Maule": {
    capital: "Talca",
    communes: [
      { name: "Talca" },
      { name: "San Clemente" },
      { name: "Pelarco" },
      { name: "Río Claro" },
      { name: "Maule" },
      { name: "San Rafael" },
      { name: "Curepto" },
      { name: "Constitución" },
      { name: "Empedrado" },
      { name: "Pencahue" },
      { name: "Linares" },
      { name: "Yerbas Buenas" },
      { name: "Colbún" },
      { name: "Longaví" },
      { name: "Parral" },
      { name: "Retiro" },
      { name: "Villa Alegre" },
      { name: "San Javier" },
      { name: "Cauquenes" },
      { name: "Pelluhue" },
      { name: "Chanco" },
      { name: "Curicó" },
      { name: "Teno" },
      { name: "Romeral" },
      { name: "Molina" },
      { name: "Sagrada Familia" },
      { name: "Hualañé" },
      { name: "Licantén" },
      { name: "Vichuquén" }
    ]
  },
  "Ñuble": {
    capital: "Chillán",
    communes: [
      { name: "Chillán" },
      { name: "Chillán Viejo" },
      { name: "Bulnes" },
      { name: "Quillón" },
      { name: "San Ignacio" },
      { name: "Yungay" },
      { name: "El Carmen" },
      { name: "Pemuco" },
      { name: "Pinto" },
      { name: "Coihueco" },
      { name: "San Carlos" },
      { name: "Ñiquén" },
      { name: "San Fabián" },
      { name: "San Nicolás" },
      { name: "Cobquecura" },
      { name: "Quirihue" },
      { name: "Ninhue" },
      { name: "Portezuelo" },
      { name: "Ránquil" },
      { name: "Treguaco" }
    ]
  },
  "Biobío": {
    capital: "Concepción",
    communes: [
      { name: "Concepción" },
      { name: "Talcahuano" },
      { name: "Hualpén" },
      { name: "San Pedro de la Paz" },
      { name: "Chiguayante" },
      { name: "Penco" },
      { name: "Tomé" },
      { name: "Coronel" },
      { name: "Lota" },
      { name: "Santa Juana" },
      { name: "Hualqui" },
      { name: "Florida" },
      { name: "Arauco" },
      { name: "Curanilahue" },
      { name: "Lebu" },
      { name: "Los Álamos" },
      { name: "Cañete" },
      { name: "Contulmo" },
      { name: "Tirúa" },
      { name: "Los Ángeles" },
      { name: "Nacimiento" },
      { name: "Negrete" },
      { name: "Mulchén" },
      { name: "Quilaco" },
      { name: "Quilleco" },
      { name: "Santa Bárbara" },
      { name: "San Rosendo" },
      { name: "Laja" },
      { name: "Cabrero" },
      { name: "Yumbel" },
      { name: "Antuco" },
      { name: "Alto Biobío" }
    ]
  },
  "La Araucanía": {
    capital: "Temuco",
    communes: [
      { name: "Temuco" },
      { name: "Padre Las Casas" },
      { name: "Vilcún" },
      { name: "Freire" },
      { name: "Cunco" },
      { name: "Melipeuco" },
      { name: "Curarrehue" },
      { name: "Pucón" },
      { name: "Villarrica" },
      { name: "Loncoche" },
      { name: "Gorbea" },
      { name: "Toltén" },
      { name: "Teodoro Schmidt" },
      { name: "Saavedra" },
      { name: "Carahue" },
      { name: "Nueva Imperial" },
      { name: "Cholchol" },
      { name: "Galvarino" },
      { name: "Lautaro" },
      { name: "Perquenco" },
      { name: "Victoria" },
      { name: "Traiguén" },
      { name: "Lumaco" },
      { name: "Purén" },
      { name: "Los Sauces" },
      { name: "Angol" },
      { name: "Renaico" },
      { name: "Collipulli" },
      { name: "Ercilla" },
      { name: "Lonquimay" }
    ]
  },
  "Los Ríos": {
    capital: "Valdivia",
    communes: [
      { name: "Valdivia" },
      { name: "Corral" },
      { name: "Lanco" },
      { name: "Los Lagos" },
      { name: "Máfil" },
      { name: "Mariquina" },
      { name: "Paillaco" },
      { name: "Panguipulli" },
      { name: "La Unión" },
      { name: "Río Bueno" },
      { name: "Lago Ranco" },
      { name: "Futrono" }
    ]
  },
  "Los Lagos": {
    capital: "Puerto Montt",
    communes: [
      { name: "Puerto Montt" },
      { name: "Puerto Varas" },
      { name: "Llanquihue" },
      { name: "Frutillar" },
      { name: "Los Muermos" },
      { name: "Maullín" },
      { name: "Calbuco" },
      { name: "Cochamó" },
      { name: "Ancud" },
      { name: "Castro" },
      { name: "Chonchi" },
      { name: "Curaco de Vélez" },
      { name: "Dalcahue" },
      { name: "Puqueldón" },
      { name: "Queilén" },
      { name: "Quellón" },
      { name: "Quemchi" },
      { name: "Quinchao" },
      { name: "Osorno" },
      { name: "Puerto Octay" },
      { name: "Purranque" },
      { name: "Puyehue" },
      { name: "Río Negro" },
      { name: "San Juan de la Costa" },
      { name: "San Pablo" },
      { name: "Chaitén" },
      { name: "Futaleufú" },
      { name: "Hualaihué" },
      { name: "Palena" }
    ]
  },
  "Aysén": {
    capital: "Coyhaique",
    communes: [
      { name: "Coyhaique" },
      { name: "Lago Verde" },
      { name: "Aysén" },
      { name: "Cisnes" },
      { name: "Guaitecas" },
      { name: "Chile Chico" },
      { name: "Río Ibáñez" },
      { name: "Cochrane" },
      { name: "O'Higgins" },
      { name: "Tortel" }
    ]
  },
  "Magallanes": {
    capital: "Punta Arenas",
    communes: [
      { name: "Punta Arenas" },
      { name: "Laguna Blanca" },
      { name: "Río Verde" },
      { name: "San Gregorio" },
      { name: "Puerto Natales" },
      { name: "Torres del Paine" },
      { name: "Porvenir" },
      { name: "Primavera" },
      { name: "Timaukel" },
      { name: "Cabo de Hornos" },
      { name: "Antártica" }
    ]
  }
};

export const getRegionDemographics = (regionName: string): RegionDemographics | null => {
  return CHILE_DEMOGRAPHICS[regionName] || null;
};

export const formatPopulation = (population: number): string => {
  return new Intl.NumberFormat('es-CL').format(population);
};

export const getRegionByCommune = (communeName: string): string | null => {
  const normalizedCommune = communeName.toLowerCase().trim();
  
  for (const [regionName, regionData] of Object.entries(CHILE_DEMOGRAPHICS)) {
    const found = regionData.communes.some(
      commune => commune.name.toLowerCase() === normalizedCommune
    );
    if (found) {
      return regionName;
    }
  }
  return null;
};

export const getAllCommunes = (): string[] => {
  const communes: string[] = [];
  for (const regionData of Object.values(CHILE_DEMOGRAPHICS)) {
    for (const commune of regionData.communes) {
      communes.push(commune.name);
    }
  }
  return communes;
};

export const getRegionNames = (): string[] => {
  return Object.keys(CHILE_DEMOGRAPHICS);
};
