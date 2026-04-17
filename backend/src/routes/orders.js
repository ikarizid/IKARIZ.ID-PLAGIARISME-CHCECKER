/**
 * orders.js — Route: POST /api/create-order
 * ─────────────────────────────────────────────────────────────
 * Membuat transaksi pembayaran Midtrans dan menyimpan order
 * ─────────────────────────────────────────────────────────────
 */

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { selectPlan } = require("../utils/detectFileInfo");
const { createOrder } = require("../utils/database");
const {
  buildTransactionParams,
  createTransaction,
} = require("../utils/midtrans");

const router = express.Router();

// ──────────────────────── Validation ────────────────────────

const VALID_PAYMENT_METHODS = [
  "qris",
  "bank_transfer",
  "ewallet",
  "convenience_store",
];

const VALID_AMOUNTS = [3000, 12000, 25000];

/**
 * Validasi bahwa amount sesuai dengan pageCount
 */
function validateAmountForPages(amount, pageCount) {
  const expectedPlan = selectPlan(pageCount);
  if (expectedPlan.price !== amount) {
    return {
      valid: false,
      error: `Harga tidak sesuai. ${pageCount} halaman seharusnya ${expectedPlan.name} (Rp ${expectedPlan.price.toLocaleString("id-ID")}), bukan Rp ${amount.toLocaleString("id-ID")}.`,
      expectedAmount: expectedPlan.price,
      expectedPlan: expectedPlan.name,
    };
  }
  return { valid: true, plan: expectedPlan };
}

// ──────────────────────── POST /api/create-order ────────────────────────

router.post("/create-order", async (req, res) => {
  try {
    const { orderId, amount, paymentMethod, fileId, pageCount, fileName } =
      req.body;

    // ── Validate required fields ──
    const missing = [];
    if (!amount) missing.push("amount");
    if (!paymentMethod) missing.push("paymentMethod");
    if (!fileId) missing.push("fileId");
    if (!pageCount) missing.push("pageCount");

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Field berikut wajib diisi: ${missing.join(", ")}`,
      });
    }

    // ── Validate types ──
    if (typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: "Amount harus berupa angka positif.",
      });
    }

    if (typeof pageCount !== "number" || pageCount <= 0) {
      return res.status(400).json({
        success: false,
        error: "pageCount harus berupa angka positif.",
      });
    }

    // ── Validate amount matches page count ──
    if (!VALID_AMOUNTS.includes(amount)) {
      return res.status(400).json({
        success: false,
        error: `Amount tidak valid. Harga yang tersedia: ${VALID_AMOUNTS.map((a) => `Rp ${a.toLocaleString("id-ID")}`).join(", ")}`,
      });
    }

    const amountValidation = validateAmountForPages(amount, pageCount);
    if (!amountValidation.valid) {
      return res.status(400).json({
        success: false,
        error: amountValidation.error,
        expectedAmount: amountValidation.expectedAmount,
        expectedPlan: amountValidation.expectedPlan,
      });
    }

    // ── Validate payment method ──
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        error: `Metode pembayaran tidak valid. Pilihan: ${VALID_PAYMENT_METHODS.join(", ")}`,
      });
    }

    // ── Generate order ID if not provided ──
    const finalOrderId = orderId || `PC-${Date.now()}-${uuidv4().slice(0, 8)}`;
    const plan = amountValidation.plan;

    // ── Build Midtrans transaction ──
    const txParams = buildTransactionParams({
      orderId: finalOrderId,
      amount,
      paymentMethod,
      pageCount,
      planName: plan.name,
    });

    console.log(`[Order] Creating transaction: ${finalOrderId}`);
    console.log(
      `[Order] Plan: ${plan.name} | Pages: ${pageCount} | Amount: Rp ${amount.toLocaleString()}`
    );

    // ── Create Midtrans Snap transaction ──
    const { token, redirect_url } = await createTransaction(txParams);

    // ── Save order to database ──
    const orderData = {
      order_id: finalOrderId,
      file_id: fileId,
      file_name: fileName || null,
      page_count: pageCount,
      plan_name: plan.name,
      amount,
      payment_method: paymentMethod,
      status: "pending",
      snap_token: token,
      snap_redirect_url: redirect_url,
    };

    await createOrder(orderData);
    console.log(`[Order] Order saved: ${finalOrderId} (status: pending)`);

    // ── Return response ──
    return res.status(201).json({
      success: true,
      snapToken: token,
      redirectUrl: redirect_url,
      orderId: finalOrderId,
      plan: plan.name,
      amount,
    });
  } catch (err) {
    console.error("[Order] Error:", err.message);

    // Midtrans-specific errors
    if (err.message.includes("Midtrans")) {
      return res.status(502).json({
        success: false,
        error: "Gagal terhubung ke payment gateway. Coba lagi.",
        detail: err.message,
      });
    }

    // Database errors
    if (err.message.includes("order") || err.message.includes("database")) {
      return res.status(500).json({
        success: false,
        error: "Gagal menyimpan transaksi. Coba lagi.",
        detail: err.message,
      });
    }

    return res.status(500).json({
      success: false,
      error: "Terjadi kesalahan server. Coba lagi nanti.",
    });
  }
});

// ──────────────────────── GET /api/order/:orderId ────────────────────────

router.get("/order/:orderId", async (req, res) => {
  try {
    const { getOrder } = require("../utils/database");
    const order = await getOrder(req.params.orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order tidak ditemukan.",
      });
    }

    return res.json({
      success: true,
      order: {
        orderId: order.order_id,
        status: order.status,
        amount: order.amount,
        planName: order.plan_name,
        pageCount: order.page_count,
        paymentMethod: order.payment_method,
        createdAt: order.created_at,
        paidAt: order.paid_at,
      },
    });
  } catch (err) {
    console.error("[Order] Error fetching:", err.message);
    return res.status(500).json({
      success: false,
      error: "Gagal mengambil data order.",
    });
  }
});

// ──────────────────────── GET /api/status/:orderId ────────────────────────

router.get("/status/:orderId", async (req, res) => {
  try {
    const { getOrder, getResultByOrderId } = require("../utils/database");
    const order = await getOrder(req.params.orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order tidak ditemukan.",
      });
    }

    const responseData = {
      success: true,
      orderId: order.order_id,
      status: order.status,
      planName: order.plan_name,
      pageCount: order.page_count,
    };

    if (order.status === "completed") {
      const result = await getResultByOrderId(order.order_id);
      if (result) {
        responseData.similarity = result.similarity_score;
        responseData.downloadUrl = result.report_file_url;
      }
    }

    return res.json(responseData);
  } catch (err) {
    console.error("[Status] Error fetching:", err.message);
    return res.status(500).json({
      success: false,
      error: "Gagal mengambil status order.",
    });
  }
});

module.exports = router;
