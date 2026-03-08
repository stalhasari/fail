import {
  PatientInput,
  PredictionResult,
  ShapExplanation,
  ShapValue,
  PredictionResponse,
  PatientHistoryEntry,
  DiseaseType,
  RiskLevel,
} from "@/types";

// ===== Risk Seviyesi Hesaplama =====

function getRiskLevel(score: number): RiskLevel {
  if (score <= 25) return "low";
  if (score <= 50) return "medium";
  if (score <= 75) return "high";
  return "critical";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ===== Dinamik Mock Tahmin Motoru =====

interface RiskFactors {
  score: number;
  shapValues: ShapValue[];
}

function calculateHypertensionRisk(patient: PatientInput): RiskFactors {
  let score = 15; // base risk
  const shapValues: ShapValue[] = [];

  // Yas etkisi
  if (patient.age > 60) {
    score += 15;
    shapValues.push({ feature: "Yaş", featureValue: patient.age, contribution: 15 });
  } else if (patient.age > 45) {
    score += 8;
    shapValues.push({ feature: "Yaş", featureValue: patient.age, contribution: 8 });
  } else {
    shapValues.push({ feature: "Yaş", featureValue: patient.age, contribution: -5 });
    score -= 5;
  }

  // BMI etkisi
  if (patient.bmi > 35) {
    score += 20;
    shapValues.push({ feature: "BMI", featureValue: patient.bmi.toFixed(1), contribution: 20 });
  } else if (patient.bmi > 30) {
    score += 15;
    shapValues.push({ feature: "BMI", featureValue: patient.bmi.toFixed(1), contribution: 15 });
  } else if (patient.bmi > 25) {
    score += 5;
    shapValues.push({ feature: "BMI", featureValue: patient.bmi.toFixed(1), contribution: 5 });
  } else {
    shapValues.push({ feature: "BMI", featureValue: patient.bmi.toFixed(1), contribution: -3 });
    score -= 3;
  }

  // Lab: Kolesterol
  const { labResults } = patient;
  if (labResults.totalCholesterol != null) {
    if (labResults.totalCholesterol > 240) {
      score += 12;
      shapValues.push({ feature: "Total Kolesterol", featureValue: labResults.totalCholesterol, contribution: 12 });
    } else if (labResults.totalCholesterol > 200) {
      score += 5;
      shapValues.push({ feature: "Total Kolesterol", featureValue: labResults.totalCholesterol, contribution: 5 });
    } else {
      shapValues.push({ feature: "Total Kolesterol", featureValue: labResults.totalCholesterol, contribution: -4 });
      score -= 4;
    }
  }

  if (labResults.ldl != null) {
    if (labResults.ldl > 160) {
      score += 8;
      shapValues.push({ feature: "LDL", featureValue: labResults.ldl, contribution: 8 });
    } else if (labResults.ldl < 100) {
      score -= 3;
      shapValues.push({ feature: "LDL", featureValue: labResults.ldl, contribution: -3 });
    }
  }

  if (labResults.creatinine != null) {
    if (labResults.creatinine > 1.3) {
      score += 10;
      shapValues.push({ feature: "Kreatinin", featureValue: labResults.creatinine, contribution: 10 });
    }
  }

  // Sigara
  if (patient.smokingStatus === "current") {
    score += 12;
    shapValues.push({ feature: "Sigara (Aktif)", featureValue: "Evet", contribution: 12 });
  } else if (patient.smokingStatus === "former") {
    score += 4;
    shapValues.push({ feature: "Sigara (Geçmiş)", featureValue: "Eski", contribution: 4 });
  }

  // Aile oykusu
  if (patient.familyHistory.hypertension) {
    score += 10;
    shapValues.push({ feature: "Aile Öyküsü (HT)", featureValue: "Var", contribution: 10 });
  }

  // ICD-10 kodlari
  const htRelatedCodes = ["I10", "I11", "I25", "I48", "E66", "N18"];
  const matchedCodes = patient.icd10Codes.filter((c) => htRelatedCodes.some((r) => c.startsWith(r)));
  if (matchedCodes.length > 0) {
    const contrib = matchedCodes.length * 8;
    score += contrib;
    shapValues.push({ feature: "ICD-10 Tanı Kodları", featureValue: matchedCodes.join(", "), contribution: contrib });
  }

  // Ilaclar
  const htMeds = ["Amlodipin", "Lisinopril", "Losartan", "Metoprolol", "Ramipril", "Hidroklorotiyazid"];
  const matchedMeds = patient.medications.filter((m) => htMeds.some((h) => m.toLowerCase().includes(h.toLowerCase())));
  if (matchedMeds.length > 0) {
    score += 10;
    shapValues.push({ feature: "HT İlaç Kullanımı", featureValue: matchedMeds.join(", "), contribution: 10 });
  }

  // Cinsiyet
  if (patient.gender === "male") {
    score += 3;
    shapValues.push({ feature: "Cinsiyet", featureValue: "Erkek", contribution: 3 });
  } else {
    shapValues.push({ feature: "Cinsiyet", featureValue: "Kadın", contribution: -2 });
    score -= 2;
  }

  return { score: clamp(score, 0, 100), shapValues };
}

function calculateDiabetesRisk(patient: PatientInput): RiskFactors {
  let score = 12;
  const shapValues: ShapValue[] = [];

  // BMI
  if (patient.bmi > 35) {
    score += 22;
    shapValues.push({ feature: "BMI", featureValue: patient.bmi.toFixed(1), contribution: 22 });
  } else if (patient.bmi > 30) {
    score += 18;
    shapValues.push({ feature: "BMI", featureValue: patient.bmi.toFixed(1), contribution: 18 });
  } else if (patient.bmi > 25) {
    score += 8;
    shapValues.push({ feature: "BMI", featureValue: patient.bmi.toFixed(1), contribution: 8 });
  } else {
    shapValues.push({ feature: "BMI", featureValue: patient.bmi.toFixed(1), contribution: -5 });
    score -= 5;
  }

  // Lab: Aclik kan sekeri
  const { labResults } = patient;
  if (labResults.fastingGlucose != null) {
    if (labResults.fastingGlucose > 126) {
      score += 30;
      shapValues.push({ feature: "Açlık Kan Şekeri", featureValue: labResults.fastingGlucose, contribution: 30 });
    } else if (labResults.fastingGlucose > 100) {
      score += 15;
      shapValues.push({ feature: "Açlık Kan Şekeri", featureValue: labResults.fastingGlucose, contribution: 15 });
    } else {
      shapValues.push({ feature: "Açlık Kan Şekeri", featureValue: labResults.fastingGlucose, contribution: -5 });
      score -= 5;
    }
  }

  // Lab: HbA1c
  if (labResults.hba1c != null) {
    if (labResults.hba1c > 6.5) {
      score += 28;
      shapValues.push({ feature: "HbA1c", featureValue: `${labResults.hba1c}%`, contribution: 28 });
    } else if (labResults.hba1c > 5.7) {
      score += 12;
      shapValues.push({ feature: "HbA1c", featureValue: `${labResults.hba1c}%`, contribution: 12 });
    } else {
      shapValues.push({ feature: "HbA1c", featureValue: `${labResults.hba1c}%`, contribution: -6 });
      score -= 6;
    }
  }

  // Lab: Trigliserit
  if (labResults.triglycerides != null) {
    if (labResults.triglycerides > 200) {
      score += 8;
      shapValues.push({ feature: "Trigliserit", featureValue: labResults.triglycerides, contribution: 8 });
    }
  }

  // Lab: HDL
  if (labResults.hdl != null) {
    if (labResults.hdl < 40) {
      score += 6;
      shapValues.push({ feature: "HDL (Düşük)", featureValue: labResults.hdl, contribution: 6 });
    } else if (labResults.hdl > 60) {
      score -= 4;
      shapValues.push({ feature: "HDL (İyi)", featureValue: labResults.hdl, contribution: -4 });
    }
  }

  // Yas
  if (patient.age > 55) {
    score += 10;
    shapValues.push({ feature: "Yaş", featureValue: patient.age, contribution: 10 });
  } else if (patient.age > 40) {
    score += 5;
    shapValues.push({ feature: "Yaş", featureValue: patient.age, contribution: 5 });
  }

  // Aile oykusu
  if (patient.familyHistory.diabetes) {
    score += 12;
    shapValues.push({ feature: "Aile Öyküsü (DM)", featureValue: "Var", contribution: 12 });
  }

  // ICD-10
  const dmRelatedCodes = ["E11", "E14", "E66", "E78"];
  const matchedCodes = patient.icd10Codes.filter((c) => dmRelatedCodes.some((r) => c.startsWith(r)));
  if (matchedCodes.length > 0) {
    const contrib = matchedCodes.length * 10;
    score += contrib;
    shapValues.push({ feature: "ICD-10 Tanı Kodları", featureValue: matchedCodes.join(", "), contribution: contrib });
  }

  // Ilaclar
  const dmMeds = ["Metformin", "Gliklazid", "Insülin"];
  const matchedMeds = patient.medications.filter((m) => dmMeds.some((d) => m.toLowerCase().includes(d.toLowerCase())));
  if (matchedMeds.length > 0) {
    score += 12;
    shapValues.push({ feature: "DM İlaç Kullanımı", featureValue: matchedMeds.join(", "), contribution: 12 });
  }

  return { score: clamp(score, 0, 100), shapValues };
}

function calculateHypothyroidismRisk(patient: PatientInput): RiskFactors {
  let score = 8;
  const shapValues: ShapValue[] = [];

  // Lab: TSH (en onemli faktor)
  const { labResults } = patient;
  if (labResults.tsh != null) {
    if (labResults.tsh > 10) {
      score += 40;
      shapValues.push({ feature: "TSH", featureValue: `${labResults.tsh} mIU/L`, contribution: 40 });
    } else if (labResults.tsh > 4.5) {
      score += 25;
      shapValues.push({ feature: "TSH", featureValue: `${labResults.tsh} mIU/L`, contribution: 25 });
    } else if (labResults.tsh < 0.4) {
      score -= 5;
      shapValues.push({ feature: "TSH (Düşük)", featureValue: `${labResults.tsh} mIU/L`, contribution: -5 });
    } else {
      shapValues.push({ feature: "TSH (Normal)", featureValue: `${labResults.tsh} mIU/L`, contribution: -3 });
      score -= 3;
    }
  }

  // Cinsiyet - kadinlarda daha yaygin
  if (patient.gender === "female") {
    score += 10;
    shapValues.push({ feature: "Cinsiyet", featureValue: "Kadın", contribution: 10 });
  } else {
    shapValues.push({ feature: "Cinsiyet", featureValue: "Erkek", contribution: -3 });
    score -= 3;
  }

  // Yas
  if (patient.age > 60) {
    score += 10;
    shapValues.push({ feature: "Yaş", featureValue: patient.age, contribution: 10 });
  } else if (patient.age > 40) {
    score += 4;
    shapValues.push({ feature: "Yaş", featureValue: patient.age, contribution: 4 });
  }

  // BMI
  if (patient.bmi > 30) {
    score += 8;
    shapValues.push({ feature: "BMI", featureValue: patient.bmi.toFixed(1), contribution: 8 });
  }

  // Lab: Kolesterol (hipotiroidi kolesterolu yukseltiyor)
  if (labResults.totalCholesterol != null && labResults.totalCholesterol > 240) {
    score += 6;
    shapValues.push({ feature: "Total Kolesterol", featureValue: labResults.totalCholesterol, contribution: 6 });
  }

  // Aile oykusu
  if (patient.familyHistory.thyroid) {
    score += 15;
    shapValues.push({ feature: "Aile Öyküsü (Tiroid)", featureValue: "Var", contribution: 15 });
  }

  // ICD-10
  const thyroidCodes = ["E03", "E04", "E05"];
  const matchedCodes = patient.icd10Codes.filter((c) => thyroidCodes.some((r) => c.startsWith(r)));
  if (matchedCodes.length > 0) {
    const contrib = matchedCodes.length * 12;
    score += contrib;
    shapValues.push({ feature: "ICD-10 Tanı Kodları", featureValue: matchedCodes.join(", "), contribution: contrib });
  }

  // Ilaclar
  const thyroidMeds = ["Levotiroksin", "Propiltiyourasil"];
  const matchedMeds = patient.medications.filter((m) =>
    thyroidMeds.some((t) => m.toLowerCase().includes(t.toLowerCase()))
  );
  if (matchedMeds.length > 0) {
    score += 15;
    shapValues.push({ feature: "Tiroid İlacı Kullanımı", featureValue: matchedMeds.join(", "), contribution: 15 });
  }

  return { score: clamp(score, 0, 100), shapValues };
}

// ===== Ana Mock Tahmin Fonksiyonu =====

function getRecommendation(disease: DiseaseType, riskLevel: RiskLevel): string {
  const recs: Record<DiseaseType, Record<RiskLevel, string>> = {
    hypertension: {
      low: "Mevcut yaşam tarzınızı koruyun. Yıllık rutin kontroller yeterlidir.",
      medium: "Tuz tüketimini azaltın, düzenli egzersiz yapın. 6 ayda bir tansiyon takibi önerilir.",
      high: "Acil kardiyoloji konsültasyonu önerilir. Yaşam tarzı değişiklikleri ve ilaç tedavisi değerlendirilmelidir.",
      critical: "Derhal kardiyoloji muayenesi gereklidir. Antihipertansif tedavi başlatılması kuvvetle önerilir.",
    },
    type2_diabetes: {
      low: "Dengeli beslenme ve düzenli fiziksel aktivite ile riskinizi düşük tutun.",
      medium: "Karbonhidrat alımını kontrol edin. 3 ayda bir açlık kan şekeri ve HbA1c takibi önerilir.",
      high: "Endokrinoloji konsültasyonu önerilir. Diyet, egzersiz ve olası medikal tedavi planlanmalıdır.",
      critical: "Acil endokrinoloji değerlendirmesi gereklidir. İnsülin direnci ve beta hücre fonksiyonu araştırılmalıdır.",
    },
    hypothyroidism: {
      low: "Tiroid fonksiyonlarınız normal görünüyor. Yıllık TSH takibi yeterlidir.",
      medium: "6 ayda bir TSH kontrolü önerilir. Yorgunluk ve kilo değişimi gibi semptomları takip edin.",
      high: "Endokrinoloji konsültasyonu önerilir. Detaylı tiroid paneli (Free T3, Free T4, Anti-TPO) istenmelidir.",
      critical: "Acil endokrinoloji değerlendirmesi gereklidir. Levotiroksin tedavisi başlatılması kuvvetle önerilir.",
    },
  };
  return recs[disease][riskLevel];
}

export function generateMockPrediction(patient: PatientInput): PredictionResponse {
  const htRisk = calculateHypertensionRisk(patient);
  const dmRisk = calculateDiabetesRisk(patient);
  const thyroidRisk = calculateHypothyroidismRisk(patient);

  const htLevel = getRiskLevel(htRisk.score);
  const dmLevel = getRiskLevel(dmRisk.score);
  const thyroidLevel = getRiskLevel(thyroidRisk.score);

  const predictions: PredictionResult[] = [
    {
      disease: "hypertension",
      diseaseName: "Hipertansiyon",
      riskScore: htRisk.score,
      riskLevel: htLevel,
      confidence: 0.85 + Math.random() * 0.1,
      recommendation: getRecommendation("hypertension", htLevel),
    },
    {
      disease: "type2_diabetes",
      diseaseName: "Tip 2 Diyabet",
      riskScore: dmRisk.score,
      riskLevel: dmLevel,
      confidence: 0.82 + Math.random() * 0.1,
      recommendation: getRecommendation("type2_diabetes", dmLevel),
    },
    {
      disease: "hypothyroidism",
      diseaseName: "Hipotiroidi",
      riskScore: thyroidRisk.score,
      riskLevel: thyroidLevel,
      confidence: 0.88 + Math.random() * 0.1,
      recommendation: getRecommendation("hypothyroidism", thyroidLevel),
    },
  ];

  const explanations: ShapExplanation[] = [
    {
      disease: "hypertension",
      baseValue: 15,
      shapValues: htRisk.shapValues.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
      outputValue: htRisk.score,
    },
    {
      disease: "type2_diabetes",
      baseValue: 12,
      shapValues: dmRisk.shapValues.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
      outputValue: dmRisk.score,
    },
    {
      disease: "hypothyroidism",
      baseValue: 8,
      shapValues: thyroidRisk.shapValues.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
      outputValue: thyroidRisk.score,
    },
  ];

  return {
    predictions,
    explanations,
    timestamp: new Date().toISOString(),
  };
}

// ===== Varsayilan Hasta Verisi =====

export const defaultPatientInput: PatientInput = {
  age: 45,
  gender: "male",
  height: 175,
  weight: 82,
  bmi: 26.8,
  labResults: {},
  icd10Codes: [],
  medications: [],
  smokingStatus: "never",
  familyHistory: { hypertension: false, diabetes: false, thyroid: false },
};

// ===== Mock Hasta Gecmisi =====

export const mockPatientHistory: PatientHistoryEntry[] = [
  {
    id: "1",
    date: "2026-03-01",
    patientSummary: "52 yas, Erkek, BMI: 31.2",
    predictions: [
      { disease: "hypertension", diseaseName: "Hipertansiyon", riskScore: 68, riskLevel: "high", confidence: 0.89, recommendation: "" },
      { disease: "type2_diabetes", diseaseName: "Tip 2 Diyabet", riskScore: 55, riskLevel: "high", confidence: 0.85, recommendation: "" },
      { disease: "hypothyroidism", diseaseName: "Hipotiroidi", riskScore: 18, riskLevel: "low", confidence: 0.91, recommendation: "" },
    ],
  },
  {
    id: "2",
    date: "2026-02-25",
    patientSummary: "38 yas, Kadin, BMI: 24.5",
    predictions: [
      { disease: "hypertension", diseaseName: "Hipertansiyon", riskScore: 22, riskLevel: "low", confidence: 0.92, recommendation: "" },
      { disease: "type2_diabetes", diseaseName: "Tip 2 Diyabet", riskScore: 15, riskLevel: "low", confidence: 0.88, recommendation: "" },
      { disease: "hypothyroidism", diseaseName: "Hipotiroidi", riskScore: 42, riskLevel: "medium", confidence: 0.86, recommendation: "" },
    ],
  },
  {
    id: "3",
    date: "2026-02-20",
    patientSummary: "67 yas, Erkek, BMI: 28.7",
    predictions: [
      { disease: "hypertension", diseaseName: "Hipertansiyon", riskScore: 78, riskLevel: "critical", confidence: 0.91, recommendation: "" },
      { disease: "type2_diabetes", diseaseName: "Tip 2 Diyabet", riskScore: 62, riskLevel: "high", confidence: 0.87, recommendation: "" },
      { disease: "hypothyroidism", diseaseName: "Hipotiroidi", riskScore: 25, riskLevel: "low", confidence: 0.90, recommendation: "" },
    ],
  },
  {
    id: "4",
    date: "2026-02-15",
    patientSummary: "44 yas, Kadin, BMI: 33.1",
    predictions: [
      { disease: "hypertension", diseaseName: "Hipertansiyon", riskScore: 48, riskLevel: "medium", confidence: 0.86, recommendation: "" },
      { disease: "type2_diabetes", diseaseName: "Tip 2 Diyabet", riskScore: 71, riskLevel: "high", confidence: 0.89, recommendation: "" },
      { disease: "hypothyroidism", diseaseName: "Hipotiroidi", riskScore: 55, riskLevel: "high", confidence: 0.84, recommendation: "" },
    ],
  },
  {
    id: "5",
    date: "2026-02-10",
    patientSummary: "29 yas, Erkek, BMI: 22.0",
    predictions: [
      { disease: "hypertension", diseaseName: "Hipertansiyon", riskScore: 10, riskLevel: "low", confidence: 0.94, recommendation: "" },
      { disease: "type2_diabetes", diseaseName: "Tip 2 Diyabet", riskScore: 8, riskLevel: "low", confidence: 0.93, recommendation: "" },
      { disease: "hypothyroidism", diseaseName: "Hipotiroidi", riskScore: 5, riskLevel: "low", confidence: 0.95, recommendation: "" },
    ],
  },
];
