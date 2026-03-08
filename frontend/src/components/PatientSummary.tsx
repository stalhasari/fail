import { PatientInput } from "@/types";

interface Props {
    data: PatientInput;
}

export default function PatientSummary({ data }: Props) {
    const formatValue = (val?: number, unit?: string) => {
        if (val === undefined || val === null) return "-";
        return `${val} ${unit || ""}`;
    };

    const getSmokingText = (status: string) => {
        switch (status) {
            case "never": return "Hiç İçmemiş";
            case "former": return "Bırakmış";
            case "current": return "Kullanıyor";
            default: return "-";
        }
    };

    return (
        <div className="space-y-6">
            {/* Demografik Bilgiler */}
            <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                <h4 className="text-sm font-bold text-slate-800 mb-3 border-b border-slate-200 pb-2">Demografik Bilgiler</h4>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500">Yaş / Cinsiyet</span>
                        <span className="text-sm font-semibold text-slate-800">
                            {data.age} / {data.gender === "male" ? "Erkek" : "Kadın"}
                        </span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500">Boy / Kilo</span>
                        <span className="text-sm font-semibold text-slate-800">
                            {data.height} cm / {data.weight} kg
                        </span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500">VKİ (BMI)</span>
                        <span className="text-sm font-semibold text-blue-600">
                            {data.bmi.toFixed(1)}
                        </span>
                    </div>
                    <div className="flex flex-col mb-1">
                        <span className="text-xs text-slate-500">Sigara Kullanımı</span>
                        <span className="text-sm font-semibold text-slate-800">
                            {getSmokingText(data.smokingStatus)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Laboratuvar Bulguları */}
            <div className="bg-blue-50/30 rounded-xl p-4 border border-blue-100/50">
                <h4 className="text-sm font-bold text-slate-800 mb-3 border-b border-blue-100/50 pb-2">Son Laboratuvar Bulguları</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-4">
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500">Açlık Kan Şekeri</span>
                        <span className="text-sm font-semibold text-slate-800">{formatValue(data.labResults?.fastingGlucose, "mg/dL")}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500">HbA1c</span>
                        <span className="text-sm font-semibold text-slate-800">{formatValue(data.labResults?.hba1c, "%")}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500">TSH</span>
                        <span className="text-sm font-semibold text-slate-800">{formatValue(data.labResults?.tsh, "mIU/L")}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500">Total Kolesterol</span>
                        <span className="text-sm font-semibold text-slate-800">{formatValue(data.labResults?.totalCholesterol, "mg/dL")}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500">LDL</span>
                        <span className="text-sm font-semibold text-slate-800">{formatValue(data.labResults?.ldl, "mg/dL")}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500">HDL</span>
                        <span className="text-sm font-semibold text-slate-800">{formatValue(data.labResults?.hdl, "mg/dL")}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500">Trigliserit</span>
                        <span className="text-sm font-semibold text-slate-800">{formatValue(data.labResults?.triglycerides, "mg/dL")}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500">Kreatinin</span>
                        <span className="text-sm font-semibold text-slate-800">{formatValue(data.labResults?.creatinine, "mg/dL")}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-500">ALT / AST</span>
                        <span className="text-sm font-semibold text-slate-800">
                            {data.labResults?.alt || "-"} / {data.labResults?.ast || "-"} U/L
                        </span>
                    </div>
                </div>
            </div>

            {/* Tıbbi Özgeçmiş & İlaçlar */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tanılar */}
                <div className="bg-rose-50/30 rounded-xl p-4 border border-rose-100/50">
                    <h4 className="text-sm font-bold text-slate-800 mb-2">Geçmiş Tanılar (ICD-10)</h4>
                    {data.icd10Codes && data.icd10Codes.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                            {data.icd10Codes.map((code) => (
                                <span key={code} className="inline-flex items-center px-2 py-1 rounded-md bg-rose-100/50 text-rose-700 text-xs font-medium">
                                    {code}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <span className="text-xs text-slate-400 italic">Kayıtlı tanı bulunmamaktadır.</span>
                    )}
                </div>

                {/* İlaçlar */}
                <div className="bg-emerald-50/30 rounded-xl p-4 border border-emerald-100/50">
                    <h4 className="text-sm font-bold text-slate-800 mb-2">Aktif İlaçlar</h4>
                    {data.medications && data.medications.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                            {data.medications.map((med) => (
                                <span key={med} className="inline-flex items-center px-2 py-1 rounded-md bg-emerald-100/50 text-emerald-700 text-xs font-medium">
                                    {med}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <span className="text-xs text-slate-400 italic">Kayıtlı ilaç bulunmamaktadır.</span>
                    )}
                </div>
            </div>

            {/* Aile Öyküsü */}
            <div className="bg-purple-50/30 rounded-xl p-4 border border-purple-100/50">
                <h4 className="text-sm font-bold text-slate-800 mb-2">Aile Öyküsü</h4>
                <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${data.familyHistory?.hypertension ? "bg-red-500" : "bg-slate-300"}`} />
                        <span className={`text-xs ${data.familyHistory?.hypertension ? "text-slate-700 font-medium" : "text-slate-400"}`}>Hipertansiyon</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${data.familyHistory?.diabetes ? "bg-red-500" : "bg-slate-300"}`} />
                        <span className={`text-xs ${data.familyHistory?.diabetes ? "text-slate-700 font-medium" : "text-slate-400"}`}>Diyabet</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${data.familyHistory?.thyroid ? "bg-red-500" : "bg-slate-300"}`} />
                        <span className={`text-xs ${data.familyHistory?.thyroid ? "text-slate-700 font-medium" : "text-slate-400"}`}>Tiroid</span>
                    </div>
                </div>
            </div>

        </div>
    );
}
