import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Maximum decimal places for display throughout the system
export const MAX_DECIMALS = 3;

// Format UF values with up to 3 decimals
export function formatUF(amount: number, includePrefix = true): string {
  const formatted = amount.toLocaleString("es-CL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: MAX_DECIMALS,
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

// Format generic number with up to 3 decimals
export function formatNumber(amount: number, minDecimals = 2): string {
  return amount.toLocaleString("es-CL", {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: MAX_DECIMALS,
  });
}

// Format UF/m² values with up to 3 decimals
export function formatUfM2(amount: number): string {
  return `${formatNumber(amount, 2)} UF/m²`;
}
