// ===== Hasta Girdi Verileri =====

export interface PatientInput {
  // Demografik
  age: number;
  gender: "male" | "female";
  height: number; // cm
  weight: number; // kg
  bmi: number; // otomatik hesaplanir

  // Laboratuvar Sonuclari (hepsi opsiyonel - doktor giremeyebilir)
  labResults: LabResults;

  // Gecmis Tanilar
  icd10Codes: string[];

  // Reçeteli Ilaclar
  medications: string[];

  // Yasam Tarzi
  smokingStatus: "never" | "former" | "current";
  familyHistory: FamilyHistory;

  // NLP İle Dinamik Eklenen Alanlar
  symptoms?: string[];
  muayene_notu?: string;
  sikayet?: string;
  tedavi_notu?: string;
}

export interface LabResults {
  fastingGlucose?: number; // mg/dL - Aclik kan sekeri
  hba1c?: number; // % - Glikozile hemoglobin
  tsh?: number; // mIU/L - Tiroid stimulan hormon
  totalCholesterol?: number; // mg/dL
  ldl?: number; // mg/dL
  hdl?: number; // mg/dL
  triglycerides?: number; // mg/dL
  creatinine?: number; // mg/dL
  alt?: number; // U/L - Karaciger
  ast?: number; // U/L - Karaciger
}

export interface FamilyHistory {
  hypertension: boolean;
  diabetes: boolean;
  thyroid: boolean;
}

// ===== Tahmin Sonuclari =====

export type DiseaseType = "hypertension" | "type2_diabetes" | "hypothyroidism";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface PredictionResult {
  disease: DiseaseType;
  diseaseName: string; // Goruntuleme icin Turkce isim
  riskScore: number; // 0-100
  riskLevel: RiskLevel;
  confidence: number; // 0-1
  recommendation: string;
}

// ===== SHAP Aciklanabilirlik =====

export interface ShapValue {
  feature: string; // Faktor adi (orn: "BMI", "HbA1c")
  featureValue: string | number; // Gercek deger
  contribution: number; // SHAP katkisi (pozitif = risk artirir, negatif = azaltir)
}

export interface ShapExplanation {
  disease: DiseaseType;
  baseValue: number; // Populasyon ortalama riski
  shapValues: ShapValue[];
  outputValue: number; // Final tahmin skoru
}

// ===== API Response =====

export interface PredictionResponse {
  predictions: PredictionResult[];
  explanations: ShapExplanation[];
  timestamp: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patient_state?: any; // Backend'in döndüğü güncel zenginleştirilmiş hasta verisi
}

// ===== Hasta Gecmisi =====

export interface PatientHistoryEntry {
  id: string;
  date: string;
  patientSummary: string;
  predictions: PredictionResult[];
}

// ===== Yardimci Sabitler =====

export const DISEASE_LABELS: Record<DiseaseType, string> = {
  hypertension: "Hipertansiyon",
  type2_diabetes: "Tip 2 Diyabet",
  hypothyroidism: "Hipotiroidi",
};

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
  critical: "Kritik",
};

export const RISK_COLORS: Record<RiskLevel, string> = {
  low: "#22c55e",
  medium: "#eab308",
  high: "#f97316",
  critical: "#ef4444",
};

export const COMMON_ICD10_CODES: { code: string; description: string }[] = [
  { code: "E11", description: "Tip 2 Diabetes Mellitus" },
  { code: "E03", description: "Hipotiroidi (Diğer)" },
  { code: "E66", description: "Obezite" },
  { code: "E78", description: "Lipoprotein Metabolizma Bozuklukları" },
  { code: "I10", description: "Esansiyel (Primer) Hipertansiyon" },
  { code: "I25", description: "Kronik İskemik Kalp Hastalığı" },
  { code: "J45", description: "Astim" },
  { code: "K21", description: "Gastroözofageal Reflü" },
  { code: "M54", description: "Sırt Ağrısı" },
  { code: "N18", description: "Kronik Böbrek Hastalığı" },
  { code: "E04", description: "Toksik Olmayan Guatr" },
  { code: "E05", description: "Hipertiroidi" },
  { code: "I11", description: "Hipertansif Kalp Hastalığı" },
  { code: "I48", description: "Atriyal Fibrilasyon ve Flutter" },
  { code: "E14", description: "Tanımlanmamış Diabetes Mellitus" },
];

export const COMMON_MEDICATIONS: string[] = [
  "Metformin",
  "Levotiroksin",
  "Amlodipin",
  "Lisinopril",
  "Atorvastatin",
  "Metoprolol",
  "Losartan",
  "Omeprazol",
  "Aspirin",
  "Gliklazid",
  "Insülin Glargin",
  "Ramipril",
  "Simvastatin",
  "Hidroklorotiyazid",
  "Propiltiyourasil",
];
