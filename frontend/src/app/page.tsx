"use client";

import { useState, useEffect, useCallback } from "react";
import { RISK_COLORS, RISK_LEVEL_LABELS } from "@/types";
import type { RiskLevel, DiseaseType } from "@/types";
import ShapWaterfallChart from "@/components/ShapWaterfallChart";

const API = "http://127.0.0.1:8000";

// ----- Tip Tanımları -----
interface PatientListItem {
  hasta_id: string;
  tani_yasi: number | null;
  cinsiyet_num: number | null;
  boy: number | null;
  kilo: number | null;
}

interface PredictionItem {
  disease: DiseaseType;
  disease_name: string;
  risk_score: number;
  risk_level: RiskLevel;
  confidence: number;
  recommendation: string;
}

interface ExplanationItem {
  disease: DiseaseType;
  base_value: number;
  shap_values: { feature: string; feature_value: string | number; contribution: number }[];
  output_value: number;
}

interface PatientSummary {
  hasta_id: string;
  tani_yasi: number | null;
  cinsiyet: string;
  boy: number | null;
  kilo: number | null;
  bmi: number | null;
  nabiz: number | null;
  kb_s: number | null;
  kb_d: number | null;
  sigara: string;
  alkol: string;
  glukoz_aclik: number | null;
  hemoglobin: number | null;
  kreatinin: number | null;
  tsh: number | null;
  hipertansiyon_ailede: boolean;
  diyabet_ailede: boolean;
  kalp_damar_ailede: boolean;
  tum_tanilar: string | null;
  yakinma: string | null;
  muayene_notu: string | null;
  tedavi_notu: string | null;
  medications?: string[];
  target_hipertansiyon: number | null;
}

interface PredictResult {
  predictions: PredictionItem[];
  explanations: ExplanationItem[];
  patient_summary: PatientSummary;
  timestamp: string;
}

// ----- Yardımcı -----
function val(v: number | null | undefined, unit = "") {
  if (v === null || v === undefined) return "-";
  return `${v}${unit ? " " + unit : ""}`;
}

