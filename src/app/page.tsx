"use client";

import { useState, useCallback, useRef, useEffect } from "react";

/* ─── Types ─── */
interface PricePlan {
  name: string;
  minPages: number;
  maxPages: number | null;
  price: number;
  label: string;
  icon: string;
}

type PaymentMethod = "qris" | "bank" | "ewallet" | "minimarket" | null;

/* ─── Constants ─── */
const PLANS: PricePlan[] = [
  { name: "Starter", minPages: 1, maxPages: 30, price: 3000, label: "Abstrak, makalah pendek, essay", icon: "📄" },
  { name: "Standard", minPages: 31, maxPages: 100, price: 12000, label: "Skripsi bab, proposal penelitian", icon: "📑" },
  { name: "Pro", minPages: 101, maxPages: null, price: 25000, label: "Tesis, disertasi, laporan lengkap", icon: "📚" },
];

const PAYMENT_METHODS = [
  { id: "qris" as const, name: "QRIS", desc: "Scan & bayar dari aplikasi apapun" },
  { id: "bank" as const, name: "Transfer Bank", desc: "BCA, Mandiri, BRI, BNI" },
  { id: "ewallet" as const, name: "E-Wallet", desc: "GoPay, OVO, Dana, ShopeePay" },
  { id: "minimarket" as const, name: "Minimarket", desc: "Indomaret, Alfamart" },
];

const ACCEPTED_EXT = [".pdf", ".docx", ".txt"];
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/* ─── Helpers ─── */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
function formatCurrency(amount: number): string {
  return "Rp " + amount.toLocaleString("id-ID");
}
function getFileExtension(name: string): string {
  return name.substring(name.lastIndexOf(".")).toLowerCase();
}
function detectPages(file: File): number {
  const ext = getFileExtension(file.name);
  const sizeKB = file.size / 1024;
  if (ext === ".pdf") return Math.max(1, Math.round(sizeKB / 70));
  if (ext === ".docx") return Math.max(1, Math.round(sizeKB / 20));
  return Math.max(1, Math.round(sizeKB / 3));
}
function selectPlan(pages: number): PricePlan {
  if (pages <= 30) return PLANS[0];
  if (pages <= 100) return PLANS[1];
  return PLANS[2];
}
function isValidFile(file: File): { valid: boolean; error?: string } {
  const ext = getFileExtension(file.name);
  if (!ACCEPTED_EXT.includes(ext))
    return { valid: false, error: `Format ${ext} tidak didukung. Gunakan PDF, DOCX, atau TXT.` };
  if (file.size > MAX_FILE_SIZE)
    return { valid: false, error: `File terlalu besar (${formatFileSize(file.size)}). Maks 50 MB.` };
  return { valid: true };
}

