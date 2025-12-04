import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ContractLocation {
  contractId: string;
  contractName: string;
  region: string;
  commune: string;
  street: string;
  number: string;
  country: string;
}

export interface RegionData {
  region: string;
  count: number;
  contracts: ContractLocation[];
  communes: { [commune: string]: ContractLocation[] };
}

export interface CountryContractsData {
  [region: string]: RegionData;
}

export function useContractsByRegion(country: string) {
  const [data, setData] = useState<CountryContractsData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchContracts = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: addresses, error: fetchError } = await supabase
          .from("contract_addresses")
          .select(`
            *,
            contracts:contract_id (
              id,
              name,
              status,
              deleted_at
            )
          `)
          .eq("country", country);

        if (fetchError) throw fetchError;

        const regionMap: CountryContractsData = {};

        addresses?.forEach((addr) => {
          // Skip deleted contracts or contracts not firmado
          if (addr.contracts?.deleted_at || addr.contracts?.status !== "firmado") return;

          const region = addr.region;
          const commune = addr.commune;

          if (!regionMap[region]) {
            regionMap[region] = {
              region,
              count: 0,
              contracts: [],
              communes: {}
            };
          }

          const contractLocation: ContractLocation = {
            contractId: addr.contract_id,
            contractName: addr.contracts?.name || "Sin nombre",
            region,
            commune,
            street: addr.street,
            number: addr.number,
            country: addr.country
          };

          regionMap[region].count++;
          regionMap[region].contracts.push(contractLocation);

          if (!regionMap[region].communes[commune]) {
            regionMap[region].communes[commune] = [];
          }
          regionMap[region].communes[commune].push(contractLocation);
        });

        setData(regionMap);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar datos");
      } finally {
        setLoading(false);
      }
    };

    fetchContracts();
  }, [country]);

  return { data, loading, error };
}