export default function HomePage() {
  // State
  const [patients, setPatients] = useState<PatientListItem[]>([]);
  const [totalPatients, setTotalPatients] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<PredictResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [showRiskModal, setShowRiskModal] = useState(false);
  const [showXaiModal, setShowXaiModal] = useState(false);

  // NLP Input
  const [complaintInput, setComplaintInput] = useState("");
  const [isUpdatingComplaint, setIsUpdatingComplaint] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  const PAGE_SIZE = 30;

  // Hasta listesi yükle
  const fetchPatients = useCallback(async (s: string, p: number) => {
    setListLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(p * PAGE_SIZE) });
      if (s) params.set("search", s);
      const res = await fetch(`${API}/api/patients?${params}`);
      const data = await res.json();
      setPatients(data.patients || []);
      setTotalPatients(data.total || 0);
    } catch (e) {
      console.error("Hasta listesi yüklenemedi:", e);
    } finally {
      setListLoading(false);
    }
  }, []);

  // İlk yükleme
  useEffect(() => {
    fetchPatients("", 0);
  }, [fetchPatients]);

  // Arama debounce
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0);
      fetchPatients(search, 0);
    }, 300);
    return () => clearTimeout(t);
  }, [search, fetchPatients]);

  // Sayfa değişimi
  useEffect(() => {
    fetchPatients(search, page);
  }, [page, search, fetchPatients]);

  // Hasta seç ve tahmin yap
  const selectPatient = async (hastaId: string) => {
    setSelectedId(hastaId);
    setLoading(true);
    setResult(null);
    setComplaintInput("");
    try {
      const res = await fetch(`${API}/api/predict/from-db/${hastaId}`, { method: "POST" });
      const data: PredictResult = await res.json();
      setResult(data);
      if (data.patient_summary?.yakinma) {
        setComplaintInput(data.patient_summary.yakinma);
      }
      setUpdateSuccess(false); // Reset success state when switching patients
    } catch (e) {
      console.error("Tahmin hatası:", e);
    } finally {
      setLoading(false);
    }
  };

  // Yeni şikayet ile model tahminini güncelleme
  const updateComplaint = async () => {
    if (!selectedId) return;
    setIsUpdatingComplaint(true);
    try {
      const res = await fetch(`${API}/api/predict/update-complaint/${selectedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yakinma: complaintInput }),
      });
      const data: PredictResult = await res.json();
      setResult(data);
      if (data.patient_summary?.yakinma) {
        setComplaintInput(data.patient_summary.yakinma);
      }
      setUpdateSuccess(true);
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (e) {
      console.error("Şikayet güncellenirken hata oluştu:", e);
    } finally {
      setIsUpdatingComplaint(false);
    }
  };

  const totalPages = Math.ceil(totalPatients / PAGE_SIZE);
  const summary = result?.patient_summary;

  return (
    <div className="space-y-4">
      {/* Üst Bilgi Bandı */}
      <div className="rounded-xl bg-gradient-to-r from-blue-50 to-white border border-blue-100 px-6 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-blue-900">TriMind Klinik Karar Destek Paneli</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Veritabanından hasta seçin — 3 model ile risk analizi yapılır.
              {totalPatients > 0 && (
                <span className="ml-2 text-blue-600 font-medium">{totalPatients.toLocaleString()} hasta kayıtlı</span>
              )}
            </p>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-sm text-blue-600 font-medium">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              3 model hesaplanıyor...
            </div>
          )}
        </div>
      </div>

      {/* 3 Kolonlu Layout */}
      <div className="flex flex-row gap-4 h-[calc(100vh-170px)]">

        {/* ========== SOL: HASTA LİSTESİ ========== */}
        <div className="w-[22%] flex flex-col">
          <div className="card flex-1 flex flex-col overflow-hidden">
            <h3 className="section-title flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              </span>
              Hasta Seçimi
            </h3>

            {/* Arama */}
            <div className="relative mb-3">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              <input
                type="text"
                placeholder="Hasta ID ara..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field w-full pl-9 text-sm"
              />
            </div>

            {/* Liste */}
            <div className="flex-1 overflow-y-auto space-y-1">
              {listLoading ? (
                <div className="flex items-center justify-center h-20 text-sm text-slate-400">
                  <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin mr-2" />
                  Yükleniyor...
                </div>
              ) : patients.length === 0 ? (
                <div className="text-center text-sm text-slate-400 py-8">Hasta bulunamadı</div>
              ) : (
                patients.map((p) => (
                  <button
                    key={p.hasta_id}
                    onClick={() => selectPatient(p.hasta_id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-all text-xs ${selectedId === p.hasta_id
                      ? "bg-blue-100 border border-blue-300 shadow-sm"
                      : "hover:bg-slate-50 border border-transparent"
                      }`}
                  >
                    <div className="font-semibold text-slate-800 truncate">{p.hasta_id}</div>
                    <div className="flex gap-3 mt-0.5 text-slate-500">
                      <span>{p.tani_yasi ? `${Math.round(p.tani_yasi)} yaş` : "-"}</span>
                      <span>{p.cinsiyet_num === 1 ? "E" : p.cinsiyet_num === 0 ? "K" : "-"}</span>
                      {p.boy && p.kilo && (
                        <span>{p.boy}cm / {p.kilo}kg</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Sayfalama */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Geri
                </button>
                <span className="text-xs text-slate-500">{page + 1} / {totalPages}</span>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  İleri
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ========== ORTA: HASTA ÖZETİ ========== */}
        <div className="w-[43%] flex flex-col gap-4">
          {/* Hasta Özet */}
          <div className="card flex-1 overflow-y-auto">
            <h3 className="section-title flex items-center gap-2 mb-4">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
              </span>
              Hasta Özeti
            </h3>

            {!summary ? (
              <div className="flex items-center justify-center h-40 text-sm text-slate-400">
                Sol panelden bir hasta seçin
              </div>
            ) : (
              <div className="space-y-5">
                {/* Demografik */}
                <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                  <h4 className="text-sm font-bold text-slate-800 mb-3 border-b border-slate-200 pb-2">
                    Demografik Bilgiler — {summary.hasta_id}
                  </h4>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500">Yaş / Cinsiyet</span>
                      <span className="text-sm font-semibold text-slate-800">
                        {val(summary.tani_yasi)} / {summary.cinsiyet}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500">Boy / Kilo</span>
                      <span className="text-sm font-semibold text-slate-800">
                        {val(summary.boy, "cm")} / {val(summary.kilo, "kg")}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500">BMI</span>
                      <span className="text-sm font-semibold text-blue-600">{val(summary.bmi)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500">Nabız</span>
                      <span className="text-sm font-semibold text-slate-800">{val(summary.nabiz, "bpm")}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500">Kan Basıncı</span>
                      <span className="text-sm font-semibold text-slate-800">
                        {summary.kb_s && summary.kb_d ? `${summary.kb_s}/${summary.kb_d} mmHg` : "-"}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500">Sigara / Alkol</span>
                      <span className="text-sm font-semibold text-slate-800">
                        {summary.sigara} / {summary.alkol}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Lab Sonuçları */}
                <div className="bg-blue-50/30 rounded-xl p-4 border border-blue-100/50">
                  <h4 className="text-sm font-bold text-slate-800 mb-3 border-b border-blue-100/50 pb-2">Laboratuvar Bulguları</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-4">
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500">Açlık Glukozu</span>
                      <span className="text-sm font-semibold text-slate-800">{val(summary.glukoz_aclik, "mg/dL")}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500">Hemoglobin</span>
                      <span className="text-sm font-semibold text-slate-800">{val(summary.hemoglobin, "g/dL")}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500">Kreatinin</span>
                      <span className="text-sm font-semibold text-slate-800">{val(summary.kreatinin, "mg/dL")}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-slate-500">TSH</span>
                      <span className="text-sm font-semibold text-slate-800">{val(summary.tsh, "mIU/L")}</span>
                    </div>
                  </div>
                </div>

                {/* Aile Öyküsü */}
                <div className="bg-purple-50/30 rounded-xl p-4 border border-purple-100/50">
                  <h4 className="text-sm font-bold text-slate-800 mb-2">Aile Öyküsü</h4>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${summary.hipertansiyon_ailede ? "bg-red-500" : "bg-slate-300"}`} />
                      <span className={`text-xs ${summary.hipertansiyon_ailede ? "text-slate-700 font-medium" : "text-slate-400"}`}>Hipertansiyon</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${summary.diyabet_ailede ? "bg-red-500" : "bg-slate-300"}`} />
                      <span className={`text-xs ${summary.diyabet_ailede ? "text-slate-700 font-medium" : "text-slate-400"}`}>Diyabet</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${summary.kalp_damar_ailede ? "bg-red-500" : "bg-slate-300"}`} />
                      <span className={`text-xs ${summary.kalp_damar_ailede ? "text-slate-700 font-medium" : "text-slate-400"}`}>Kalp Damar</span>
                    </div>
                  </div>
                </div>

                {/* Tanılar */}
                {summary.tum_tanilar && (
                  <div className="bg-rose-50/30 rounded-xl p-4 border border-rose-100/50">
                    <h4 className="text-sm font-bold text-slate-800 mb-2">Geçmiş Tanılar (ICD-10)</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {summary.tum_tanilar.split(",").filter(c => c.trim()).slice(0, 20).map((code, i) => (
                        <span key={i} className="inline-flex items-center px-2 py-1 rounded-md bg-rose-100/50 text-rose-700 text-xs font-medium">
                          {code.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Kullandığı İlaçlar */}
                {summary.medications && summary.medications.length > 0 && (
                  <div className="bg-indigo-50/30 rounded-xl p-4 border border-indigo-100/50">
                    <h4 className="text-sm font-bold text-slate-800 mb-2">Geçmiş İlaçlar (NLP)</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {summary.medications.map((drug, i) => (
                        <span key={i} className="inline-flex items-center px-2 py-1 rounded-md bg-indigo-100/50 text-indigo-700 text-xs font-medium">
                          {drug}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Gerçek Tanı (Ground Truth) */}
                {summary.target_hipertansiyon !== null && summary.target_hipertansiyon !== undefined && (
                  <div className={`rounded-xl p-3 border ${summary.target_hipertansiyon === 1 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                    <span className="text-xs font-bold">
                      Gerçek Tanı (Ground Truth): {summary.target_hipertansiyon === 1 ? "Hipertansiyon VAR" : "Hipertansiyon YOK"}
                    </span>
                  </div>
                )}

                {/* Hasta Şikayeti / Yakınma NLP Girdisi */}
                <div className="bg-amber-50/50 rounded-xl p-4 border border-amber-100">
                  <h4 className="text-sm font-bold text-slate-800 mb-3 border-b border-amber-200 pb-2 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                    Hasta Şikayeti / Yakınma (NLP)
                  </h4>
                  <div className="flex flex-col gap-3">
                    <textarea
                      value={complaintInput}
                      onChange={(e) => setComplaintInput(e.target.value)}
                      placeholder="Hastanın şikayetini buraya girin (ör: şiddetli baş ağrısı, ensede uyuşma, vb.). NLP modeli bunu anlamlandırıp risk skorlarını güncelleyecektir."
                      className="w-full min-h-[80px] text-sm p-3 rounded-lg border border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all resize-y"
                    />
                    <div className="flex items-center justify-end gap-3">
                      {updateSuccess && (
                        <span className="text-sm font-semibold text-emerald-600 animate-pulse">
                          ✓ Analiz başarıyla güncellendi!
                        </span>
                      )}
                      <button
                        onClick={updateComplaint}
                        disabled={isUpdatingComplaint || !complaintInput.trim()}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300 text-white text-sm font-semibold rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                      >
                        {isUpdatingComplaint ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                            Güncelleniyor...
                          </>
                        ) : (
                          "Analizi Güncelle"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ========== SAĞ: RİSK SKORLARI ========== */}
        <div className="w-[35%] flex flex-col gap-4">
          {/* Risk Skorları */}
          <div className="card flex-1 overflow-y-auto">
            <h3 className="section-title flex items-center gap-2 mb-4">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold">!</span>
              Risk Skorlama — 3 Model
            </h3>

            {!result ? (
              <div className="flex items-center justify-center h-40 text-sm text-slate-400">
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    Modeller çalışıyor...
                  </div>
                ) : (
                  "Hasta seçilmedi"
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {[...result.predictions]
                  .sort((a, b) => b.risk_score - a.risk_score)
                  .map((pred, idx) => {
                    const color = RISK_COLORS[pred.risk_level as RiskLevel] || "#94a3b8";
                    const label = RISK_LEVEL_LABELS[pred.risk_level as RiskLevel] || pred.risk_level;
                    const isTop = idx === 0;

                    return (
                      <button
                        key={pred.disease}
                        onClick={() => setShowRiskModal(true)}
                        className={`w-full text-left rounded-xl border-2 transition-all hover:shadow-lg cursor-pointer group ${isTop ? "p-5" : "p-3"}`}
                        style={{ borderColor: isTop ? color : `${color}40`, backgroundColor: `${color}08` }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <h4 className={`font-semibold text-slate-800 ${isTop ? "text-sm" : "text-xs"}`}>{pred.disease_name}</h4>
                          <span
                            className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                            style={{ color, backgroundColor: `${color}18` }}
                          >
                            {label}
                          </span>
                        </div>
                        <div className="flex items-end gap-2 mb-2">
                          <span className={`font-bold leading-none ${isTop ? "text-4xl" : "text-2xl"}`} style={{ color }}>
                            %{pred.risk_score}
                          </span>
                        </div>
                        <div className={`w-full bg-slate-200 rounded-full overflow-hidden ${isTop ? "h-3.5" : "h-2"}`}>
                          <div
                            className="h-full rounded-full transition-all duration-700 ease-out"
                            style={{ width: `${pred.risk_score}%`, backgroundColor: color }}
                          />
                        </div>
                        {isTop && (
                          <p className="text-xs text-slate-400 mt-3 group-hover:text-blue-500 transition-colors text-center">
                            Detaylar icin tiklayın
                          </p>
                        )}
                      </button>
                    );
                  })}

                {/* XAI Butonu */}
                {result.explanations.some(e => e.shap_values.length > 0) && (
                  <button
                    onClick={() => setShowXaiModal(true)}
                    className="w-full mt-2 text-center py-3 rounded-xl border border-purple-200 bg-purple-50/30 hover:bg-purple-50 transition-all text-sm text-purple-700 font-medium"
                  >
                    SHAP Analizi Goruntule
                  </button>
                )}
              </div>
            )}
          </div>

          {/* AI İçgörüsü */}
          <div className="card flex-shrink-0">
            <h3 className="section-title flex items-center gap-2 mb-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
              </span>
              Yapay Zeka Icgorusu
            </h3>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
              {result ? (
                <p className="text-sm text-slate-700 leading-relaxed">
                  {(() => {
                    const sorted = [...result.predictions].sort((a, b) => b.risk_score - a.risk_score);
                    const top = sorted[0];
                    const levelText = RISK_LEVEL_LABELS[top.risk_level as RiskLevel]?.toLowerCase() || top.risk_level;
                    return `${top.disease_name} riski %${top.risk_score} (${levelText}) olarak hesaplandı. ${top.recommendation}`;
                  })()}
                </p>
              ) : (
                <p className="text-sm text-slate-400 italic">
                  Hasta secildikten sonra AI analizi burada gorunecek.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========== RİSK DETAY MODAL ========== */}
      {showRiskModal && result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-4xl max-h-[90vh] overflow-y-auto p-8 relative">
            <button
              onClick={() => setShowRiskModal(false)}
              className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors text-lg font-bold"
            >
              x
            </button>

            <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500 text-white text-sm font-bold">!</span>
              Risk Skorlama — Detaylı Gorunum ({summary?.hasta_id})
            </h2>

            <div className="flex flex-col gap-5">
              {[...result.predictions]
                .sort((a, b) => b.risk_score - a.risk_score)
                .map((pred) => {
                  const color = RISK_COLORS[pred.risk_level as RiskLevel] || "#94a3b8";
                  const levelLabel = RISK_LEVEL_LABELS[pred.risk_level as RiskLevel] || pred.risk_level;
                  return (
                    <div
                      key={pred.disease}
                      className="rounded-xl border-2 p-6 transition-all"
                      style={{ borderColor: `${color}40`, backgroundColor: `${color}05` }}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-bold text-slate-800">{pred.disease_name}</h3>
                        <span
                          className="text-sm font-bold uppercase tracking-wider px-3 py-1 rounded-full"
                          style={{ color, backgroundColor: `${color}18` }}
                        >
                          {levelLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-6 mb-4">
                        <span className="text-5xl font-bold" style={{ color }}>
                          %{pred.risk_score}
                        </span>
                        <div className="flex-1">
                          <div className="w-full h-4 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700 ease-out"
                              style={{ width: `${pred.risk_score}%`, backgroundColor: color }}
                            />
                          </div>
                          <div className="flex items-center gap-2 mt-2 text-sm text-slate-500">
                            <span>Model Guveni:</span>
                            <span className="font-semibold text-slate-700">%{(pred.confidence * 100).toFixed(0)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg bg-white border border-slate-200 p-4">
                        <p className="text-sm font-semibold text-slate-700 mb-1">Klinik Oneri</p>
                        <p className="text-sm text-slate-600 leading-relaxed">{pred.recommendation}</p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ========== XAI MODAL ========== */}
      {showXaiModal && result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-5xl max-h-[90vh] overflow-y-auto p-8 relative">
            <button
              onClick={() => setShowXaiModal(false)}
              className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors text-lg font-bold"
            >
              x
            </button>
            <h2 className="text-xl font-bold text-slate-900 mb-4">SHAP Analizi — {summary?.hasta_id}</h2>
            <ShapWaterfallChart
              explanations={result.explanations.map(e => ({
                disease: e.disease as DiseaseType,
                baseValue: e.base_value,
                outputValue: e.output_value,
                shapValues: e.shap_values.map(sv => ({
                  feature: sv.feature,
                  featureValue: sv.feature_value,
                  contribution: sv.contribution,
                })),
              }))}
            />
          </div>
        </div>
      )}
    </div>
  );
}
