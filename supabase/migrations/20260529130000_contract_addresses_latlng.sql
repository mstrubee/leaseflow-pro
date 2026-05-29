-- Add lat/lng to contract_addresses for geocoding
alter table contract_addresses
  add column if not exists lat numeric(12,10),
  add column if not exists lng numeric(12,10),
  add column if not exists geocoded_at timestamptz,
  add column if not exists geocode_source text; -- 'nominatim' | 'manual'

create index if not exists idx_contract_addresses_latlng
  on contract_addresses (lat, lng)
  where lat is not null and lng is not null;