/* ─── Icon Components ─── */
function IconUpload({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
function IconCheck({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
function IconHome({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
function IconShield({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function IconInfo({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
function IconMenu({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
function IconX({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/* ─── Component ─── */
export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [selectedPlan, setSelectedPlan] = useState<PricePlan | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canPay = file && selectedPlan && selectedPayment && !isDetecting && !isPaying;

  const handleFile = useCallback((selectedFile: File) => {
    setFileError(null);
    setShowResults(false);
    setSelectedPayment(null);
    const validation = isValidFile(selectedFile);
    if (!validation.valid) { setFileError(validation.error!); return; }
    setFile(selectedFile);
    setIsDetecting(true);
    const delay = 1200 + Math.random() * 800;
    setTimeout(() => {
      const pages = detectPages(selectedFile);
      setPageCount(pages);
      setSelectedPlan(selectPlan(pages));
      setIsDetecting(false);
      setShowResults(true);
    }, delay);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFile(droppedFile);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback(() => { setIsDragOver(false); }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) handleFile(selected);
  }, [handleFile]);

  const handleReset = useCallback(() => {
    setFile(null); setPageCount(0); setSelectedPlan(null); setSelectedPayment(null);
    setIsDetecting(false); setFileError(null); setShowResults(false); setIsPaying(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handlePay = useCallback(async () => {
    if (!canPay) return;
    setIsPaying(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || `http://${window.location.hostname}:5000`;
      const formData = new FormData();
      formData.append("file", file!);
      const uploadRes = await fetch(`${apiUrl}/api/upload`, { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadData.success) { alert("Gagal upload file: " + uploadData.error); setIsPaying(false); return; }

      const orderRes = await fetch(`${apiUrl}/api/create-order`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: selectedPlan!.price, paymentMethod: selectedPayment, fileId: uploadData.fileId, pageCount: uploadData.pageCount, fileName: uploadData.fileName }),
      });
      const orderData = await orderRes.json();
      if (!orderData.success) { alert("Gagal membuat transaksi: " + orderData.error); setIsPaying(false); return; }
      window.location.href = orderData.redirectUrl;
    } catch (e: any) {
      alert("Terjadi kesalahan: " + e.message);
      setIsPaying(false);
    }
  }, [canPay, file, pageCount, selectedPlan, selectedPayment]);

  return (
    <div className="dashboard">
      {/* ─── Sidebar Overlay (Mobile) ─── */}
      <div className={`sidebar-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />

      {/* ─── Sidebar ─── */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
              <IconCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white/90 leading-tight">Plagiarisme Checker</p>
              <p className="text-[10px] text-white/25 font-medium">by Ikariz id</p>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button className="sidebar-nav-item active">
            <IconHome /> <span>Beranda</span>
          </button>
          <button className="sidebar-nav-item" onClick={() => alert("Fitur riwayat dalam tahap pengembangan.")}>
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={1.8}>
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            </svg>
            <span>Riwayat Laporan</span>
          </button>
          <button className="sidebar-nav-item" onClick={() => alert("Menghubungi layanan pelanggan...")}>
            <IconInfo /> <span>Bantuan & Support</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="flex items-center gap-2 text-[10px] text-white/15">
            <IconShield className="w-3 h-3" />
            <span>v1.0 Beta</span>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="main-content">
        {/* ─── Topbar ─── */}
        <div className="topbar">
          <div className="flex items-center gap-3">
            <button className="md:hidden text-white/50 hover:text-white" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <IconMenu />
            </button>
            <div>
              <h1 className="text-sm font-semibold text-white">Cek Plagiarisme</h1>
              <p className="text-[10px] text-white/25 hidden sm:block">Upload dokumen untuk mulai analisis AI</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge-beta">Beta</span>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-[10px] font-bold text-white shadow-md">
              U
            </div>
          </div>
        </div>

        {/* ─── Content ─── */}
        <div className="content-area">
          {/* ── Stat Cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 animate-fade-in-up">
            {[
              { icon: "⚡", title: "Super Cepat", desc: "Hasil dalam hitungan menit", bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.2)" },
              { icon: "🎯", title: "Akurat", desc: "Dipindai paragraf per paragraf", bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.2)" },
              { icon: "💰", title: "Mulai Rp 3.000", desc: "Harga transparan tanpa langganan", bg: "rgba(6,214,160,0.12)", border: "rgba(6,214,160,0.2)" },
            ].map((s) => (
              <div key={s.title} className="stat-card hover:bg-surface-2 transition-colors">
                <div className="stat-icon" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                  {s.icon}
                </div>
                <div>
                  <p className="stat-value text-base">{s.title}</p>
                  <p className="stat-label">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Main Grid ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
            {/* ── Left Area (2 cols) ── */}
            <div className="lg:col-span-2 space-y-5">
              
              {/* STEP 1: UPLOAD */}
              <div className="card">
                <div className="card-header pb-4 border-b border-white/5">
                  <span className="card-title text-primary-light flex items-center gap-2">
                    <span className="w-5 h-5 rounded bg-primary/20 flex items-center justify-center text-[10px] text-white">1</span>
                    Upload Dokumen
                  </span>
                  {file && (
                    <button onClick={handleReset} className="text-xs font-semibold text-danger/80 hover:text-danger flex items-center gap-1.5 transition-colors">
                      <IconX className="w-3.5 h-3.5" /> Ganti File
                    </button>
                  )}
                </div>
                <div className="card-body">
                  <input
                    id="file-upload"
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={(e) => {
                      handleInputChange(e);
                      e.target.value = ''; // allow uploading same file again
                    }}
                    className="sr-only"
                  />

                  {!file ? (
                    <label
                      htmlFor="file-upload"
                      className={`block upload-zone p-10 sm:p-14 text-center cursor-pointer ${isDragOver ? "drag-over" : ""}`}
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                    >
                      <div className="flex flex-col items-center pointer-events-none">
                        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5 float">
                          <IconUpload className="w-7 h-7 text-primary-light" />
                        </div>
                        <p className="text-base font-semibold text-white/80 mb-1.5">
                          {isDragOver ? "Lepaskan file di sini untuk upload" : "Klik untuk memilih file atau drag kemari"}
                        </p>
                        <p className="text-xs text-white/30">Mendukung format PDF, DOCX, TXT. Maksimal 50 MB.</p>
                      </div>
                    </label>
                  ) : (
                    <div className="animate-scale-in">
                      {/* File Info */}
                      <div className="flex items-center gap-4 p-4 rounded-xl bg-surface-2 border border-white/[0.04]">
                        <div className="w-11 h-11 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center flex-shrink-0">
                          <span className="text-lg">
                            {getFileExtension(file.name) === ".pdf" ? "📕" : getFileExtension(file.name) === ".docx" ? "📘" : "📝"}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{file.name}</p>
                          <p className="text-[11px] text-white/30 mt-0.5">{formatFileSize(file.size)} • {getFileExtension(file.name).toUpperCase().slice(1)}</p>
                        </div>
                        {isDetecting ? (
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 spinner" />
                            <span className="text-[11px] text-primary-light animate-pulse">Mendeteksi halaman...</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 rounded-full border border-accent/20">
                            <IconCheck className="w-3.5 h-3.5 text-accent" />
                            <span className="text-[11px] font-semibold text-accent">{pageCount} hal terdeteksi</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {fileError && (
                    <div className="mt-4 flex items-center gap-2 text-xs text-danger bg-danger/10 p-3 rounded-lg border border-danger/20">
                      <IconInfo className="w-4 h-4 flex-shrink-0" />
                      <span>{fileError}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* STEP 2: PAYMENT (Only show if detection is complete) */}
              {showResults && selectedPlan && !fileError && (
                <div className="card animate-fade-in-up">
                  <div className="card-header pb-4 border-b border-white/5">
                    <span className="card-title text-accent flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-accent/20 flex items-center justify-center text-[10px] text-white">2</span>
                      Pembayaran & Proses
                    </span>
                  </div>
                  
                  <div className="card-body">
                    <div className="flex flex-col sm:flex-row gap-5">
                      {/* Left side: selected plan info */}
                      <div className="sm:w-1/3 space-y-3">
                        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">Paket Terpilih</p>
                        <div className="flex flex-col gap-2 p-3.5 rounded-lg bg-surface-2 border border-white/5">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{selectedPlan.icon}</span>
                            <span className="text-sm font-semibold text-white">{selectedPlan.name}</span>
                          </div>
                          <span className="text-lg font-bold gradient-text">{formatCurrency(selectedPlan.price)}</span>
                        </div>
                      </div>

                      {/* Right side: Payment method */}
                      <div className="sm:w-2/3">
                        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-3">Metode Pembayaran</p>
                        <div className="grid grid-cols-2 gap-2 mb-5">
                          {PAYMENT_METHODS.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => setSelectedPayment(m.id)}
                              className={`payment-option p-3 text-left relative ${selectedPayment === m.id ? "selected" : ""}`}
                              id={`payment-${m.id}`}
                            >
                              {selectedPayment === m.id && (
                                <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                                  <svg viewBox="0 0 24 24" fill="none" className="w-2.5 h-2.5 text-white" stroke="currentColor" strokeWidth={3}><polyline points="20 6 9 17 4 12" /></svg>
                                </div>
                              )}
                              <p className="text-xs font-semibold text-white mb-0.5">{m.name}</p>
                              <p className="text-[10px] text-white/25 leading-snug">{m.desc}</p>
                            </button>
                          ))}
                        </div>

                        <button
                          onClick={handlePay}
                          disabled={!canPay}
                          className={`btn-gradient w-full py-3.5 text-sm font-bold flex items-center justify-center gap-2 ${canPay ? "pulse-glow" : ""}`}
                          id="pay-button"
                        >
                          <span className="relative z-10 flex items-center gap-2">
                            <IconShield className="w-4 h-4" />
                            {!selectedPayment ? "Pilih metode pembayaran" : isPaying ? "Membuat transaksi..." : "Bayar & Analisis Sekarang"}
                          </span>
                        </button>

                        <p className="text-[10px] text-white/15 text-center mt-3 flex items-center justify-center gap-1.5">
                          <IconShield className="w-3 h-3" /> Transaksi Midtrans aman. Dokumen dihapus dalam 24 jam.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Pricing Sidebar (1 col) ── */}
            <div className="card">
              <div className="card-header pb-4 border-b border-white/5">
                <span className="card-title">Daftar Paket Harga</span>
              </div>
              <div className="card-body space-y-3">
                {PLANS.map((plan, i) => (
                  <div key={plan.name} className={`pricing-card ${i === 1 ? "popular" : ""} ${selectedPlan?.name === plan.name ? "!border-primary/40 bg-primary/[0.03]" : ""}`}>
                    <p className="text-xl mb-1.5">{plan.icon}</p>
                    <p className="text-sm font-bold text-white">{plan.name}</p>
                    <p className="text-[10px] text-white/30 mt-0.5">
                      {plan.maxPages ? `${plan.minPages}–${plan.maxPages} halaman` : `${plan.minPages}+ halaman`}
                    </p>
                    <p className="text-base font-bold gradient-text mt-2">{formatCurrency(plan.price)}</p>
                  </div>
                ))}
                
                <div className="mt-4 p-3 rounded-xl bg-surface-2 border border-white/[0.04]">
                  <p className="text-[10px] text-white/30 leading-relaxed">
                    💡 Sistem otomatis menghitung jumlah halaman dan mencocokannya dengan batas atas paket.
                  </p>
                </div>
              </div>
            </div>
          </div>


          {/* ── Footer ── */}
          <div className="mt-6 py-4">
            <div className="section-divider mb-4" />
            <p className="text-[10px] text-white/12 text-center">© 2024 Plagiarisme Checker by Ikariz id — Powered by AI</p>
          </div>
        </div>
      </main>
    </div>
  );
}
