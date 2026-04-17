/**
 * midtrans.js
 * ─────────────────────────────────────────────────────────────
 * Konfigurasi dan helper Midtrans payment gateway
 * ─────────────────────────────────────────────────────────────
 */

const midtransClient = require("midtrans-client");

// ──────────────────────── Snap Client ────────────────────────

/**
 * Buat instance Midtrans Snap (untuk generate snap token)
 */
function createSnapClient() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";

  if (!serverKey) {
    throw new Error("MIDTRANS_SERVER_KEY belum di-set di .env");
  }

  return new midtransClient.Snap({
    isProduction,
    serverKey,
    clientKey: process.env.MIDTRANS_CLIENT_KEY || "",
  });
}

// ──────────────────────── Core API Client ────────────────────────

/**
 * Buat instance Midtrans Core API (untuk cek status transaksi)
 */
function createCoreApiClient() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";

  if (!serverKey) {
    throw new Error("MIDTRANS_SERVER_KEY belum di-set di .env");
  }

  return new midtransClient.CoreApi({
    isProduction,
    serverKey,
    clientKey: process.env.MIDTRANS_CLIENT_KEY || "",
  });
}

// ──────────────────────── Transaction Builder ────────────────────────

/**
 * Mapping payment method ke enabled_payments Midtrans
 */
const PAYMENT_METHOD_MAP = {
  qris: ["other_qris", "gopay"],
  bank_transfer: ["bca_va", "bni_va", "bri_va", "permata_va", "echannel"],
  ewallet: ["gopay", "shopeepay", "dana"],
  convenience_store: ["indomaret", "alfamart"],
};

/**
 * Build parameter transaksi Midtrans Snap
 *
 * @param {Object} params
 * @param {string} params.orderId - Unique order ID
 * @param {number} params.amount - Harga dalam rupiah
 * @param {string} params.paymentMethod - qris | bank_transfer | ewallet | convenience_store
 * @param {number} params.pageCount - Jumlah halaman dokumen
 * @param {string} params.planName - Nama paket: Starter | Standard | Pro
 * @returns {Object} Midtrans transaction parameter
 */
function buildTransactionParams({
  orderId,
  amount,
  paymentMethod,
  pageCount,
  planName,
}) {
  const enabledPayments = PAYMENT_METHOD_MAP[paymentMethod] || [];

  const params = {
    transaction_details: {
      order_id: orderId,
      gross_amount: amount,
    },
    item_details: [
      {
        id: `plagiarcheck-${planName.toLowerCase()}`,
        price: amount,
        quantity: 1,
        name: `PlagiarCheck Paket ${planName} (${pageCount} hal)`,
        category: "plagiarism_check",
      },
    ],
    customer_details: {
      // Data minimal (karena tanpa akun)
      first_name: "PlagiarCheck User",
      email: "user@plagiarcheck.id",
    },
    callbacks: {
      finish: `${process.env.FRONTEND_URL || "http://localhost:3000"}/status/${orderId}`,
      error: `${process.env.FRONTEND_URL || "http://localhost:3000"}/status/${orderId}?error=true`,
      pending: `${process.env.FRONTEND_URL || "http://localhost:3000"}/status/${orderId}?pending=true`,
    },
    // Hanya tampilkan payment method yang dipilih user
    ...(enabledPayments.length > 0 && {
      enabled_payments: enabledPayments,
    }),
    // Expire dalam 1 jam
    expiry: {
      start_time: new Date()
        .toISOString()
        .replace("T", " ")
        .replace("Z", " +0700")
        .slice(0, 23) + " +0700",
      unit: "hour",
      duration: 1,
    },
  };

  return params;
}

/**
 * Buat transaksi Snap dan dapatkan token
 *
 * @param {Object} params - Transaction parameters (dari buildTransactionParams)
 * @returns {Promise<{ token: string, redirect_url: string }>}
 */
async function createTransaction(params) {
  const snap = createSnapClient();

  try {
    const transaction = await snap.createTransaction(params);
    return {
      token: transaction.token,
      redirect_url: transaction.redirect_url,
    };
  } catch (err) {
    console.error("[Midtrans] Error creating transaction:", err.message);

    // Handle specific Midtrans errors
    if (err.ApiResponse) {
      const apiError = err.ApiResponse;
      throw new Error(
        `Midtrans Error: ${apiError.status_message || "Unknown error"} (${apiError.status_code})`
      );
    }

    throw new Error(`Gagal membuat transaksi pembayaran: ${err.message}`);
  }
}

/**
 * Cek status transaksi di Midtrans
 *
 * @param {string} orderId
 * @returns {Promise<Object>} Status transaksi dari Midtrans
 */
async function checkTransactionStatus(orderId) {
  const coreApi = createCoreApiClient();

  try {
    const status = await coreApi.transaction.status(orderId);
    return status;
  } catch (err) {
    console.error("[Midtrans] Error checking status:", err.message);
    throw new Error(`Gagal mengecek status pembayaran: ${err.message}`);
  }
}

/**
 * Verifikasi notifikasi webhook dari Midtrans
 *
 * @param {Object} notificationBody - Body dari webhook POST
 * @returns {Promise<Object>} Status terverifikasi
 */
async function verifyNotification(notificationBody) {
  const coreApi = createCoreApiClient();

  try {
    const statusResponse =
      await coreApi.transaction.notification(notificationBody);
    return statusResponse;
  } catch (err) {
    console.error("[Midtrans] Error verifying notification:", err.message);
    throw new Error(`Gagal memverifikasi notifikasi: ${err.message}`);
  }
}

module.exports = {
  createSnapClient,
  createCoreApiClient,
  buildTransactionParams,
  createTransaction,
  checkTransactionStatus,
  verifyNotification,
  PAYMENT_METHOD_MAP,
};
