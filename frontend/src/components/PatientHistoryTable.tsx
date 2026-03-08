"use client";

import { PatientHistoryEntry, RISK_COLORS } from "@/types";

interface Props {
  history: PatientHistoryEntry[];
}

function RiskBadge({ score, level }: { score: number; level: string }) {
  const color = RISK_COLORS[level as keyof typeof RISK_COLORS] || "#94a3b8";
  return (
    <span
      className="inline-flex items-center justify-center min-w-[42px] px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ backgroundColor: `${color}20`, color }}
    >
      %{score}
    </span>
  );
}

export default function PatientHistoryTable({ history }: Props) {
  return (
    <div className="card">
      <h3 className="section-title">Gecmis Tahminler</h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="pb-3 text-left font-medium text-slate-500">Tarih</th>
              <th className="pb-3 text-left font-medium text-slate-500">Hasta</th>
              <th className="pb-3 text-center font-medium text-slate-500">HT</th>
              <th className="pb-3 text-center font-medium text-slate-500">DM</th>
              <th className="pb-3 text-center font-medium text-slate-500">Tiroid</th>
            </tr>
          </thead>
          <tbody>
            {history.map((entry) => {
              const ht = entry.predictions.find((p) => p.disease === "hypertension");
              const dm = entry.predictions.find((p) => p.disease === "type2_diabetes");
              const thyroid = entry.predictions.find((p) => p.disease === "hypothyroidism");

              return (
                <tr key={entry.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="py-3 text-slate-600">{entry.date}</td>
                  <td className="py-3 text-slate-800 font-medium">{entry.patientSummary}</td>
                  <td className="py-3 text-center">
                    {ht && <RiskBadge score={ht.riskScore} level={ht.riskLevel} />}
                  </td>
                  <td className="py-3 text-center">
                    {dm && <RiskBadge score={dm.riskScore} level={dm.riskLevel} />}
                  </td>
                  <td className="py-3 text-center">
                    {thyroid && <RiskBadge score={thyroid.riskScore} level={thyroid.riskLevel} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
