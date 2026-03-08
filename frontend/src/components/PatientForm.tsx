"use client";

import { useState, useCallback } from "react";
import {
  PatientInput,
  LabResults,
  FamilyHistory,
  COMMON_ICD10_CODES,
  COMMON_MEDICATIONS,
} from "@/types";

interface Props {
  value: PatientInput;
  onChange: (patient: PatientInput) => void;
}

export default function PatientForm({ value, onChange }: Props) {
  const [icdSearch, setIcdSearch] = useState("");
  const [medSearch, setMedSearch] = useState("");
  const [showIcdDropdown, setShowIcdDropdown] = useState(false);
  const [showMedDropdown, setShowMedDropdown] = useState(false);

  const update = useCallback(
    (partial: Partial<PatientInput>) => {
      const next = { ...value, ...partial };
      // BMI otomatik hesapla
      if (partial.height !== undefined || partial.weight !== undefined) {
        const h = partial.height ?? value.height;
        const w = partial.weight ?? value.weight;
        if (h > 0) {
          next.bmi = Math.round((w / ((h / 100) * (h / 100))) * 10) / 10;
        }
      }
      onChange(next);
    },
    [value, onChange]
  );

  const updateLab = useCallback(
    (partial: Partial<LabResults>) => {
      update({ labResults: { ...value.labResults, ...partial } });
    },
    [value, update]
  );

  const updateFamily = useCallback(
    (partial: Partial<FamilyHistory>) => {
      update({ familyHistory: { ...value.familyHistory, ...partial } });
    },
    [value, update]
  );

  const addIcd = (code: string) => {
    if (!value.icd10Codes.includes(code)) {
      update({ icd10Codes: [...value.icd10Codes, code] });
    }
    setIcdSearch("");
    setShowIcdDropdown(false);
  };

  const removeIcd = (code: string) => {
    update({ icd10Codes: value.icd10Codes.filter((c) => c !== code) });
  };

  const addMed = (med: string) => {
    if (!value.medications.includes(med)) {
      update({ medications: [...value.medications, med] });
    }
    setMedSearch("");
    setShowMedDropdown(false);
  };

  const removeMed = (med: string) => {
    update({ medications: value.medications.filter((m) => m !== med) });
  };

  const filteredIcd = COMMON_ICD10_CODES.filter(
    (c) =>
      !value.icd10Codes.includes(c.code) &&
      (c.code.toLowerCase().includes(icdSearch.toLowerCase()) ||
        c.description.toLowerCase().includes(icdSearch.toLowerCase()))
  );

  const filteredMeds = COMMON_MEDICATIONS.filter(
    (m) =>
      !value.medications.includes(m) &&
      m.toLowerCase().includes(medSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* ===== DEMOGRAFIK BILGILER ===== */}
      <section>
        <h3 className="section-title flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-xs font-bold">1</span>
          Demografik Bilgiler
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Yaş</label>
            <input
              type="number"
              className="input-field"
              value={value.age || ""}
              onChange={(e) => update({ age: Number(e.target.value) })}
              placeholder="Örnek: 45"
              min={0}
              max={120}
            />
          </div>
          <div>
            <label className="label">Cinsiyet</label>
            <select
              className="input-field"
              value={value.gender}
              onChange={(e) => update({ gender: e.target.value as "male" | "female" })}
            >
              <option value="male">Erkek</option>
              <option value="female">Kadın</option>
            </select>
          </div>
          <div>
            <label className="label">Boy (cm)</label>
            <input
              type="number"
              className="input-field"
              value={value.height || ""}
              onChange={(e) => update({ height: Number(e.target.value) })}
              placeholder="Örnek: 175"
              min={50}
              max={250}
            />
          </div>
          <div>
            <label className="label">Kilo (kg)</label>
            <input
              type="number"
              className="input-field"
              value={value.weight || ""}
              onChange={(e) => update({ weight: Number(e.target.value) })}
              placeholder="Örnek: 82"
              min={20}
              max={300}
            />
          </div>
        </div>
        {value.bmi > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm text-slate-500">Hesaplanan BMI:</span>
            <span
              className={`text-sm font-bold ${value.bmi > 30 ? "text-red-600" : value.bmi > 25 ? "text-yellow-600" : "text-green-600"
                }`}
            >
              {value.bmi.toFixed(1)}
            </span>
            <span className="text-xs text-slate-500">
              {value.bmi > 30 ? "(Obez)" : value.bmi > 25 ? "(Fazla Kilolu)" : "(Normal)"}
            </span>
          </div>
        )}
      </section>

      {/* ===== LABORATUVAR SONUCLARI ===== */}
      <section>
        <h3 className="section-title flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-xs font-bold">2</span>
          Laboratuvar Sonuçları
          <span className="text-xs text-slate-500 font-normal ml-2">(Opsiyonel)</span>
        </h3>

        {/* Diyabet Paneli */}
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2 mt-1">Glisemik Panel</p>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Açlık Kan Şekeri (mg/dL)</label>
            <input
              type="number"
              className="input-field"
              value={value.labResults.fastingGlucose ?? ""}
              onChange={(e) =>
                updateLab({ fastingGlucose: e.target.value ? Number(e.target.value) : undefined })
              }
              placeholder="70-100 normal"
            />
          </div>
          <div>
            <label className="label">HbA1c (%)</label>
            <input
              type="number"
              step="0.1"
              className="input-field"
              value={value.labResults.hba1c ?? ""}
              onChange={(e) =>
                updateLab({ hba1c: e.target.value ? Number(e.target.value) : undefined })
              }
              placeholder="4.0-5.6 normal"
            />
          </div>
        </div>

        {/* Tiroid */}
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Tiroid</p>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">TSH (mIU/L)</label>
            <input
              type="number"
              step="0.1"
              className="input-field"
              value={value.labResults.tsh ?? ""}
              onChange={(e) =>
                updateLab({ tsh: e.target.value ? Number(e.target.value) : undefined })
              }
              placeholder="0.4-4.0 normal"
            />
          </div>
        </div>

        {/* Lipid Paneli */}
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Lipid Paneli</p>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Total Kolesterol (mg/dL)</label>
            <input
              type="number"
              className="input-field"
              value={value.labResults.totalCholesterol ?? ""}
              onChange={(e) =>
                updateLab({ totalCholesterol: e.target.value ? Number(e.target.value) : undefined })
              }
              placeholder="< 200 ideal"
            />
          </div>
          <div>
            <label className="label">LDL (mg/dL)</label>
            <input
              type="number"
              className="input-field"
              value={value.labResults.ldl ?? ""}
              onChange={(e) =>
                updateLab({ ldl: e.target.value ? Number(e.target.value) : undefined })
              }
              placeholder="< 100 ideal"
            />
          </div>
          <div>
            <label className="label">HDL (mg/dL)</label>
            <input
              type="number"
              className="input-field"
              value={value.labResults.hdl ?? ""}
              onChange={(e) =>
                updateLab({ hdl: e.target.value ? Number(e.target.value) : undefined })
              }
              placeholder="> 60 ideal"
            />
          </div>
          <div>
            <label className="label">Trigliserit (mg/dL)</label>
            <input
              type="number"
              className="input-field"
              value={value.labResults.triglycerides ?? ""}
              onChange={(e) =>
                updateLab({ triglycerides: e.target.value ? Number(e.target.value) : undefined })
              }
              placeholder="< 150 normal"
            />
          </div>
        </div>

        {/* Karaciger & Bobrek */}
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Karaciğer & Böbrek</p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="label">Kreatinin (mg/dL)</label>
            <input
              type="number"
              step="0.1"
              className="input-field"
              value={value.labResults.creatinine ?? ""}
              onChange={(e) =>
                updateLab({ creatinine: e.target.value ? Number(e.target.value) : undefined })
              }
              placeholder="0.6-1.2 normal"
            />
          </div>
          <div>
            <label className="label">ALT (U/L)</label>
            <input
              type="number"
              className="input-field"
              value={value.labResults.alt ?? ""}
              onChange={(e) =>
                updateLab({ alt: e.target.value ? Number(e.target.value) : undefined })
              }
              placeholder="7-56 normal"
            />
          </div>
          <div>
            <label className="label">AST (U/L)</label>
            <input
              type="number"
              className="input-field"
              value={value.labResults.ast ?? ""}
              onChange={(e) =>
                updateLab({ ast: e.target.value ? Number(e.target.value) : undefined })
              }
              placeholder="10-40 normal"
            />
          </div>
        </div>
      </section>

      {/* ===== ICD-10 TANI KODLARI ===== */}
      <section>
        <h3 className="section-title flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-xs font-bold">3</span>
          Geçmiş Tanılar (ICD-10)
        </h3>

        {/* Secilen kodlar */}
        {value.icd10Codes.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {value.icd10Codes.map((code) => {
              const desc = COMMON_ICD10_CODES.find((c) => c.code === code)?.description || code;
              return (
                <span key={code} className="tag">
                  <span className="font-bold">{code}</span>
                  <span className="text-slate-400">-</span>
                  <span>{desc}</span>
                  <button onClick={() => removeIcd(code)} className="tag-remove ml-1">
                    x
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Arama */}
        <div className="relative">
          <input
            type="text"
            className="input-field"
            placeholder="ICD-10 kodu veya tanı adı ile arama..."
            value={icdSearch}
            onChange={(e) => {
              setIcdSearch(e.target.value);
              setShowIcdDropdown(true);
            }}
            onFocus={() => setShowIcdDropdown(true)}
            onBlur={() => setTimeout(() => setShowIcdDropdown(false), 200)}
          />
          {showIcdDropdown && icdSearch && filteredIcd.length > 0 && (
            <div className="absolute z-10 w-full mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
              {filteredIcd.map((item) => (
                <button
                  key={item.code}
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 transition-colors flex items-center gap-2"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addIcd(item.code)}
                >
                  <span className="font-bold text-blue-600">{item.code}</span>
                  <span className="text-slate-700">{item.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ===== ILACLAR ===== */}
      <section>
        <h3 className="section-title flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-xs font-bold">4</span>
          Reçeteli İlaçlar
        </h3>

        {value.medications.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {value.medications.map((med) => (
              <span key={med} className="tag">
                {med}
                <button onClick={() => removeMed(med)} className="tag-remove ml-1">
                  x
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative">
          <input
            type="text"
            className="input-field"
            placeholder="İlaç adı ile arama..."
            value={medSearch}
            onChange={(e) => {
              setMedSearch(e.target.value);
              setShowMedDropdown(true);
            }}
            onFocus={() => setShowMedDropdown(true)}
            onBlur={() => setTimeout(() => setShowMedDropdown(false), 200)}
          />
          {showMedDropdown && medSearch && filteredMeds.length > 0 && (
            <div className="absolute z-10 w-full mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
              {filteredMeds.map((med) => (
                <button
                  key={med}
                  className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 transition-colors text-slate-700"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addMed(med)}
                >
                  {med}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ===== YASAM TARZI ===== */}
      <section>
        <h3 className="section-title flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-xs font-bold">5</span>
          Yaşam Tarzı & Öykü
        </h3>

        <div className="mb-4">
          <label className="label">Sigara Kullanımı</label>
          <select
            className="input-field"
            value={value.smokingStatus}
            onChange={(e) =>
              update({ smokingStatus: e.target.value as "never" | "former" | "current" })
            }
          >
            <option value="never">Hiç kullanmadı</option>
            <option value="former">Bırakmış</option>
            <option value="current">Aktif kullanıyor</option>
          </select>
        </div>

        <div>
          <label className="label mb-3">Aile Öyküsü</label>
          <div className="space-y-2.5">
            {[
              { key: "hypertension" as const, label: "Hipertansiyon" },
              { key: "diabetes" as const, label: "Diyabet" },
              { key: "thyroid" as const, label: "Tiroid Hastalığı" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={value.familyHistory[key]}
                  onChange={(e) => updateFamily({ [key]: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 bg-white text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                />
                <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
