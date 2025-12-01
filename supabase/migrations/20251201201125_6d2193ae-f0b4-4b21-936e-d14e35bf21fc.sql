-- Create enum for contract status
CREATE TYPE contract_status AS ENUM ('en_negociacion', 'firmado', 'vencido');

-- Create enum for document type
CREATE TYPE document_type AS ENUM ('borrador', 'borrador_final', 'firmado');

-- Create enum for notice type
CREATE TYPE notice_type AS ENUM ('fecha', 'meses');

-- Create contracts table
CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status contract_status NOT NULL DEFAULT 'en_negociacion',
  signed_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create contract addresses table
CREATE TABLE contract_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  commune TEXT NOT NULL,
  region TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'Chile',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create contract contacts table
CREATE TABLE contract_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create contract versions table (for commercial conditions)
CREATE TABLE contract_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  is_renegotiation BOOLEAN NOT NULL DEFAULT FALSE,
  initial_rent DECIMAL(15, 2),
  regime_rent DECIMAL(15, 2) NOT NULL,
  duration_months INTEGER NOT NULL,
  notice_type notice_type NOT NULL,
  notice_value TEXT NOT NULL,
  effective_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contract_id, version_number)
);

-- Create rent escalations table
CREATE TABLE rent_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES contract_versions(id) ON DELETE CASCADE,
  month_number INTEGER NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(version_id, month_number)
);

-- Create contract documents table
CREATE TABLE contract_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  version_id UUID REFERENCES contract_versions(id) ON DELETE SET NULL,
  document_type document_type NOT NULL,
  url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create finalized contracts table
CREATE TABLE finalized_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  final_conditions JSONB NOT NULL
);

-- Enable RLS
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE finalized_contracts ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allowing all authenticated users for now - can be refined later)
CREATE POLICY "Allow all for authenticated users" ON contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON contract_addresses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON contract_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON contract_versions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON rent_escalations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON contract_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated users" ON finalized_contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for contracts
CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_contracts_status ON contracts(status);
CREATE INDEX idx_contract_addresses_contract_id ON contract_addresses(contract_id);
CREATE INDEX idx_contract_contacts_contract_id ON contract_contacts(contract_id);
CREATE INDEX idx_contract_versions_contract_id ON contract_versions(contract_id);
CREATE INDEX idx_contract_versions_current ON contract_versions(contract_id, is_current) WHERE is_current = true;
CREATE INDEX idx_rent_escalations_version_id ON rent_escalations(version_id);
CREATE INDEX idx_contract_documents_contract_id ON contract_documents(contract_id);