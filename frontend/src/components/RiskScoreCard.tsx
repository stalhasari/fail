"use client";

import { PredictionResult, RISK_COLORS, RISK_LEVEL_LABELS } from "@/types";

interface Props {
  prediction: PredictionResult;
}

export default function RiskScoreCard({ prediction }: Props) {
  const { diseaseName, riskScore, riskLevel, confidence, recommendation } = prediction;
  const color = RISK_COLORS[riskLevel];
  const levelLabel = RISK_LEVEL_LABELS[riskLevel];

  // SVG dairesel progress
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (riskScore / 100) * circumference;

  return (
    <div className="card flex flex-col items-center gap-4">
      {/* Hastalik Basligi */}
      <h3 className="text-base font-semibold text-slate-800">{diseaseName}</h3>

      {/* Dairesel Skor Gostergesi */}
      <div className="relative flex items-center justify-center">
        <svg width="130" height="130" className="-rotate-90">
          {/* Arka plan dairesi */}
          <circle
            cx="65"
            cy="65"
            r={radius}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="10"
          />
          {/* Ilerleme dairesi */}
          <circle
            cx="65"
            cy="65"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-3xl font-bold" style={{ color }}>
            %{riskScore}
          </span>
          <span
            className="text-xs font-semibold uppercase tracking-wider mt-0.5"
            style={{ color }}
          >
            {levelLabel}
          </span>
        </div>
      </div>

      {/* Guven Skoru */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>Model Guveni:</span>
        <span className="font-semibold text-slate-700">
          %{(confidence * 100).toFixed(0)}
        </span>
      </div>

      {/* Oneri */}
      <p className="text-xs text-slate-500 text-center leading-relaxed border-t border-slate-200 pt-3 mt-1">
        {recommendation}
      </p>
    </div>
  );
}
