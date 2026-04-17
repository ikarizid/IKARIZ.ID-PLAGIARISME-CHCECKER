-- ════════════════════════════════════════════════════════════
-- PlagiarCheck — Database Schema
-- Jalankan SQL ini di Supabase SQL Editor
-- ════════════════════════════════════════════════════════════

-- ─── Tabel Orders ────────────────────────────────────────
-- Menyimpan semua transaksi pembayaran
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(100) UNIQUE NOT NULL,
  file_id VARCHAR(255) NOT NULL,
  file_name VARCHAR(500),
  page_count INTEGER NOT NULL,
  plan_name VARCHAR(50) NOT NULL DEFAULT 'Starter',
  amount INTEGER NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  status VARCHAR(30) DEFAULT 'pending',
  snap_token VARCHAR(500),
  snap_redirect_url TEXT,
  midtrans_transaction_id VARCHAR(255),
  payment_type VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  paid_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  expired_at TIMESTAMP WITH TIME ZONE
);

-- Index untuk query yang sering dipakai
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_file_id ON orders(file_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

-- ─── Tabel Analysis Jobs ────────────────────────────────
-- Menyimpan status pemrosesan AI
CREATE TABLE IF NOT EXISTS analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(100) REFERENCES orders(order_id) ON DELETE CASCADE,
  file_id VARCHAR(255) NOT NULL,
  status VARCHAR(30) DEFAULT 'queued',
  -- queued | processing | analyzing | generating_report | completed | failed
  progress INTEGER DEFAULT 0,
  -- 0-100 percent
  total_paragraphs INTEGER DEFAULT 0,
  analyzed_paragraphs INTEGER DEFAULT 0,
  similarity_score DECIMAL(5,2),
  -- Overall similarity percentage
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_order_id ON analysis_jobs(order_id);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON analysis_jobs(status);

-- ─── Tabel Results ──────────────────────────────────────
-- Menyimpan hasil analisis dan link download
CREATE TABLE IF NOT EXISTS results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR(100) REFERENCES orders(order_id) ON DELETE CASCADE,
  job_id UUID REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  original_file_url TEXT,
  report_file_url TEXT,
  download_token VARCHAR(255) UNIQUE,
  similarity_score DECIMAL(5,2),
  internet_score DECIMAL(5,2),
  publication_score DECIMAL(5,2),
  student_paper_score DECIMAL(5,2),
  sources_found INTEGER DEFAULT 0,
  sources_json JSONB,
  -- Array of { url, title, similarity }
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours'),
  download_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_results_order_id ON results(order_id);
CREATE INDEX IF NOT EXISTS idx_results_download_token ON results(download_token);
CREATE INDEX IF NOT EXISTS idx_results_expires_at ON results(expires_at);

-- ─── RLS (Row Level Security) ───────────────────────────
-- Aktifkan RLS untuk keamanan
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;

-- Policy: service role bisa akses semua
CREATE POLICY "Service role full access on orders"
  ON orders FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on analysis_jobs"
  ON analysis_jobs FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on results"
  ON results FOR ALL
  USING (true)
  WITH CHECK (true);
