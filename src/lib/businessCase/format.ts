// Formato de números para el Business Case
export const fmtMM = (v: number, dec = 1): string =>
  (v ?? 0).toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec });

export const fmtPct = (v: number, dec = 1): string =>
  `${((v ?? 0) * 100).toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec })}%`;

export const fmtUf = (v: number, dec = 1): string =>
  `${(v ?? 0).toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec })} UF`;

export const fmtClp = (v: number): string =>
  `$${Math.round(v ?? 0).toLocaleString("es-CL")}`;

export const fmtMMClp = (v: number, dec = 1): string => `MM$ ${fmtMM(v, dec)}`;
