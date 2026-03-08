"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { ShapExplanation, DiseaseType, DISEASE_LABELS } from "@/types";

interface Props {
  explanations: ShapExplanation[];
}

export default function ShapWaterfallChart({ explanations }: Props) {
  const [activeDisease, setActiveDisease] = useState<DiseaseType>("hypertension");

  const explanation = explanations.find((e) => e.disease === activeDisease);
  if (!explanation) return null;

  const chartData = explanation.shapValues.slice(0, 8).map((sv) => ({
    name: sv.feature,
    value: sv.contribution,
    featureValue: sv.featureValue,
  }));

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title mb-0">SHAP Faktör Analizi</h3>
        <div className="flex gap-1">
          {(["hypertension", "type2_diabetes", "hypothyroidism"] as DiseaseType[]).map(
            (d) => (
              <button
                key={d}
                onClick={() => setActiveDisease(d)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeDisease === d
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
              >
                {DISEASE_LABELS[d]}
              </button>
            )
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 mb-3 text-xs text-slate-500">
        <span>
          Baz Değer: <strong className="text-slate-700">{explanation.baseValue}</strong>
        </span>
        <span>→</span>
        <span>
          Tahmin: <strong className="text-slate-700">{explanation.outputValue}</strong>
        </span>
      </div>

      <ResponsiveContainer width="100%" height={Math.max(250, chartData.length * 40)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: "#64748b", fontSize: 11 }}
            axisLine={{ stroke: "#cbd5e1" }}
          />
          <YAxis
            dataKey="name"
            type="category"
            tick={{ fill: "#475569", fontSize: 12 }}
            axisLine={{ stroke: "#cbd5e1" }}
            width={140}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(value: number, _name: string, props: { payload?: { featureValue?: string | number } }) => [
              `${value > 0 ? "+" : ""}${value.toFixed(1)}`,
              `Değer: ${props?.payload?.featureValue || ""}`,
            ]}
            labelStyle={{ color: "#0f172a" }}
          />
          <ReferenceLine x={0} stroke="#94a3b8" strokeDasharray="3 3" />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
            {chartData.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.value >= 0 ? "#ef4444" : "#3b82f6"}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex items-center justify-center gap-6 mt-3 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-500" />
          <span>Riski Artıran</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-blue-500" />
          <span>Riski Azaltan</span>
        </div>
      </div>
    </div>
  );
}
