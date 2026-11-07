import { useCallback, useEffect, useState } from "react";
import { Activity, Flame, Leaf, Search, Sparkles, Utensils, Award } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import api, { getError, User, WasteEvent } from "../api";
import { asNumber, asArray, itemLabel, humanMeal, dateLabel, toDateInput } from "./utils";

type JsonRecord = Record<string, unknown>;

export function useLiveEvents(onEvent?: () => void) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const handler = () => { setCount((c) => c + 1); onEvent?.(); };
    window.addEventListener("ort:live-event", handler);
    return () => window.removeEventListener("ort:live-event", handler);
  }, [onEvent]);
  return count;
}

export function Dashboard({ user }: { user: User }) {
  const [stats, setStats] = useState<JsonRecord | null>(null);
  const [charts, setCharts] = useState<JsonRecord | null>(null);
  const [events, setEvents] = useState<WasteEvent[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("7");
  const [endDate, setEndDate] = useState(() => toDateInput(new Date()));
  const [startDate, setStartDate] = useState(() => { const s = new Date(); s.setDate(s.getDate() - 6); return toDateInput(s); });
  const [mealType, setMealType] = useState("");
  const [userId, setUserId] = useState("");

  const load = useCallback(async () => {
    try {
      const selectedDays = Math.max(1, Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000) + 1);
      const filters = { start_date: startDate, end_date: endDate, ...(mealType ? { meal_type: mealType } : {}), ...(userId ? { user_id: userId } : {}) };
      const [statsResult, chartsResult, eventsResult] = await Promise.all([
        api.get("/dashboard/stats", { params: filters }),
        api.get("/dashboard/charts", { params: { ...filters, days: selectedDays } }),
        api.get("/waste/", { params: { ...filters, start_date: `${startDate}T00:00:00Z`, end_date: `${endDate}T23:59:59Z`, limit: 6 } }),
      ]);
      setStats(statsResult.data);
      setCharts(chartsResult.data);
      setEvents(asArray<WasteEvent>(eventsResult.data.events ?? eventsResult.data));
      setError("");
    } catch (reason) { setError(getError(reason)); }
  }, [endDate, mealType, startDate, userId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void api.get("/users/").then(({ data }) => setUsers(asArray<User>(data.users ?? data))).catch((r) => setError(getError(r))); }, []);
  const websocketEvents = useLiveEvents(load);

  const trend = asArray<JsonRecord>(charts?.daily_trend ?? charts?.trend ?? charts?.daily);
  const byItem = asArray<JsonRecord>(charts?.item_waste ?? charts?.by_item ?? charts?.items ?? charts?.categories).map((item) => ({ ...item, food_item: item.food_item ?? item.category ?? item.name, weight_kg: item.weight_kg ?? item.amount_kg }));
  const byMeal = asArray<JsonRecord>(charts?.meal_distribution ?? charts?.by_meal ?? charts?.meals);
  const mealWasteTotal = byMeal.reduce((t, m) => t + asNumber(m.weight_kg ?? m.amount_kg), 0);
  const waste = asNumber(stats?.filtered_waste_kg ?? stats?.range_waste_kg ?? stats?.today_waste_kg ?? stats?.total_waste_kg);
  const saved = asNumber(stats?.filtered_saved_kg ?? stats?.waste_saved_kg ?? stats?.saved_kg);
  const money = asNumber(stats?.money_saved ?? stats?.money_saved_inr ?? stats?.money_saved_today_inr);
  const co2 = asNumber(stats?.co2_saved_kg ?? stats?.co2_saved ?? stats?.estimated_co2_kg);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const setQuickRange = (value: string) => {
    setPeriod(value);
    if (value === "custom") return;
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - Number(value) + 1);
    setEndDate(toDateInput(end));
    setStartDate(toDateInput(start));
  };

  return <div className="page-stack">
    <section className="welcome-row"><div><div className="eyebrow dark-eyebrow">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase()} <span className="status-pill">● CAMPUS ACTIVE</span></div>
      <h1>{greeting}, {user.name?.split(" ")[0]}.</h1><p>Here is how your campus is performing on food waste.</p></div></section>

    <section className="panel filters-panel"><div className="filter-title"><Search size={17} /><b>Filter dashboard</b></div>
      <div className="dashboard-filter-controls" style={{ display: "flex", gap: 11, flexWrap: "wrap" }}>
        <label style={{ fontSize: 9, color: "#8b958a", display: "grid", gap: 5 }}>Range<select value={period} onChange={(e) => setQuickRange(e.target.value)} style={{ height: 33, border: "1px solid #e6ebe3", borderRadius: 6, padding: "0 9px" }}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="custom">Custom</option></select></label>
        <label style={{ fontSize: 9, color: "#8b958a", display: "grid", gap: 5 }}>From<input type="date" value={startDate} max={endDate} onChange={(e) => { setStartDate(e.target.value); setPeriod("custom"); }} style={{ height: 33, border: "1px solid #e6ebe3", borderRadius: 6, padding: "0 9px" }} /></label>
        <label style={{ fontSize: 9, color: "#8b958a", display: "grid", gap: 5 }}>To<input type="date" value={endDate} min={startDate} max={toDateInput(new Date())} onChange={(e) => { setEndDate(e.target.value); setPeriod("custom"); }} style={{ height: 33, border: "1px solid #e6ebe3", borderRadius: 6, padding: "0 9px" }} /></label>
        <label style={{ fontSize: 9, color: "#8b958a", display: "grid", gap: 5 }}>Meal<select value={mealType} onChange={(e) => setMealType(e.target.value)} style={{ height: 33, border: "1px solid #e6ebe3", borderRadius: 6, padding: "0 9px" }}><option value="">All meals</option><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option></select></label>
      </div></section>

    {error && <div className="inline-error" role="alert">{error} <button onClick={() => void load()}>Try again</button></div>}
    {websocketEvents > 0 && <div className="live-announcement"><span className="live-dot" /> Live updates · {websocketEvents} new event{websocketEvents === 1 ? "" : "s"}</div>}

    <section className="metric-grid">
      <article className="metric-card"><div className="metric-top"><span className="metric-label">WASTE IN RANGE</span><div className="metric-icon orange"><Utensils size={17} /></div></div><div className="metric-value">{waste.toFixed(1)}<small>kg</small></div></article>
      <article className="metric-card"><div className="metric-top"><span className="metric-label">FOOD SAVED</span><div className="metric-icon green"><Leaf size={17} /></div></div><div className="metric-value">{saved.toFixed(1)}<small>kg</small></div></article>
      <article className="metric-card"><div className="metric-top"><span className="metric-label">MONEY SAVED</span><div className="metric-icon yellow"><span className="rupee-icon">₹</span></div></div><div className="metric-value">₹{money.toLocaleString("en-IN")}</div></article>
      <article className="metric-card"><div className="metric-top"><span className="metric-label">CO₂ PREVENTED</span><div className="metric-icon blue"><Sparkles size={17} /></div></div><div className="metric-value">{co2.toFixed(1)}<small>kg</small></div></article>
    </section>

    <section className="chart-grid">
      <article className="panel trend-panel"><div className="panel-heading"><div><h2>Waste & savings trend</h2><p>Daily totals in the selected range</p></div></div>
        <div className="chart-area">{trend.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={trend}><CartesianGrid strokeDasharray="3 3" stroke="#eef1ea" /><XAxis dataKey="date" tick={{ fontSize: 9 }} /><YAxis tick={{ fontSize: 9 }} /><Tooltip /><Area type="monotone" dataKey="waste_kg" stroke="#d99154" fill="#f8e8d8" name="Waste kg" /><Area type="monotone" dataKey="saved_kg" stroke="#4b966a" fill="#e5f3ea" name="Saved kg" /></AreaChart></ResponsiveContainer> : <div className="empty-inline">No trend data yet.</div>}</div>
      </article>
      <article className="panel"><div className="panel-heading"><div><h2>By food item</h2><p>Top waste categories</p></div></div>
        <div className="item-chart">{byItem.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={byItem.slice(0, 6)} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#eef1ea" /><XAxis type="number" tick={{ fontSize: 9 }} /><YAxis type="category" dataKey="food_item" width={70} tick={{ fontSize: 9 }} /><Tooltip /><Bar dataKey="weight_kg" fill="#7dbe8f" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer> : <div className="empty-inline">No item data yet.</div>}</div>
      </article>
    </section>

    <section className="lower-grid">
      <article className="panel"><div className="panel-heading"><div><h2>Meal distribution</h2><p>Where waste concentrates</p></div></div>
        <div className="meal-content">
          <div className="donut-wrap">{byMeal.length ? <><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={byMeal} dataKey="weight_kg" nameKey="meal_type" innerRadius={48} outerRadius={70} paddingAngle={3}>{byMeal.map((_, i) => <Cell key={i} fill={["#4b966a", "#d99154", "#62859a", "#b18c3e"][i % 4]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{mealWasteTotal.toFixed(1)}</strong><span>kg total</span></div></> : <div className="empty-inline">No meal data.</div>}</div>
        </div>
      </article>
      <article className="panel feed-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Latest disposal events</p></div><Link to="/live-feed" className="text-link">View all</Link></div>
        {!events.length ? <div className="empty-state"><Activity size={22} /><p>No waste events yet.</p></div> :
          <div className="event-list">{events.map((event) => { const high = event.status === "high_waste"; return <div className="event-row" key={event.id}><div className={`event-avatar ${high ? "event-high" : "event-low"}`}>{high ? <Flame size={15} /> : <Leaf size={15} />}</div><div className="event-detail"><b>{event.user_name ?? `Member ${event.user_id ?? ""}`}</b><span>{event.food_items?.map(itemLabel).join(", ") || "Food waste"} · {humanMeal(event.meal_type)}</span></div><div className="event-meta"><b className={high ? "waste-high-text" : "waste-low-text"}>{Math.round(event.weight_grams)}g</b><span>{dateLabel(event.timestamp)}</span></div></div>; })}</div>}
      </article>
    </section>

    <Leaderboard />
  </div>;
}

function Leaderboard() {
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => { void api.get("/dashboard/leaderboard").then(({ data }) => setUsers(asArray<User>(data.users ?? data))).catch(() => setUsers([])); }, []);
  return <article className="panel leaderboard-panel"><div className="panel-heading"><div><h2>Top savers</h2><p>Campus sustainability champions</p></div><span className="text-link">All time</span></div>
    {users.length ? <div className="leaderboard">{users.slice(0, 4).map((person, index) => <div className="leader-row" key={person.id}><span className={`rank rank-${index + 1}`}>{String(index + 1).padStart(2, "0")}</span><span className="leader-avatar">{person.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</span><span className="leader-name"><b>{person.name}</b><small>{index === 0 ? "Zero waste hero" : "Campus saver"}</small></span><span className="leader-points"><Award size={14} /> {person.total_points} pts</span></div>)}</div> : <div className="empty-inline">Leaderboard data will appear once seeded.</div>}
  </article>;
}
