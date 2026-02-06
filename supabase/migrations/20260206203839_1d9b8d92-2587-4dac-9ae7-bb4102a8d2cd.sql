
-- Table for cached economic indicators
CREATE TABLE public.economic_indicators_cache (
  indicator TEXT NOT NULL,
  date DATE NOT NULL,
  value NUMERIC NOT NULL,
  source TEXT NOT NULL DEFAULT 'mindicador.cl',
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_stale BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (indicator, date)
);

-- Index for fast lookups by indicator + date desc
CREATE INDEX idx_eic_indicator_date ON public.economic_indicators_cache (indicator, date DESC);

-- Enable RLS (public read, no public write)
ALTER TABLE public.economic_indicators_cache ENABLE ROW LEVEL SECURITY;

-- Anyone can read (public indicators)
CREATE POLICY "Public read access to economic indicators"
  ON public.economic_indicators_cache
  FOR SELECT
  USING (true);

-- Only service_role can insert/update (edge functions use service role key)
-- No INSERT/UPDATE/DELETE policies for anon/authenticated = blocked by default
