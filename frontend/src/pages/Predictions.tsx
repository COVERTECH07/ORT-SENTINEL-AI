import { FormEvent, useState } from "react";
import { ChefHat } from "lucide-react";
import api, { getError } from "../api";
import { asNumber, asArray, toDateInput } from "./utils";

type JsonRecord = Record<string, unknown>;

export function Predictions() {
  const [prediction, setPrediction] = useState<JsonRecord | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(() => toDateInput(new Date(Date.now() + 86400000)));
  const [meal, setMeal] = useState("lunch");
  const run = async (event?: FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/predict/", { params: { date, meal_type: meal } });
      setPrediction(data);
    } catch (reason) { setError(getError(reason)); }
    finally { setLoading(false); }
  };
  const items = asArray<JsonRecord>(prediction?.items ?? prediction?.forecast ?? []);
  const total = asNumber(prediction?.total_kg ?? prediction?.predicted_kg);
  const confidence = asNumber(prediction?.confidence ?? 0.82);
  return <div className="page-stack">
    <section className="welcome-row"><div><div className="eyebrow dark-eyebrow">DEMAND FORECAST</div><h1>Predictions</h1><p>Next-day demand estimates for smarter kitchen prep.</p></div></section>
    <section className="panel">
      <div className="forecast-controls">
        <form className="forecast-form" onSubmit={run}>
          <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>Meal<select value={meal} onChange={(e) => setMeal(e.target.value)}><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option></select></label>
          <button className="button button-dark" disabled={loading}>{loading ? "Running…" : "Run forecast"}</button>
        </form>
        <div className="forecast-confidence"><ChefHat size={16} /><span>Model confidence</span><b>{Math.round(confidence * 100)}%</b></div>
      </div>
      {error && <div className="inline-error" role="alert">{error}</div>}
      <div className="forecast-summary-grid">
        <div className="dark-summary"><span>Predicted demand</span><b>{total ? `${total.toFixed(1)} kg` : "—"}</b></div>
        <div className="panel" style={{ padding: 16 }}><span style={{ fontSize: 10, color: "#8a9585" }}>Meal</span><b style={{ display: "block", marginTop: 6 }}>{meal}</b></div>
        <div className="panel" style={{ padding: 16 }}><span style={{ fontSize: 10, color: "#8a9585" }}>Date</span><b style={{ display: "block", marginTop: 6 }}>{date}</b></div>
      </div>
      {items.length > 0 && <div className="forecast-items">{items.slice(0, 6).map((item, i) => (
        <div key={i}><span>{String(item.name ?? item.food_item ?? "Item")}</span><b>{asNumber(item.kg ?? item.weight_kg).toFixed(1)} kg</b></div>
      ))}</div>}
    </section>
  </div>;
}
