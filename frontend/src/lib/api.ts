import { PatientInput, PredictionResponse } from "@/types";
import { generateMockPrediction } from "./mockData";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false"; // varsayilan: mock kullan

export async function predictRisk(patient: PatientInput): Promise<PredictionResponse> {
  if (USE_MOCK) {
    // Gercek API hissi icin kucuk bir gecikme
    await new Promise((r) => setTimeout(r, 200));
    return generateMockPrediction(patient);
  }

  const res = await fetch(`${API_BASE}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patient),
  });

  if (!res.ok) {
    throw new Error(`API Error: ${res.status}`);
  }

  return res.json();
}
