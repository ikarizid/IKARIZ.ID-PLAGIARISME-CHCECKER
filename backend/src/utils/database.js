/**
 * database.js
 * ─────────────────────────────────────────────────────────────
 * Koneksi ke database Supabase (PostgreSQL)
 * ─────────────────────────────────────────────────────────────
 */

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const hasValidConfig =
  supabaseUrl &&
  supabaseKey &&
  !supabaseUrl.includes("your-project") &&
  !supabaseKey.includes("your-supabase");

if (!hasValidConfig) {
  console.warn(
    "⚠️  SUPABASE_URL atau SUPABASE_SERVICE_KEY belum di-set dengan nilai valid di .env"
  );
}

// Use a safe placeholder URL so the module can load without crashing
const safeUrl = supabaseUrl && supabaseUrl.startsWith("https://")
  ? supabaseUrl
  : "https://placeholder.supabase.co";

const supabase = createClient(safeUrl, supabaseKey || "placeholder-key", {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// ──────────────────────── Orders ────────────────────────

/**
 * Simpan order baru ke database
 */
async function createOrder(orderData) {
  const { data, error } = await supabase
    .from("orders")
    .insert([orderData])
    .select()
    .single();

  if (error) {
    console.error("[DB] Error creating order:", error.message);
    throw new Error(`Gagal menyimpan order: ${error.message}`);
  }

  return data;
}

/**
 * Update order berdasarkan order_id
 */
async function updateOrder(orderId, updates) {
  const { data, error } = await supabase
    .from("orders")
    .update(updates)
    .eq("order_id", orderId)
    .select()
    .single();

  if (error) {
    console.error("[DB] Error updating order:", error.message);
    throw new Error(`Gagal mengupdate order: ${error.message}`);
  }

  return data;
}

/**
 * Ambil order berdasarkan order_id
 */
async function getOrder(orderId) {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("order_id", orderId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw new Error(`Gagal mengambil order: ${error.message}`);
  }

  return data;
}

// ──────────────────────── Analysis Jobs ────────────────────────

/**
 * Buat analysis job baru
 */
async function createAnalysisJob(jobData) {
  const { data, error } = await supabase
    .from("analysis_jobs")
    .insert([jobData])
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal membuat analysis job: ${error.message}`);
  }

  return data;
}

/**
 * Update analysis job
 */
async function updateAnalysisJob(jobId, updates) {
  const { data, error } = await supabase
    .from("analysis_jobs")
    .update(updates)
    .eq("id", jobId)
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal mengupdate analysis job: ${error.message}`);
  }

  return data;
}

/**
 * Ambil analysis job berdasarkan order_id
 */
async function getAnalysisJobByOrderId(orderId) {
  const { data, error } = await supabase
    .from("analysis_jobs")
    .select("*")
    .eq("order_id", orderId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Gagal mengambil analysis job: ${error.message}`);
  }

  return data;
}

// ──────────────────────── Results ────────────────────────

/**
 * Simpan hasil analisis
 */
async function createResult(resultData) {
  const { data, error } = await supabase
    .from("results")
    .insert([resultData])
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal menyimpan hasil: ${error.message}`);
  }

  return data;
}

/**
 * Ambil hasil berdasarkan download token
 */
async function getResultByToken(downloadToken) {
  const { data, error } = await supabase
    .from("results")
    .select("*")
    .eq("download_token", downloadToken)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Gagal mengambil hasil: ${error.message}`);
  }

  return data;
}

/**
 * Ambil hasil berdasarkan order_id
 */
async function getResultByOrderId(orderId) {
  const { data, error } = await supabase
    .from("results")
    .select("*")
    .eq("order_id", orderId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Gagal mengambil hasil: ${error.message}`);
  }

  return data;
}

module.exports = {
  supabase,
  createOrder,
  updateOrder,
  getOrder,
  createAnalysisJob,
  updateAnalysisJob,
  getAnalysisJobByOrderId,
  createResult,
  getResultByToken,
  getResultByOrderId,
};
