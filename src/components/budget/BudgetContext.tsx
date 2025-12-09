import React, { createContext, useContext, ReactNode } from "react";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";

interface BudgetContextType {
  ufValue: number;
  loading: boolean;
  convertUFToPesos: (uf: number) => number;
  convertPesosToUF: (pesos: number) => number;
  formatUF: (amount: number) => string;
  formatCLP: (amount: number) => string;
}

const BudgetContext = createContext<BudgetContextType | null>(null);

export const BudgetProvider = ({ children }: { children: ReactNode }) => {
  const { ufValue, loading, convertUFToPesos, convertPesosToUF } = useEconomicIndicators();

  const formatUF = (amount: number) => {
    return `UF ${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatCLP = (amount: number) => {
    return `$ ${Math.round(amount).toLocaleString("es-CL")}`;
  };

  return (
    <BudgetContext.Provider value={{ ufValue, loading, convertUFToPesos, convertPesosToUF, formatUF, formatCLP }}>
      {children}
    </BudgetContext.Provider>
  );
};

export const useBudgetContext = () => {
  const context = useContext(BudgetContext);
  if (!context) {
    throw new Error("useBudgetContext must be used within BudgetProvider");
  }
  return context;
};
