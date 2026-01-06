import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Loader2, Check, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Company {
  id: string;
  name: string;
}

interface CompanySelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

export const CompanySelect = ({ value, onChange, disabled }: CompanySelectProps) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    const { data } = await supabase
      .from("companies")
      .select("id, name")
      .order("name", { ascending: true });
    
    setCompanies(data || []);
    setLoading(false);
  };

  const toggleCompany = (companyId: string) => {
    if (value.includes(companyId)) {
      onChange(value.filter(id => id !== companyId));
    } else {
      onChange([...value, companyId]);
    }
  };

  const removeCompany = (companyId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter(id => id !== companyId));
  };

  const selectedCompanies = companies.filter(c => value.includes(c.id));

  if (loading) {
    return (
      <div className="space-y-2">
        <Label>Empresa(s)</Label>
        <div className="flex items-center gap-2 h-10 px-3 border rounded-md">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-muted-foreground text-sm">Cargando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Empresa(s)</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-start h-auto min-h-10 font-normal",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            disabled={disabled}
          >
            {selectedCompanies.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {selectedCompanies.map((company) => (
                  <Badge
                    key={company.id}
                    variant="secondary"
                    className="mr-1"
                  >
                    {company.name}
                    <button
                      className="ml-1 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => removeCompany(company.id, e)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-muted-foreground">Seleccionar empresa(s)</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <div className="max-h-60 overflow-auto p-1">
            {companies.map((company) => (
              <div
                key={company.id}
                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-accent rounded-sm"
                onClick={() => toggleCompany(company.id)}
              >
                <Checkbox
                  checked={value.includes(company.id)}
                  onCheckedChange={() => toggleCompany(company.id)}
                />
                <span className="flex-1">{company.name}</span>
                {value.includes(company.id) && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </div>
            ))}
            {companies.length === 0 && (
              <div className="px-2 py-4 text-center text-muted-foreground text-sm">
                No hay empresas registradas
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
