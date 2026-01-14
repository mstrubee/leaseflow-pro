import React, { createContext, useContext, ReactNode, useState } from "react";
import { useEconomicIndicators } from "@/hooks/useEconomicIndicators";

interface BudgetContextType {
  ufValue: number;
  loading: boolean;
  displayCurrency: "UF" | "CLP";
  setDisplayCurrency: (currency: "UF" | "CLP") => void;
  convertUFToPesos: (uf: number) => number;
  convertPesosToUF: (pesos: number) => number;
  formatUF: (amount: number) => string;
  formatCLP: (amount: number) => string;
  formatPrimary: (amountUF: number) => string;
  formatSecondary: (amountUF: number) => string;
}

const BudgetContext = createContext<BudgetContextType | null>(null);

interface BudgetProviderProps {
  children: ReactNode;
  initialCurrency?: "UF" | "CLP";
}

export const BudgetProvider = ({ children, initialCurrency = "UF" }: BudgetProviderProps) => {
  const { ufValue, loading, convertUFToPesos, convertPesosToUF } = useEconomicIndicators();
  const [displayCurrency, setDisplayCurrency] = useState<"UF" | "CLP">(initialCurrency);

  const formatUF = (amount: number) => {
    return `UF ${amount.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
  };

  const formatCLP = (amount: number) => {
    return `$ ${Math.round(amount).toLocaleString("es-CL")}`;
  };

  // Format based on selected display currency (amount is always in UF)
  const formatPrimary = (amountUF: number) => {
    if (displayCurrency === "CLP") {
      return formatCLP(convertUFToPesos(amountUF));
    }
    return formatUF(amountUF);
  };

  // Format the secondary currency (the one NOT selected)
  const formatSecondary = (amountUF: number) => {
    if (displayCurrency === "CLP") {
      return formatUF(amountUF);
    }
    return formatCLP(convertUFToPesos(amountUF));
  };

  return (
    <BudgetContext.Provider value={{ 
      ufValue, 
      loading, 
      displayCurrency,
      setDisplayCurrency,
      convertUFToPesos, 
      convertPesosToUF, 
      formatUF, 
      formatCLP,
      formatPrimary,
      formatSecondary,
    }}>
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
