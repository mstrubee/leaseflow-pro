// Business Case template data
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

// Antofagasta BC data from the uploaded Excel
export const getAntofagastaBusinessCaseData = (): any => {
  return {
    data: [
      ["", "", "", "", "", "", "", "", "", ""],
      ["", "Tasas de Rendimiento", "TIR", "29%", "", "", "", "", "", ""],
      ["", "", "VAN", "$149.09", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", ""],
      ["", "Resumen Ejecutivo", "", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", ""],
      ["", "Fecha", "", "May-25", "", "", "", "", "", ""],
      ["", "Pais", "", "Chile", "", "", "", "", "", ""],
      ["", "Ubicación", "", "Av. Pedro Aguirre Cerda 9400, Antofagasta", "", "", "", "", "", ""],
      ["", "Empresa", "", "Autoplanet", "", "", "", "", "", ""],
      ["", "Superficie Local", "mt2", "393", "", "", "", "", "", ""],
      ["", "Valor x mt2", "mt2", "0.534", "", "", "", "", "", ""],
      ["", "Contrato Arriendo", "Años", "10", "", "", "", "", "", ""],
      ["", "Canon", "UF", "209.75", "", "", "", "", "", ""],
      ["", "Gasto Común y otros", "UF", "46.73", "", "", "", "", "", ""],
      ["", "Arriendo Total", "UF", "256.48", "", "", "", "", "", ""],
      ["", "Inicio", "", "Feb-26", "", "", "", "", "", ""],
      ["", "Fecha estimada de Finalización", "", "May-26", "", "", "", "", "", ""],
      ["", "Inversión Habilitacion", "", "$200", "", "", "", "", "", ""],
      ["", "Inversion Inventario", "", "-", "", "", "", "", "", ""],
      ["", "Inversion Tecnologia", "", "$30", "", "", "", "", "", ""],
      ["", "Inversion Marketing", "", "$8", "", "", "", "", "", ""],
      ["", "Garantia", "UF", "630", "", "", "", "", "", ""],
      ["", "Cobro por Instalaciones", "UF", "350", "", "", "", "", "", ""],
      ["", "Tasa de descuento", "", "12%", "", "", "", "", "", ""],
      ["", "Periodo de Recuperación (Año)", "años", "3", "", "", "", "", "", ""],
      ["", "Rentabilidad al 4 año", "", "18%", "", "", "", "", "", ""],
      ["", "TIR", "", "29%", "", "", "", "", "", ""],
      ["", "VAN", "", "$149", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", ""],
      ["", "Año", "0", "1", "2", "3", "4", "5", "", ""],
      ["", "", "2025", "2026", "2027", "2028", "2029", "2030", "", ""],
      ["", "Ingresos", "", "490", "1080", "1080", "1200", "1200", "", ""],
      ["", "Costo por ventas", "", "-221", "-486", "-486", "-540", "-540", "", ""],
      ["", "Margen directo %", "", "55%", "55%", "55%", "55%", "55%", "", ""],
      ["", "Otros Costos directos", "", "-4", "-9", "-9", "-10", "-10", "", ""],
      ["", "Costos Variables", "", "-29", "-65", "-65", "-72", "-72", "", ""],
      ["", "Margen de contribucion $", "", "236", "521", "521", "578", "578", "", ""],
      ["", "Margen de contribucion %", "", "48.20%", "48.20%", "48.20%", "48.20%", "48.20%", "", ""],
      ["", "Gastos Personal", "", "-84", "-148", "-153", "-157", "-162", "", ""],
      ["", "Publicidad y Promocion", "", "-1", "-3", "-3", "-4", "-4", "", ""],
      ["", "Gastos Generales", "", "-7", "-16", "-16", "-18", "-18", "", ""],
      ["", "Tecnologia", "", "-9", "-19", "-19", "-22", "-22", "", ""],
      ["", "Ocupacion sin Arrdo", "", "-7", "-16", "-16", "-18", "-18", "", ""],
      ["", "Canon Arriendo", "", "-123", "-123", "-123", "-123", "-123", "", ""],
      ["", "GAVs", "", "-232", "-327", "-331", "-342", "-346", "", ""],
      ["", "EBITDA", "", "4", "194", "190", "237", "232", "", ""],
      ["", "Depreciación Y Amortizacion", "", "-24", "-24", "-24", "-24", "-24", "", ""],
      ["", "EBIT", "", "-20", "170", "166", "213", "208", "", ""],
      ["", "ROS%", "", "-4%", "16%", "15%", "18%", "17%", "", ""],
      ["", "Intereses (-)", "", "-", "-", "-", "-", "-", "", ""],
      ["", "UAI", "", "-20", "170", "166", "213", "208", "", ""],
      ["", "Impuesto%", "", "27%", "27%", "27%", "27%", "27%", "", ""],
      ["", "Impuesto", "", "5", "-46", "-45", "-57", "-56", "", ""],
      ["", "UDI", "", "-14", "124", "121", "155", "152", "", ""],
      ["", "", "", "", "", "", "", "", "", ""],
      ["", "Capex", "-276", "-", "-", "-", "-", "-", "", ""],
      ["", "Flujo operativo", "-276", "9", "148", "145", "179", "176", "", ""],
      ["", "PAYBACK", "-276", "-267", "-119", "26", "205", "381", "", ""],
      ["", "PAYBACK años", "3", "", "", "", "", "", "", ""],
      ["", "Activos Netos Totales", "", "-252", "-229", "-205", "-181", "-157", "", ""],
      ["", "Capital de Trabajo", "", "100", "100", "100", "100", "100", "", ""],
      ["", "Capital empleado", "", "-152", "-129", "-105", "-81", "-57", "", ""],
      ["", "", "", "", "", "", "", "", "", ""],
      ["", "Rentabilidad", "", "-4.0%", "15.8%", "15.4%", "17.7%", "17.4%", "", ""],
    ]
  };
};

// Blank template with system data pre-filled
export const getBlankBusinessCaseTemplate = (contractData: ContractData): any => {
  const valorPorM2 = contractData.superficieM2 > 0 
    ? (contractData.canonUF / contractData.superficieM2).toFixed(3) 
    : "0";
    
  return {
    data: [
      ["", "", "", "", "", "", "", "", "", ""],
      ["", "Tasas de Rendimiento", "TIR", "", "", "", "", "", "", ""],
      ["", "", "VAN", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", ""],
      ["", "Resumen Ejecutivo", "", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", ""],
      ["", "Fecha", "", new Date().toLocaleDateString('es-CL', { month: 'short', year: '2-digit' }), "", "", "", "", "", ""],
      ["", "Pais", "", "Chile", "", "", "", "", "", ""],
      ["", "Ubicación", "", contractData.ubicacion, "", "", "", "", "", ""],
      ["", "Empresa", "", contractData.empresa, "", "", "", "", "", ""],
      ["", "Superficie Local", "mt2", String(contractData.superficieM2), "", "", "", "", "", ""],
      ["", "Valor x mt2", "UF/mt2", valorPorM2, "", "", "", "", "", ""],
      ["", "Contrato Arriendo", "Años", String(contractData.duracionAnios), "", "", "", "", "", ""],
      ["", "Canon", "UF", contractData.canonUF.toFixed(2), "", "", "", "", "", ""],
      ["", "Gasto Común y otros", "UF", contractData.gastosComunesUF.toFixed(2), "", "", "", "", "", ""],
      ["", "Arriendo Total", "UF", contractData.arriendoTotalUF.toFixed(2), "", "", "", "", "", ""],
      ["", "Inicio", "", "", "", "", "", "", "", ""],
      ["", "Fecha estimada de Finalización", "", "", "", "", "", "", "", ""],
      ["", "Inversión Habilitacion", "", "", "", "", "", "", "", ""],
      ["", "Inversion Inventario", "", "", "", "", "", "", "", ""],
      ["", "Inversion Tecnologia", "", "", "", "", "", "", "", ""],
      ["", "Inversion Marketing", "", "", "", "", "", "", "", ""],
      ["", "Garantia", "UF", String(Math.round(contractData.garantiaUF)), "", "", "", "", "", ""],
      ["", "Cobro por Instalaciones", "UF", "", "", "", "", "", "", ""],
      ["", "Tasa de descuento", "", "12%", "", "", "", "", "", ""],
      ["", "Valor UF", "CLP", `$${Math.round(contractData.ufValue).toLocaleString('es-CL')}`, "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", ""],
      ["", "Año", "0", "1", "2", "3", "4", "5", "", ""],
      ["", "Ingresos", "", "", "", "", "", "", "", ""],
      ["", "Costo por ventas", "", "", "", "", "", "", "", ""],
      ["", "Margen directo %", "", "", "", "", "", "", "", ""],
      ["", "EBITDA", "", "", "", "", "", "", "", ""],
      ["", "Flujo operativo", "", "", "", "", "", "", "", ""],
      ["", "PAYBACK", "", "", "", "", "", "", "", ""],
      ["", "Rentabilidad", "", "", "", "", "", "", "", ""],
    ]
  };
};
