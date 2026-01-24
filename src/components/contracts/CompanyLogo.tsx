import { cn } from "@/lib/utils";
import { useAppLogos } from "@/hooks/useAppLogos";

interface CompanyLogoProps {
  companyName?: string | null;
  companyNames?: string[];
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Displays the company logo(s) (Agroplanet and/or Autoplanet) based on the company name(s).
 * Supports both single companyName and multiple companyNames.
 * Returns null if no company names match either company.
 */
export const CompanyLogo = ({ companyName, companyNames, size = "sm", className }: CompanyLogoProps) => {
  const { logos } = useAppLogos();
  
  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  };

  // Collect all names to check
  const namesToCheck: string[] = [];
  if (companyName) namesToCheck.push(companyName);
  if (companyNames) namesToCheck.push(...companyNames);

  if (namesToCheck.length === 0) return null;

  // Check which companies are present
  let hasAgroplanet = false;
  let hasAutoplanet = false;

  for (const name of namesToCheck) {
    const lowerName = name.toLowerCase();
    if (lowerName.includes("agroplanet")) hasAgroplanet = true;
    if (lowerName.includes("autoplanet")) hasAutoplanet = true;
  }

  if (!hasAgroplanet && !hasAutoplanet) return null;

  // If both companies, show both logos
  if (hasAgroplanet && hasAutoplanet) {
    return (
      <div className="flex flex-col gap-0.5 flex-shrink-0">
        <img
          src={logos.agroplanet}
          alt="Agroplanet"
          className={cn(sizeClasses[size], "rounded object-contain", className)}
        />
        <img
          src={logos.autoplanet}
          alt="Autoplanet"
          className={cn(sizeClasses[size], "rounded object-contain", className)}
        />
      </div>
    );
  }

  // Single company logo
  const logo = hasAgroplanet ? logos.agroplanet : logos.autoplanet;
  const alt = hasAgroplanet ? "Agroplanet" : "Autoplanet";

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
 * Helper function to get all company names from a contract's companies array.
 */
export const getCompanyNames = (
  contractCompanies: Array<{ companies?: { name: string } | null }> | null | undefined
): string[] => {
  if (!contractCompanies || contractCompanies.length === 0) return [];
  
  return contractCompanies
    .map(cc => cc.companies?.name)
    .filter((name): name is string => !!name);
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
