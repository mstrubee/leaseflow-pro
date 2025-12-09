// Chilean Regions demographic data
// Source: INE Chile (Instituto Nacional de Estadísticas) - Census 2017 estimates

export interface CommuneData {
  name: string;
  population: number;
  mayor?: string;
  politicalTendency?: string;
}

export interface RegionDemographics {
  population: number;
  capital: string;
  communes: CommuneData[];
}

export const CHILE_DEMOGRAPHICS: Record<string, RegionDemographics> = {
  "Arica y Parinacota": {
    population: 252110,
    capital: "Arica",
    communes: [
      { name: "Arica", population: 247552, mayor: "Gerardo Espíndola", politicalTendency: "Centro-izquierda" },
      { name: "Camarones", population: 1233, mayor: "Cristian Zavala", politicalTendency: "Independiente" },
      { name: "Putre", population: 2515, mayor: "Maricel Gutiérrez", politicalTendency: "Centro" },
      { name: "General Lagos", population: 810, mayor: "Gregorio Mendoza", politicalTendency: "Independiente" }
    ]
  },
  "Tarapacá": {
    population: 382773,
    capital: "Iquique",
    communes: [
      { name: "Iquique", population: 223463, mayor: "Mauricio Soria", politicalTendency: "Centro-derecha" },
      { name: "Alto Hospicio", population: 129999, mayor: "Patricio Ferreira", politicalTendency: "Centro-izquierda" },
      { name: "Pozo Almonte", population: 17395, mayor: "Richard Godoy", politicalTendency: "Centro" },
      { name: "Camiña", population: 1375, mayor: "Sandra Caqueo", politicalTendency: "Independiente" },
      { name: "Colchane", population: 1649, mayor: "Javier García", politicalTendency: "Independiente" },
      { name: "Huara", population: 3123, mayor: "Néstor Vilca", politicalTendency: "Centro" },
      { name: "Pica", population: 5769, mayor: "Iván Infante", politicalTendency: "Centro-derecha" }
    ]
  },
  "Antofagasta": {
    population: 691854,
    capital: "Antofagasta",
    communes: [
      { name: "Antofagasta", population: 425725, mayor: "Jonathan Velásquez", politicalTendency: "Izquierda" },
      { name: "Calama", population: 192531, mayor: "Eliecer Chamorro", politicalTendency: "Centro-izquierda" },
      { name: "Tocopilla", population: 27813, mayor: "Juan Carvajal", politicalTendency: "Centro" },
      { name: "Mejillones", population: 14758, mayor: "Marcelino Carvajal", politicalTendency: "Centro-derecha" },
      { name: "Taltal", population: 14042, mayor: "Sergio Orellana", politicalTendency: "Centro" },
      { name: "María Elena", population: 6457, mayor: "Boris Aravena", politicalTendency: "Centro-izquierda" },
      { name: "Sierra Gorda", population: 3703, mayor: "Nelson Vásquez", politicalTendency: "Independiente" },
      { name: "Ollagüe", population: 318, mayor: "Félix Esquivel", politicalTendency: "Independiente" },
      { name: "San Pedro de Atacama", population: 10507, mayor: "Aliro Catur", politicalTendency: "Centro" }
    ]
  },
  "Atacama": {
    population: 314709,
    capital: "Copiapó",
    communes: [
      { name: "Copiapó", population: 175643, mayor: "Marcos López", politicalTendency: "Centro-izquierda" },
      { name: "Caldera", population: 19324, mayor: "Brunilda González", politicalTendency: "Centro" },
      { name: "Tierra Amarilla", population: 14984, mayor: "Osvaldo Delgado", politicalTendency: "Centro-izquierda" },
      { name: "Chañaral", population: 12785, mayor: "Héctor Volta", politicalTendency: "Centro-derecha" },
      { name: "Diego de Almagro", population: 19016, mayor: "Patricio Carmona", politicalTendency: "Centro" },
      { name: "Vallenar", population: 54828, mayor: "Armando Flores", politicalTendency: "Centro-izquierda" },
      { name: "Freirina", population: 6706, mayor: "César Orellana", politicalTendency: "Centro" },
      { name: "Huasco", population: 11049, mayor: "Rodrigo Loyola", politicalTendency: "Centro-derecha" },
      { name: "Alto del Carmen", population: 5374, mayor: "Nora Campillay", politicalTendency: "Independiente" }
    ]
  },
  "Coquimbo": {
    population: 836683,
    capital: "La Serena",
    communes: [
      { name: "La Serena", population: 249257, mayor: "Roberto Jacob", politicalTendency: "Centro-derecha" },
      { name: "Coquimbo", population: 252757, mayor: "Ali Manouchehri", politicalTendency: "Centro-izquierda" },
      { name: "Ovalle", population: 120317, mayor: "Claudio Rentería", politicalTendency: "Centro" },
      { name: "Illapel", population: 32460, mayor: "Denis Cortés", politicalTendency: "Centro-izquierda" },
      { name: "Los Vilos", population: 24977, mayor: "Edgardo González", politicalTendency: "Centro" },
      { name: "Salamanca", population: 28017, mayor: "Gerardo Rojas", politicalTendency: "Centro-derecha" },
      { name: "Andacollo", population: 12082, mayor: "Juan Carlos Alfaro", politicalTendency: "Centro" },
      { name: "Vicuña", population: 31204, mayor: "Rafael Vera", politicalTendency: "Centro-izquierda" },
      { name: "Paihuano", population: 4582, mayor: "Patricia Brito", politicalTendency: "Centro" }
    ]
  },
  "Valparaíso": {
    population: 1960170,
    capital: "Valparaíso",
    communes: [
      { name: "Valparaíso", population: 315732, mayor: "Jorge Sharp", politicalTendency: "Izquierda" },
      { name: "Viña del Mar", population: 361371, mayor: "Macarena Ripamonti", politicalTendency: "Centro-izquierda" },
      { name: "Quilpué", population: 179540, mayor: "Mauricio Viñambres", politicalTendency: "Centro" },
      { name: "Villa Alemana", population: 153153, mayor: "Carolina Corti", politicalTendency: "Centro-derecha" },
      { name: "San Antonio", population: 103607, mayor: "Constanza Lizana", politicalTendency: "Centro-izquierda" },
      { name: "Quillota", population: 97136, mayor: "Óscar Calderón", politicalTendency: "Centro" },
      { name: "Los Andes", population: 76032, mayor: "Mauricio Navarro", politicalTendency: "Centro-derecha" },
      { name: "San Felipe", population: 85580, mayor: "Patricio Freire", politicalTendency: "Centro-derecha" },
      { name: "La Calera", population: 60421, mayor: "John Byrne", politicalTendency: "Centro" }
    ]
  },
  "Metropolitana de Santiago": {
    population: 8125072,
    capital: "Santiago",
    communes: [
      { name: "Santiago", population: 503147, mayor: "Irací Hassler", politicalTendency: "Izquierda" },
      { name: "Puente Alto", population: 645909, mayor: "Karla Rubilar", politicalTendency: "Centro-derecha" },
      { name: "Maipú", population: 578605, mayor: "Tomás Vodanovic", politicalTendency: "Izquierda" },
      { name: "La Florida", population: 402433, mayor: "Rodolfo Carter", politicalTendency: "Centro" },
      { name: "Las Condes", population: 330759, mayor: "Daniela Peñaloza", politicalTendency: "Derecha" },
      { name: "San Bernardo", population: 343413, mayor: "Carolina Leitao", politicalTendency: "Centro-izquierda" },
      { name: "Providencia", population: 157749, mayor: "Evelyn Matthei", politicalTendency: "Derecha" },
      { name: "Ñuñoa", population: 250192, mayor: "Emilia Ríos", politicalTendency: "Izquierda" },
      { name: "Vitacura", population: 85384, mayor: "Camila Merino", politicalTendency: "Derecha" }
    ]
  },
  "O'Higgins": {
    population: 991063,
    capital: "Rancagua",
    communes: [
      { name: "Rancagua", population: 273518, mayor: "Juan Ramón Godoy", politicalTendency: "Centro-izquierda" },
      { name: "San Fernando", population: 81608, mayor: "Pablo Silva", politicalTendency: "Centro" },
      { name: "Rengo", population: 70565, mayor: "Carlos Soto", politicalTendency: "Centro-derecha" },
      { name: "Machalí", population: 54010, mayor: "José Miguel Urrutia", politicalTendency: "Centro" },
      { name: "Santa Cruz", population: 43346, mayor: "William Arévalo", politicalTendency: "Centro-derecha" },
      { name: "Graneros", population: 34234, mayor: "Claudio Segovia", politicalTendency: "Centro-izquierda" },
      { name: "Pichilemu", population: 17438, mayor: "Cristian Pozo", politicalTendency: "Centro" }
    ]
  },
  "Maule": {
    population: 1131939,
    capital: "Talca",
    communes: [
      { name: "Talca", population: 257192, mayor: "Juan Carlos Díaz", politicalTendency: "Centro" },
      { name: "Curicó", population: 164931, mayor: "Javier Muñoz", politicalTendency: "Centro-derecha" },
      { name: "Linares", population: 105000, mayor: "Rolando Rentería", politicalTendency: "Centro-izquierda" },
      { name: "Constitución", population: 52389, mayor: "Carlos Valenzuela", politicalTendency: "Centro" },
      { name: "Cauquenes", population: 42034, mayor: "Pedro Ortega", politicalTendency: "Centro-derecha" },
      { name: "Parral", population: 39942, mayor: "Felipe Ortiz", politicalTendency: "Centro" },
      { name: "Molina", population: 49226, mayor: "Priscila Castillo", politicalTendency: "Centro-izquierda" }
    ]
  },
  "Ñuble": {
    population: 511551,
    capital: "Chillán",
    communes: [
      { name: "Chillán", population: 194136, mayor: "Camilo Benavente", politicalTendency: "Centro-izquierda" },
      { name: "Chillán Viejo", population: 35585, mayor: "Felipe Aylwin", politicalTendency: "Centro" },
      { name: "San Carlos", population: 55693, mayor: "Marco Venegas", politicalTendency: "Centro-derecha" },
      { name: "Bulnes", population: 22259, mayor: "Álex Reyes", politicalTendency: "Centro" },
      { name: "Yungay", population: 18756, mayor: "Omar Caamaño", politicalTendency: "Centro-izquierda" },
      { name: "Quirihue", population: 12396, mayor: "Richard Irribarra", politicalTendency: "Centro" }
    ]
  },
  "Biobío": {
    population: 1663696,
    capital: "Concepción",
    communes: [
      { name: "Concepción", population: 237069, mayor: "Álvaro Ortiz", politicalTendency: "Centro-izquierda" },
      { name: "Talcahuano", population: 183872, mayor: "Henry Campos", politicalTendency: "Centro" },
      { name: "Los Ángeles", population: 210918, mayor: "Esteban Krause", politicalTendency: "Centro-derecha" },
      { name: "Chiguayante", population: 104424, mayor: "Carolina Sotelo", politicalTendency: "Centro-izquierda" },
      { name: "Coronel", population: 122116, mayor: "Boris Chamorro", politicalTendency: "Centro" },
      { name: "San Pedro de la Paz", population: 155498, mayor: "Audito Retamal", politicalTendency: "Centro-izquierda" },
      { name: "Hualpén", population: 104330, mayor: "Fabiola Lagos", politicalTendency: "Centro" },
      { name: "Lota", population: 49763, mayor: "Patricio Marchant", politicalTendency: "Centro-izquierda" }
    ]
  },
  "La Araucanía": {
    population: 1014343,
    capital: "Temuco",
    communes: [
      { name: "Temuco", population: 302931, mayor: "Roberto Neira", politicalTendency: "Centro-izquierda" },
      { name: "Padre Las Casas", population: 97664, mayor: "Juan Eduardo Delgado", politicalTendency: "Centro" },
      { name: "Villarrica", population: 60469, mayor: "Julia Aravena", politicalTendency: "Centro-derecha" },
      { name: "Angol", population: 54678, mayor: "Julio Maturana", politicalTendency: "Centro" },
      { name: "Victoria", population: 35848, mayor: "Carlos Contreras", politicalTendency: "Centro-izquierda" },
      { name: "Pucón", population: 33507, mayor: "Carlos Barra", politicalTendency: "Centro-derecha" },
      { name: "Lautaro", population: 37949, mayor: "Nélida Chandía", politicalTendency: "Centro" }
    ]
  },
  "Los Ríos": {
    population: 405835,
    capital: "Valdivia",
    communes: [
      { name: "Valdivia", population: 178561, mayor: "Carla Amtmann", politicalTendency: "Centro-izquierda" },
      { name: "La Unión", population: 43846, mayor: "Óscar Escobar", politicalTendency: "Centro" },
      { name: "Río Bueno", population: 32749, mayor: "Luis Reyes", politicalTendency: "Centro-derecha" },
      { name: "Panguipulli", population: 36476, mayor: "Rodrigo Valdivia", politicalTendency: "Centro-izquierda" },
      { name: "Lanco", population: 18160, mayor: "Alejandro Troncoso", politicalTendency: "Centro" },
      { name: "Paillaco", population: 21072, mayor: "Ramón Llanquilef", politicalTendency: "Centro" }
    ]
  },
  "Los Lagos": {
    population: 891440,
    capital: "Puerto Montt",
    communes: [
      { name: "Puerto Montt", population: 277939, mayor: "Gervoy Paredes", politicalTendency: "Centro-izquierda" },
      { name: "Osorno", population: 171419, mayor: "Emeterio Carrillo", politicalTendency: "Centro" },
      { name: "Castro", population: 48543, mayor: "Juan Eduardo Vera", politicalTendency: "Centro-derecha" },
      { name: "Puerto Varas", population: 48992, mayor: "Tomás Gárate", politicalTendency: "Centro" },
      { name: "Ancud", population: 42776, mayor: "Luis Soto", politicalTendency: "Centro-izquierda" },
      { name: "Calbuco", population: 35408, mayor: "Víctor Salas", politicalTendency: "Centro" },
      { name: "Quellón", population: 33523, mayor: "Cristian Ojeda", politicalTendency: "Centro-derecha" }
    ]
  },
  "Aysén": {
    population: 107334,
    capital: "Coyhaique",
    communes: [
      { name: "Coyhaique", population: 62554, mayor: "Carlos Gatica", politicalTendency: "Centro-izquierda" },
      { name: "Puerto Aysén", population: 26672, mayor: "Luis Martínez", politicalTendency: "Centro" },
      { name: "Chile Chico", population: 5385, mayor: "Lupercio Muñoz", politicalTendency: "Centro-derecha" },
      { name: "Cochrane", population: 3283, mayor: "Jorge Calderón", politicalTendency: "Centro" },
      { name: "Cisnes", population: 6291, mayor: "Francisco Roncagliolo", politicalTendency: "Centro-izquierda" },
      { name: "Guaitecas", population: 1808, mayor: "Karina Ruiz", politicalTendency: "Independiente" }
    ]
  },
  "Magallanes y Antártica Chilena": {
    population: 178362,
    capital: "Punta Arenas",
    communes: [
      { name: "Punta Arenas", population: 142729, mayor: "Claudio Radonich", politicalTendency: "Centro-derecha" },
      { name: "Puerto Natales", population: 22249, mayor: "Antonieta Oyarzo", politicalTendency: "Centro" },
      { name: "Porvenir", population: 7546, mayor: "Marisol Andrade", politicalTendency: "Centro-izquierda" },
      { name: "Puerto Williams", population: 2874, mayor: "Patricio Fernández", politicalTendency: "Independiente" },
      { name: "Primavera", population: 1117, mayor: "Sofía Herrera", politicalTendency: "Centro" },
      { name: "Timaukel", population: 407, mayor: "José Ruiz", politicalTendency: "Independiente" }
    ]
  }
};

export const getRegionDemographics = (regionName: string): RegionDemographics | null => {
  return CHILE_DEMOGRAPHICS[regionName] || null;
};

export const formatPopulation = (population: number): string => {
  return new Intl.NumberFormat('es-CL').format(population);
};
