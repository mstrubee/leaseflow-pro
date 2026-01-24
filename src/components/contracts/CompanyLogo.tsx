import logoAgroplanet from "@/assets/logo-agroplanet.png";
import logoAutoplanet from "@/assets/logo-autoplanet.png";
import { cn } from "@/lib/utils";

interface CompanyLogoProps {
  companyName: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Displays the company logo (Agroplanet or Autoplanet) based on the company name.
 * Returns null if the company name doesn't match either company.
 */
export const CompanyLogo = ({ companyName, size = "sm", className }: CompanyLogoProps) => {
  if (!companyName) return null;

  const lowerName = companyName.toLowerCase();
  
  const isAgroplanet = lowerName.includes("agroplanet");
  const isAutoplanet = lowerName.includes("autoplanet");

  if (!isAgroplanet && !isAutoplanet) return null;

  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  };

  const logo = isAgroplanet ? logoAgroplanet : logoAutoplanet;
  const alt = isAgroplanet ? "Agroplanet" : "Autoplanet";

  return (
    <img
      src={logo}
      alt={alt}
      className={cn(
        sizeClasses[size],
        "rounded object-contain flex-shrink-0",
        className
      )}
    />
  );
};

/**
 * Helper function to get the primary company name from a contract's companies array.
 * Returns the first Agroplanet or Autoplanet company found.
 */
export const getPrimaryCompanyName = (
  contractCompanies: Array<{ companies?: { name: string } | null }> | null | undefined
): string | null => {
  if (!contractCompanies || contractCompanies.length === 0) return null;

  // First, try to find Agroplanet or Autoplanet
  for (const cc of contractCompanies) {
    const name = cc.companies?.name?.toLowerCase() || "";
    if (name.includes("agroplanet") || name.includes("autoplanet")) {
      return cc.companies?.name || null;
    }
  }

  // If no Agroplanet/Autoplanet, return the first company name
  return contractCompanies[0]?.companies?.name || null;
};
