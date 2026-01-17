// Business Case template - simplified to avoid TS compiler issues
export interface ContractData {
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

const createCell = (r: number, c: number, value: string | number, opts: Record<string, any> = {}) => ({
  r, c,
  v: {
    v: value,
    m: String(value),
    ct: { fa: "General", t: typeof value === "number" ? "n" : "s" },
    ...opts
  }
});

export const getAntofagastaBusinessCaseData = (): any[] => {
  const cells = [
    createCell(7, 1, "Tasas de Rendimiento", { bg: "#4472C4", fc: "#FFFFFF", bl: 1 }),
    createCell(7, 2, "TIR", { bg: "#4472C4", fc: "#FFFFFF" }),
    createCell(7, 3, 0.29, { bg: "#E2EFDA" }),
    createCell(8, 2, "VAN", { bg: "#4472C4", fc: "#FFFFFF" }),
    createCell(8, 3, 149.09, { bg: "#E2EFDA" }),
    createCell(10, 1, "Resumen Ejecutivo", { bg: "#4472C4", fc: "#FFFFFF", bl: 1 }),
    createCell(12, 1, "Fecha", { bg: "#D9E2F3" }), createCell(12, 3, "May-25"),
    createCell(13, 1, "Pais", { bg: "#D9E2F3" }), createCell(13, 3, "Chile"),
    createCell(14, 1, "Ubicación", { bg: "#D9E2F3" }), createCell(14, 3, "Av. Pedro Aguirre Cerda 9400, Antofagasta"),
    createCell(15, 1, "Empresa", { bg: "#D9E2F3" }), createCell(15, 3, "Autoplanet"),
    createCell(16, 1, "Superficie Local", { bg: "#D9E2F3" }), createCell(16, 2, "mt2"), createCell(16, 3, 393),
    createCell(17, 1, "Valor x mt2", { bg: "#D9E2F3" }), createCell(17, 2, "mt2"), createCell(17, 3, 0.534),
    createCell(18, 1, "Contrato Arriendo", { bg: "#D9E2F3" }), createCell(18, 2, "Años"), createCell(18, 3, 10),
    createCell(19, 1, "Canon", { bg: "#D9E2F3" }), createCell(19, 2, "UF"), createCell(19, 3, 209.75),
    createCell(20, 1, "Gasto Común y otros", { bg: "#D9E2F3" }), createCell(20, 2, "UF"), createCell(20, 3, 46.73),
    createCell(21, 1, "Arriendo Total", { bg: "#D9E2F3" }), createCell(21, 2, "UF"), createCell(21, 3, 256.48),
    createCell(28, 1, "Garantia", { bg: "#D9E2F3" }), createCell(28, 2, "UF"), createCell(28, 3, 630),
    createCell(30, 1, "Tasa de descuento", { bg: "#D9E2F3" }), createCell(30, 3, 0.12),
    createCell(37, 1, "Año", { bg: "#4472C4", fc: "#FFFFFF", bl: 1 }),
    createCell(37, 2, 0, { bg: "#4472C4", fc: "#FFFFFF" }),
    createCell(37, 3, 1, { bg: "#4472C4", fc: "#FFFFFF" }),
    createCell(37, 4, 2, { bg: "#4472C4", fc: "#FFFFFF" }),
    createCell(37, 5, 3, { bg: "#4472C4", fc: "#FFFFFF" }),
    createCell(37, 6, 4, { bg: "#4472C4", fc: "#FFFFFF" }),
    createCell(37, 7, 5, { bg: "#4472C4", fc: "#FFFFFF" }),
    createCell(39, 1, "Ingresos", { bg: "#E2EFDA", bl: 1 }),
    createCell(39, 3, 490), createCell(39, 4, 1080), createCell(39, 5, 1080), createCell(39, 6, 1200), createCell(39, 7, 1200),
    createCell(53, 1, "EBITDA", { bg: "#4472C4", fc: "#FFFFFF", bl: 1 }),
    createCell(53, 3, 4), createCell(53, 4, 194), createCell(53, 5, 190), createCell(53, 6, 237), createCell(53, 7, 232),
    createCell(64, 1, "Flujo operativo", { bg: "#4472C4", fc: "#FFFFFF", bl: 1 }),
    createCell(64, 2, -276), createCell(64, 3, 9), createCell(64, 4, 148), createCell(64, 5, 145), createCell(64, 6, 179), createCell(64, 7, 176),
    createCell(65, 1, "PAYBACK", { bg: "#E2EFDA", bl: 1 }),
    createCell(65, 2, -276), createCell(65, 3, -267), createCell(65, 4, -119), createCell(65, 5, 26), createCell(65, 6, 205), createCell(65, 7, 381),
  ];

  return [{
    name: "Business Case",
    id: "sheet1",
    status: 1,
    order: 0,
    celldata: cells,
    config: { columnlen: { 1: 220, 2: 80, 3: 100, 4: 100, 5: 100, 6: 100, 7: 100 } },
    row: 80,
    column: 16
  }];
};

export const getBlankBusinessCaseTemplate = (contractData: ContractData): any[] => {
  const cells = [
    createCell(7, 1, "Tasas de Rendimiento", { bg: "#4472C4", fc: "#FFFFFF", bl: 1 }),
    createCell(7, 2, "TIR", { bg: "#4472C4", fc: "#FFFFFF" }),
    createCell(8, 2, "VAN", { bg: "#4472C4", fc: "#FFFFFF" }),
    createCell(10, 1, "Resumen Ejecutivo", { bg: "#4472C4", fc: "#FFFFFF", bl: 1 }),
    createCell(14, 1, "Ubicación", { bg: "#D9E2F3" }), createCell(14, 3, contractData.ubicacion),
    createCell(15, 1, "Empresa", { bg: "#D9E2F3" }), createCell(15, 3, contractData.empresa),
    createCell(16, 1, "Superficie Local", { bg: "#D9E2F3" }), createCell(16, 2, "mt2"), createCell(16, 3, contractData.superficieM2),
    createCell(18, 1, "Contrato Arriendo", { bg: "#D9E2F3" }), createCell(18, 2, "Años"), createCell(18, 3, contractData.duracionAnios),
    createCell(19, 1, "Canon", { bg: "#D9E2F3" }), createCell(19, 2, "UF"), createCell(19, 3, contractData.canonUF),
    createCell(20, 1, "Gasto Común", { bg: "#D9E2F3" }), createCell(20, 2, "UF"), createCell(20, 3, contractData.gastosComunesUF),
    createCell(21, 1, "Arriendo Total", { bg: "#D9E2F3" }), createCell(21, 2, "UF"), createCell(21, 3, contractData.arriendoTotalUF),
    createCell(28, 1, "Garantia", { bg: "#D9E2F3" }), createCell(28, 2, "UF"), createCell(28, 3, contractData.garantiaUF),
    createCell(31, 1, "Valor UF", { bg: "#D9E2F3" }), createCell(31, 2, "CLP"), createCell(31, 3, contractData.ufValue),
    createCell(37, 1, "Año", { bg: "#4472C4", fc: "#FFFFFF", bl: 1 }),
    createCell(39, 1, "Ingresos", { bg: "#E2EFDA", bl: 1 }),
    createCell(53, 1, "EBITDA", { bg: "#4472C4", fc: "#FFFFFF", bl: 1 }),
    createCell(64, 1, "Flujo operativo", { bg: "#4472C4", fc: "#FFFFFF", bl: 1 }),
    createCell(65, 1, "PAYBACK", { bg: "#E2EFDA", bl: 1 }),
  ];

  return [{
    name: "Business Case",
    id: "sheet1",
    status: 1,
    order: 0,
    celldata: cells,
    config: { columnlen: { 1: 220, 2: 80, 3: 100, 4: 100, 5: 100, 6: 100, 7: 100 } },
    row: 80,
    column: 16
  }];
};
