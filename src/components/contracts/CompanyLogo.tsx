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
  let hasGrupoPlanet = false;

  for (const name of namesToCheck) {
    const lowerName = name.toLowerCase();
    if (/grupo\s*planet/.test(lowerName)) hasGrupoPlanet = true;
    else if (lowerName.includes("agroplanet")) hasAgroplanet = true;
    else if (lowerName.includes("autoplanet")) hasAutoplanet = true;
  }

  if (!hasAgroplanet && !hasAutoplanet && !hasGrupoPlanet) return null;

  // Mostrar todos los logos presentes (Agroplanet / Autoplanet / Grupo Planet)
  const present: { src: string; alt: string }[] = [];
  if (hasGrupoPlanet) present.push({ src: logos.grupoPlanet, alt: "Grupo Planet" });
  if (hasAgroplanet) present.push({ src: logos.agroplanet, alt: "Agroplanet" });
  if (hasAutoplanet) present.push({ src: logos.autoplanet, alt: "Autoplanet" });

  if (present.length > 1) {
    return (
      <div className="flex flex-row gap-0.5 flex-shrink-0">
        {present.map((p) => (
          <img key={p.alt} src={p.src} alt={p.alt}
            className={cn(sizeClasses[size], "rounded object-contain", className)} />
        ))}
      </div>
    );
  }

  return (
    <img
      src={present[0].src}
      alt={present[0].alt}
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
    if (name.includes("agroplanet") || name.includes("autoplanet") || /grupo\s*planet/.test(name)) {
      return cc.companies?.name || null;
    }
  }

  // If no Agroplanet/Autoplanet, return the first company name
  return contractCompanies[0]?.companies?.name || null;
};
