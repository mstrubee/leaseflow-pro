ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS contract_signed_pending boolean DEFAULT false;
