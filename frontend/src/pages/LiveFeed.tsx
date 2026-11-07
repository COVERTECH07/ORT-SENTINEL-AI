import { useCallback, useEffect, useState } from "react";
import { Activity, Flame, Leaf } from "lucide-react";
import api, { getError, WasteEvent } from "../api";
import { asArray, itemLabel, humanMeal, dateLabel } from "./utils";

export function LiveFeed() {
  const [events, setEvents] = useState<WasteEvent[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/waste/", { params: { limit: 40 } });
      setEvents(asArray<WasteEvent>(data.events ?? data));
      setError("");
    } catch (reason) { setError(getError(reason)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onLive = () => { void load(); };
    window.addEventListener("ort:live-event", onLive);
    return () => window.removeEventListener("ort:live-event", onLive);
  }, [load]);
  return <div className="page-stack">
    <section className="welcome-row"><div><div className="eyebrow dark-eyebrow">REAL-TIME</div><h1>Live feed</h1><p>Every disposal event across campus appears here instantly.</p></div></section>
    {error && <div className="inline-error" role="alert">{error} <button onClick={() => void load()}>Try again</button></div>}
    <section className="panel full-feed-panel">
      <div className="panel-heading"><div><h2>Recent events</h2><p>Newest first</p></div></div>
      {!events.length ? <div className="empty-state"><Activity size={22} /><p>No events yet.</p><small>Hardware or demo events will show here.</small></div> :
        <div className="full-event-list">{events.map((event) => {
          const high = event.status === "high_waste";
          return <div className="full-event-row" key={event.id}>
            <div className={`event-avatar ${high ? "event-high" : "event-low"}`}>{high ? <Flame size={15} /> : <Leaf size={15} />}</div>
            <div className="event-detail"><b>{event.user_name ?? `Member ${event.user_id ?? ""}`}</b><span>{event.food_items?.map(itemLabel).join(", ") || "Food waste"} · {humanMeal(event.meal_type)}</span></div>
            <span className={`event-status ${high ? "event-status-high" : "event-status-low"}`}>{high ? "High waste" : "Low waste"}</span>
            <div className="event-meta"><b className={high ? "waste-high-text" : "waste-low-text"}>{Math.round(event.weight_grams)}g</b><span>{dateLabel(event.timestamp)}</span></div>
          </div>;
        })}</div>}
    </section>
  </div>;
}
