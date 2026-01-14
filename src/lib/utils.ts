import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Maximum decimal places for display throughout the system
export const MAX_DECIMALS_UF = 2; // For UF display
export const MAX_DECIMALS_UF_M2 = 3; // For UF/m² display and inputs

// Format UF values with up to 2 decimals (for display)
export function formatUF(amount: number, includePrefix = true): string {
  const formatted = amount.toLocaleString("es-CL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: MAX_DECIMALS_UF,
  });
  return includePrefix ? `UF ${formatted}` : formatted;
}

// Format CLP values (no decimals for currency)
export function formatCLP(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);
}

// Format generic number with up to 2 decimals
export function formatNumber(amount: number, minDecimals = 2): string {
  return amount.toLocaleString("es-CL", {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: MAX_DECIMALS_UF,
  });
}

// Format UF/m² values with up to 3 decimals
export function formatUfM2(amount: number): string {
  return `${amount.toLocaleString("es-CL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: MAX_DECIMALS_UF_M2,
  })} UF/m²`;
}
