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
    } catch (reason) {
      setError(getError(reason));
    } finally {
      setLoading(false);
    }
  };

  const items = asArray<JsonRecord>(prediction?.items ?? prediction?.predictions ?? prediction?.recommendations ?? []);
  const total = asNumber(
    prediction?.recommended_total_kg ??
      prediction?.predicted_waste_kg ??
      prediction?.expected_demand_kg ??
      prediction?.total_kg ??
      prediction?.predicted_kg,
  );
  const confidence = prediction ? asNumber(prediction.confidence) : 0;
  const model = prediction ? String(prediction.model ?? "—") : "";

  return (
    <div className="page-stack">
      <section className="welcome-row">
        <div>
          <div className="eyebrow dark-eyebrow">DEMAND FORECAST</div>
          <h1>Predictions</h1>
          <p>Next-day demand estimates for smarter kitchen prep.</p>
        </div>
      </section>

      <section className="panel">
        <div className="forecast-controls">
          <form className="forecast-form" onSubmit={run}>
            <label>
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              Meal
              <select value={meal} onChange={(e) => setMeal(e.target.value)}>
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
              </select>
            </label>
            <button className="button button-dark" disabled={loading}>
              {loading ? "Running…" : "Run forecast"}
            </button>
          </form>
          <div className="forecast-confidence">
            <ChefHat size={16} />
            <span>Model confidence</span>
            <b>{prediction ? `${Math.round(confidence * 100)}%` : "—"}</b>
          </div>
        </div>

        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}

        <div className="forecast-summary-grid">
          <div className="dark-summary">
            <span>Predicted demand</span>
            <b>{total > 0 ? `${total.toFixed(1)} kg` : prediction ? "0.0 kg" : "—"}</b>
          </div>
          <div className="panel forecast-meta-card">
            <span>Meal</span>
            <b>{meal}</b>
          </div>
          <div className="panel forecast-meta-card">
            <span>Date</span>
            <b>{date}</b>
          </div>
        </div>

        {model && (
          <p className="forecast-model-note">
            Model: <b>{model}</b>
            {prediction?.expected_diners != null ? ` · ~${asNumber(prediction.expected_diners)} diners` : ""}
          </p>
        )}

        {items.length > 0 && (
          <div className="forecast-items">
            {items.slice(0, 8).map((item, i) => {
              const kg = asNumber(
                item.recommended_quantity_kg ??
                  item.predicted_quantity_kg ??
                  item.expected_demand_kg ??
                  item.kg ??
                  item.weight_kg,
              );
              return (
                <div key={i}>
                  <span>{String(item.name ?? item.food_item ?? "Item")}</span>
                  <b>{kg.toFixed(2)} kg</b>
                </div>
              );
            })}
          </div>
        )}

        {prediction && items.length === 0 && (
          <div className="empty-inline" style={{ marginTop: 16 }}>
            Forecast ran, but no item breakdown returned.
          </div>
        )}
      </section>
    </div>
  );
}
