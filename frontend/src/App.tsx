import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, ArrowDownRight, ArrowUpRight, Award, Bell, ChefHat, ChevronDown, CircleHelp,
  Clock3, Download, Flame, Leaf, LayoutDashboard, LogOut, Menu, Search, Settings2, ShieldCheck,
  Sparkles, TrendingUp, Users, Utensils, X,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import api, { getError, User, WasteEvent } from "./api";
import SentinelLogo from "./components/SentinelLogo";

type JsonRecord = Record<string, unknown>;
const asNumber = (value: unknown) => Number(value ?? 0);
const asArray = <T,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
const itemLabel = (item: WasteEvent["food_items"][number]) => typeof item === "string" ? item : item.name;
const humanMeal = (meal: string) => meal.charAt(0).toUpperCase() + meal.slice(1);
const dateLabel = (value: string) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const toDateInput = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
async function downloadCsv() {
  const { data } = await api.get("/admin/export.csv", { responseType: "blob" });
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ort-waste-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(Boolean(localStorage.getItem("ort_access_token")));
  const [mobileMenu, setMobileMenu] = useState(false);
  const [liveAlert, setLiveAlert] = useState<{ text: string; high: boolean } | null>(null);
  const location = useLocation();

  const loadUser = useCallback(async () => {
    if (!localStorage.getItem("ort_access_token")) {
      setChecking(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user ?? data);
    } catch {
      setUser(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { void loadUser(); }, [loadUser]);
  useEffect(() => {
    const reset = () => setUser(null);
    window.addEventListener("ort:unauthorized", reset);
    return () => window.removeEventListener("ort:unauthorized", reset);
  }, []);
  useEffect(() => {
    const showAlert = (event: Event) => {
      const detail = (event as CustomEvent<JsonRecord>).detail;
      const data = (detail.data ?? detail.waste ?? detail) as JsonRecord;
      const high = detail.threshold_exceeded === true || data.status === "high_waste";
      const weight = asNumber(data.weight_grams ?? (asNumber(data.amount_kg) * 1000));
      const text = high ? `High-waste alert · ${Math.round(weight)}g recorded` : `Low-waste reward · ${Math.round(weight)}g recorded`;
      setLiveAlert({ high, text });
      window.setTimeout(() => setLiveAlert((current) => current?.text === text ? null : current), 6000);
    };
    window.addEventListener("ort:live-event", showAlert);
    return () => window.removeEventListener("ort:live-event", showAlert);
  }, []);
  useEffect(() => setMobileMenu(false), [location.pathname]);

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch { /* Local credentials are always cleared. */ }
    localStorage.removeItem("ort_access_token");
    localStorage.removeItem("ort_refresh_token");
    setUser(null);
  };
  if (checking) return <div className="loading-screen"><SentinelLogo className="brand-mark" size={50} /><span>Loading your workspace…</span></div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <AuthPage mode="login" onAuth={loadUser} />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <AuthPage mode="register" onAuth={loadUser} />} />
      <Route path="/*" element={user ? (
        <div className="app-shell">
          <Sidebar user={user} logout={logout} open={mobileMenu} close={() => setMobileMenu(false)} />
          <main className="main-panel">
            <header className="topbar">
              <button className="icon-btn menu-toggle" aria-label="Toggle navigation" onClick={() => setMobileMenu((open) => !open)}>
                {mobileMenu ? <X size={20} /> : <Menu size={20} />}
              </button>
              <div className="breadcrumb"><SentinelLogo className="topbar-logo-mark" size={29} decorative /><span>Workspace</span><span className="crumb-slash">/</span><strong>{pageTitle(location.pathname)}</strong></div>
              <div className="topbar-actions"><div className="live-status"><span className="live-dot" /> Live data</div>
                <button className="icon-btn notification-btn" aria-label="Notifications"><Bell size={18} /><i /></button>
                <div className="top-avatar">{user.name?.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
              </div>
            </header>
            <div className="page-content">
              {liveAlert && <div className={`live-alert ${liveAlert.high ? "live-alert-high" : "live-alert-low"}`} role="status"><span>{liveAlert.high ? <Flame size={15} /> : <Leaf size={15} />}</span>{liveAlert.text}<button aria-label="Dismiss alert" onClick={() => setLiveAlert(null)}><X size={15} /></button></div>}
              <Routes>
                <Route index element={user.role === "student" ? <Navigate to="/student" replace /> : <Dashboard user={user} />} />
                <Route path="student" element={<StudentPortal user={user} />} />
                <Route path="live-feed" element={<LiveFeed />} />
                <Route path="predictions" element={<Predictions />} />
                <Route path="admin" element={user.role === "admin" ? <AdminSettings /> : <Navigate to="/" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </main>
        </div>
      ) : <Navigate to="/login" state={{ from: location }} replace />} />
    </Routes>
  );
}

function pageTitle(path: string) {
  if (path.includes("live-feed")) return "Live feed";
  if (path.includes("predictions")) return "Demand forecast";
  if (path.includes("admin")) return "Settings";
  if (path.includes("student")) return "My impact";
  return "Overview";
}

function Sidebar({ user, logout, open, close }: { user: User; logout: () => void; open: boolean; close: () => void }) {
  const isStudent = user.role === "student";
  const links = isStudent
    ? [{ to: "/student", label: "My impact", icon: LayoutDashboard }, { to: "/live-feed", label: "Live feed", icon: Activity }, { to: "/predictions", label: "Predictions", icon: ChefHat }]
    : [{ to: "/", label: "Overview", icon: LayoutDashboard }, { to: "/live-feed", label: "Live feed", icon: Activity }, { to: "/predictions", label: "Predictions", icon: ChefHat }, ...(user.role === "admin" ? [{ to: "/admin", label: "Settings", icon: Settings2 }] : [])];
  return <>
    {open && <button className="scrim" aria-label="Close navigation" onClick={close} />}
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <Link to="/" className="brand"><SentinelLogo className="brand-mark" size={39} decorative /><div><strong>ORT<span> SENTINEL</span></strong><small>AI · SUSTAINABLE CAMPUS</small></div></Link>
      <div className="campus-select"><div className="campus-symbol"><Utensils size={16} /></div><div><b>ORT Campus</b><small>Main Dining Hall</small></div><ChevronDown size={16} className="muted-icon" /></div>
      <p className="nav-label">MENU</p>
      <nav className="side-nav">{links.map(({ to, label, icon: Icon }) => <NavItem key={to} to={to} icon={<Icon size={18} />} label={label} />)}</nav>
      <div className="sidebar-spacer" />
      <div className="impact-card"><div className="impact-icon"><Sparkles size={17} /></div><div className="impact-stat">Every gram counts</div><p>Small choices today make a greener tomorrow.</p><div className="impact-bar"><span /></div></div>
      <div className="profile-block"><div className="profile-avatar">{user.name?.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div className="profile-name"><b>{user.name}</b><small>{user.role}</small></div><button className="icon-btn logout-btn" onClick={logout} title="Sign out"><LogOut size={17} /></button></div>
    </aside>
  </>;
}

function NavItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  const location = useLocation();
  const active = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
  return <Link to={to} className={`nav-item ${active ? "nav-active" : ""}`}>{icon}<span>{label}</span>{label === "Live feed" && <span className="nav-pulse" />}</Link>;
}

function AuthPage({ mode, onAuth }: { mode: "login" | "register"; onAuth: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isRegister = mode === "register";
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload: JsonRecord = {
      email: form.get("email"), password: form.get("password"),
      ...(isRegister ? { name: form.get("name") } : {}),
    };
    try {
      const { data } = await api.post(isRegister ? "/auth/register" : "/auth/login", payload);
      const access = data.access_token ?? data.token;
      if (!access) throw new Error("The server did not return an access token.");
      localStorage.setItem("ort_access_token", access);
      if (data.refresh_token) localStorage.setItem("ort_refresh_token", data.refresh_token);
      await onAuth();
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(from || "/", { replace: true });
    } catch (reason) { setError(reason instanceof Error && !("response" in reason) ? reason.message : getError(reason)); }
    finally { setLoading(false); }
  };
  return <div className="auth-page">
    <div className="auth-visual"><Link to="/" className="brand brand-light"><SentinelLogo className="brand-mark" size={39} decorative /><div><strong>ORT<span> SENTINEL</span></strong><small>AI · SUSTAINABLE CAMPUS</small></div></Link>
      <div className="visual-copy"><div className="eyebrow"><span className="eyebrow-dot" /> CAMPUS FOOD, REIMAGINED</div><h1>Make every<br /><em>meal matter.</em></h1><p>One smarter choice at a time, we’re building a campus with less waste and more impact.</p>
        <div className="visual-stats"><div><strong>Real-time</strong><span>waste insights</span></div><div><strong>Next-day</strong><span>demand forecasts</span></div></div>
      </div><div className="auth-quote"><span>“</span><p>The most sustainable meal is the one that gets eaten.</p><small>ORT SUSTAINABILITY INITIATIVE</small></div>
    </div>
    <div className="auth-form-side"><div className="auth-form-wrap"><div className="auth-mobile-brand"><SentinelLogo className="auth-mobile-logo-mark" size={31} decorative /><span>ORT SENTINEL</span></div>
      <div className="auth-heading"><div className="eyebrow dark-eyebrow">{isRegister ? "JOIN THE MOVEMENT" : "WELCOME BACK"}</div><h2>{isRegister ? "Create your account" : "Good to see you."}</h2><p>{isRegister ? "Start making a difference with every meal." : "Sign in to your sustainability workspace."}</p></div>
      <form className="auth-form" onSubmit={submit}>
        {isRegister && <label>Full name<input name="name" autoComplete="name" placeholder="Your name" required /></label>}
        <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@campus.edu" required /></label>
        <label>Password<input name="password" type="password" minLength={8} autoComplete={isRegister ? "new-password" : "current-password"} placeholder="••••••••" required /></label>
        {!isRegister && <div className="form-meta"><label className="checkbox-label"><input type="checkbox" /> Remember me</label><a href="#help">Need help?</a></div>}
        {error && <div className="error-banner" role="alert">{error}</div>}
        <button className="button button-dark auth-submit" disabled={loading}>{loading ? "Please wait…" : isRegister ? "Create account" : "Sign in"} <span>→</span></button>
      </form><div className="auth-switch">{isRegister ? "Already have an account?" : "New to ORT Sentinel?"} <Link to={isRegister ? "/login" : "/register"}>{isRegister ? "Sign in" : "Create account"}</Link></div>
      <div className="security-note"><ShieldCheck size={15} /> Your campus data is private and secure.</div>
    </div></div>
  </div>;
}

function Dashboard({ user }: { user: User }) {
  const [stats, setStats] = useState<JsonRecord | null>(null);
  const [charts, setCharts] = useState<JsonRecord | null>(null);
  const [events, setEvents] = useState<WasteEvent[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("7");
  const [endDate, setEndDate] = useState(() => toDateInput(new Date()));
  const [startDate, setStartDate] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    return toDateInput(start);
  });
  const [mealType, setMealType] = useState("");
  const [userId, setUserId] = useState("");
  const load = useCallback(async () => {
    try {
      const selectedDays = Math.max(1, Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1);
      const filters = {
        start_date: startDate,
        end_date: endDate,
        ...(mealType ? { meal_type: mealType } : {}),
        ...(userId ? { user_id: userId } : {}),
      };
      const [statsResult, chartsResult, eventsResult] = await Promise.all([
        api.get("/dashboard/stats", { params: filters }),
        api.get("/dashboard/charts", { params: { ...filters, days: selectedDays } }),
        api.get("/waste/", { params: {
          ...filters,
          start_date: `${startDate}T00:00:00Z`,
          end_date: `${endDate}T23:59:59Z`,
          limit: 6,
        } }),
      ]);
      setStats(statsResult.data);
      setCharts(chartsResult.data);
      setEvents(asArray<WasteEvent>(eventsResult.data.events ?? eventsResult.data));
      setError("");
    } catch (reason) { setError(getError(reason)); }
  }, [endDate, mealType, startDate, userId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void api.get("/users/")
      .then(({ data }) => setUsers(asArray<User>(data.users ?? data)))
      .catch((reason) => setError(getError(reason)));
  }, []);
  const websocketEvents = useLiveEvents(load);
  const trend = asArray<JsonRecord>(charts?.daily_trend ?? charts?.trend ?? charts?.daily);
  const byItem = asArray<JsonRecord>(charts?.item_waste ?? charts?.by_item ?? charts?.items ?? charts?.categories).map((item) => ({
    ...item, food_item: item.food_item ?? item.category ?? item.name, weight_kg: item.weight_kg ?? item.amount_kg,
  }));
  const byMeal = asArray<JsonRecord>(charts?.meal_distribution ?? charts?.by_meal ?? charts?.meals);
  const mealWasteTotal = byMeal.reduce((total, meal) => total + asNumber(meal.weight_kg ?? meal.amount_kg), 0);
  const waste = asNumber(stats?.filtered_waste_kg ?? stats?.range_waste_kg ?? stats?.today_waste_kg ?? stats?.total_waste_kg);
  const saved = asNumber(stats?.filtered_saved_kg ?? stats?.waste_saved_kg ?? stats?.saved_kg);
  const money = asNumber(stats?.money_saved ?? stats?.money_saved_inr ?? stats?.money_saved_today_inr);
  const co2 = asNumber(stats?.co2_saved_kg ?? stats?.co2_saved ?? stats?.estimated_co2_kg);
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).toUpperCase();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const rangeLabel = `${new Date(`${startDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} — ${new Date(`${endDate}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
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
    <section className="welcome-row"><div><div className="eyebrow dark-eyebrow">{todayLabel} <span className="status-pill">● CAMPUS ACTIVE</span></div><h1>{greeting}, {user.name?.split(" ")[0] || "there"} <span>✳</span></h1><p>Explore campus waste and savings for the selected period.</p></div>
      <div className="welcome-actions"><button className="button button-outline" onClick={() => void load()}><Activity size={16} /> Refresh data</button>{user.role === "admin" && <button className="button button-dark" onClick={() => void downloadCsv().catch((reason) => setError(getError(reason)))}><Download size={16} /> Export report</button>}</div>
    </section>
    <section className="panel dashboard-filters"><div className="filter-title"><Search size={17} /><b>Filter dashboard</b></div><div className="dashboard-filter-controls">
      <label>Range<select value={period} onChange={(event) => setQuickRange(event.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="custom">Custom</option></select></label>
      <label>From<input type="date" value={startDate} max={endDate} onChange={(event) => { setStartDate(event.target.value); setPeriod("custom"); }} /></label>
      <label>To<input type="date" value={endDate} min={startDate} max={toDateInput(new Date())} onChange={(event) => { setEndDate(event.target.value); setPeriod("custom"); }} /></label>
      <label>Meal<select value={mealType} onChange={(event) => setMealType(event.target.value)}><option value="">All meals</option><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option></select></label>
      <label>Campus member<select value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Everyone</option>{users.filter((person) => person.role === "student").map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
    </div></section>
    {error && <div className="inline-error" role="alert">{error} <button onClick={() => void load()}>Try again</button></div>}
    {websocketEvents > 0 && <div className="live-announcement"><span className="live-dot" /> Live updates connected · {websocketEvents} new event{websocketEvents === 1 ? "" : "s"} received</div>}
    <section className="metric-grid">
      <MetricCard label="WASTE IN RANGE" value={waste.toFixed(1)} unit="kg" change="vs previous period" changeValue={stats?.waste_change_percent} icon={<Utensils size={17} />} tone="orange" inverse />
      <MetricCard label="FOOD SAVED" value={saved.toFixed(1)} unit="kg" change="vs previous period" changeValue={stats?.saved_change_percent} icon={<Leaf size={17} />} tone="green" />
      <MetricCard label="MONEY SAVED" value={`₹${money.toLocaleString("en-IN")}`} unit="" change="across campus" icon={<span className="rupee-icon">₹</span>} tone="yellow" />
      <MetricCard label="CO₂ PREVENTED" value={co2.toFixed(1)} unit="kg" change="this month" icon={<Sparkles size={17} />} tone="blue" />
    </section>
    <section className="chart-grid">
      <article className="panel trend-panel"><div className="panel-heading"><div><h2>Waste &amp; savings trend</h2><p>Your campus impact over time</p></div><span className="date-range-label">{rangeLabel}</span></div>
        <div className="chart-legend"><span><i className="legend-dot waste-dot" /> Waste (kg)</span><span><i className="legend-dot saved-dot" /> Saved (kg)</span></div>
        <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}><defs><linearGradient id="wasteFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#e9a362" stopOpacity={0.22} /><stop offset="95%" stopColor="#e9a362" stopOpacity={0} /></linearGradient><linearGradient id="savedFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#378663" stopOpacity={0.18} /><stop offset="95%" stopColor="#378663" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#edf0eb" vertical={false} /><XAxis dataKey="date" tickFormatter={(value: string) => new Date(value).toLocaleDateString([], { weekday: "short" })} tickLine={false} axisLine={false} tick={{ fill: "#92988f", fontSize: 11 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: "#92988f", fontSize: 11 }} /><Tooltip /><Area type="monotone" dataKey="waste_kg" name="Waste" stroke="#dc9151" strokeWidth={2} fill="url(#wasteFill)" /><Area type="monotone" dataKey="saved_kg" name="Saved" stroke="#33815e" strokeWidth={2} fill="url(#savedFill)" /></AreaChart></ResponsiveContainer></div>
      </article>
      <article className="panel item-panel"><div className="panel-heading"><div><h2>What’s being wasted?</h2><p>By food item · selected period</p></div><button className="icon-btn" aria-label="More item options"><ChevronDown size={17} /></button></div>
        <div className="item-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={byItem} layout="vertical" margin={{ top: 4, right: 8, left: 3, bottom: 4 }}><CartesianGrid stroke="#edf0eb" horizontal={false} /><XAxis type="number" hide /><YAxis dataKey="food_item" type="category" width={55} tickLine={false} axisLine={false} tick={{ fill: "#727a70", fontSize: 11 }} /><Tooltip /><Bar dataKey="weight_kg" name="Waste (kg)" fill="#74a783" radius={[0, 5, 5, 0]} barSize={13} /></BarChart></ResponsiveContainer></div>
        <div className="item-footnote"><span><i className="legend-dot saved-dot" /> Most wasted</span><b>{byItem[0]?.food_item as string ?? "—"}</b></div>
      </article>
    </section>
    <section className="lower-grid">
      <article className="panel meal-panel"><div className="panel-heading"><div><h2>Waste by meal</h2><p>Distribution · selected period</p></div><Link className="text-link" to="/live-feed">View events <span>→</span></Link></div>
        <div className="meal-content"><div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={byMeal.map((meal) => ({ ...meal, weight_kg: meal.weight_kg ?? meal.amount_kg }))} dataKey="weight_kg" nameKey="meal_type" innerRadius={54} outerRadius={76} paddingAngle={4} stroke="none">{byMeal.map((_, index) => <Cell key={index} fill={["#377e5a", "#d8a34c", "#a8c887", "#e7d8ba"][index % 4]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{mealWasteTotal.toFixed(1)}</strong><span>kg total</span></div></div>
          <div className="meal-legend">{byMeal.map((meal, index) => <div key={String(meal.meal_type)}><span><i style={{ background: ["#377e5a", "#d8a34c", "#a8c887", "#e7d8ba"][index % 4] }} />{humanMeal(String(meal.meal_type ?? ""))}</span><b>{asNumber(meal.weight_kg ?? meal.amount_kg).toFixed(1)} kg</b></div>)}</div></div>
      </article>
      <article className="panel feed-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Latest disposal events</p></div><Link className="text-link" to="/live-feed">Live feed <span>→</span></Link></div>
        <EventList events={events.slice(0, 4)} />
      </article>
    </section>
    <section className="bottom-grid"><Leaderboard /><PredictionTeaser /></section>
  </div>;
}

function MetricCard({ label, value, unit, change, changeValue, icon, tone, inverse = false }: { label: string; value: string; unit: string; change: string; changeValue?: unknown; icon: ReactNode; tone: string; inverse?: boolean }) {
  const changeNumber = asNumber(changeValue);
  const favorable = inverse ? changeNumber < 0 : changeNumber > 0;
  const trendClass = changeValue === undefined ? "neutral-trend" : changeNumber === 0 ? "neutral-trend" : favorable ? "positive-trend" : "negative-trend";
  return <article className="metric-card"><div className="metric-top"><span className="metric-label">{label}</span><span className={`metric-icon ${tone}`}>{icon}</span></div><div className="metric-value">{value}<small>{unit}</small></div><div className="metric-foot"><span className={trendClass}>{changeValue === undefined ? <TrendingUp size={13} /> : changeNumber > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{changeValue === undefined ? change : `${Math.abs(changeNumber)}%`}</span>{changeValue !== undefined && <span className="metric-context">{change}</span>}</div></article>;
}

function EventList({ events }: { events: WasteEvent[] }) {
  if (!events.length) return <div className="empty-state"><Activity size={22} /><p>No waste events to show yet.</p><small>New disposal events will appear here in real time.</small></div>;
  return <div className="event-list">{events.map((event) => {
    const high = event.status === "high_waste";
    return <div className="event-row" key={event.id}><div className={`event-avatar ${high ? "event-high" : "event-low"}`}>{high ? <Flame size={15} /> : <Leaf size={15} />}</div><div className="event-detail"><b>{event.user_name ?? `Campus member ${event.user_id ?? ""}`}</b><span>{event.food_items?.map(itemLabel).join(", ") || "Food waste logged"} · {humanMeal(event.meal_type)}</span></div><div className="event-meta"><b className={high ? "waste-high-text" : "waste-low-text"}>{Math.round(event.weight_grams)}g</b><span>{dateLabel(event.timestamp)}</span></div></div>;
  })}</div>;
}

function Leaderboard() {
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => { void api.get("/dashboard/leaderboard").then(({ data }) => setUsers(asArray<User>(data.users ?? data))).catch(() => setUsers([])); }, []);
  return <article className="panel leaderboard-panel"><div className="panel-heading"><div><h2>Top savers</h2><p>Campus sustainability champions</p></div><span className="text-link">All time</span></div>
    {users.length ? <div className="leaderboard">{users.slice(0, 4).map((person, index) => <div className="leader-row" key={person.id}><span className={`rank rank-${index + 1}`}>{String(index + 1).padStart(2, "0")}</span><span className="leader-avatar">{person.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span className="leader-name"><b>{person.name}</b><small>{index === 0 ? "Zero waste hero" : "Campus saver"}</small></span><span className="leader-points"><Award size={14} /> {person.total_points} pts</span></div>)}</div> : <div className="empty-inline">Leaderboard data will appear once seeded.</div>}
  </article>;
}

function PredictionTeaser() {
  const [prediction, setPrediction] = useState<JsonRecord | null>(null);
  useEffect(() => { void api.get("/predict/", { params: { date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), meal_type: "lunch" } }).then(({ data }) => setPrediction(data)).catch(() => setPrediction(null)); }, []);
  const items = asArray<JsonRecord>(prediction?.items ?? prediction?.predictions);
  return <article className="prediction-card"><div className="prediction-card-head"><div className="prediction-icon"><ChefHat size={17} /></div><span className="forecast-tag"><span /> TOMORROW’S FORECAST</span><button className="icon-btn"><CircleHelp size={16} /></button></div><div className="prediction-title"><h2>Cook what campus needs.</h2><p>Demand forecast for tomorrow’s lunch</p></div>
    <div className="forecast-items">{items.slice(0, 3).map((item) => <div key={String(item.food_item ?? item.name)}><span>{String(item.food_item ?? item.name)}</span><b>{asNumber(item.recommended_quantity_kg ?? item.predicted_quantity_kg ?? item.quantity_kg).toFixed(1)} <small>kg</small></b></div>)}</div>
    <Link className="forecast-link" to="/predictions">See full forecast <span>→</span></Link>
  </article>;
}

function useLiveEvents(onEvent: () => void) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const apiBase = new URL(import.meta.env.VITE_API_URL ?? "/api", window.location.origin);
    const socketProtocol = apiBase.protocol === "https:" ? "wss:" : "ws:";
    const socketBase = `${socketProtocol}//${apiBase.host}${apiBase.pathname.replace(/\/+$/, "")}`;
    const token = localStorage.getItem("ort_access_token");
    const socket = new WebSocket(`${socketBase}/ws/live${token ? `?token=${encodeURIComponent(token)}` : ""}`);
    socket.onmessage = (message) => {
      setCount((current) => current + 1);
      try {
        window.dispatchEvent(new CustomEvent("ort:live-event", { detail: JSON.parse(message.data) }));
      } catch (error) {
        console.error("Could not read live waste event", error);
      }
      onEvent();
    };
    return () => socket.close();
  }, [onEvent]);
  return count;
}

function StudentPortal({ user }: { user: User }) {
  const [events, setEvents] = useState<WasteEvent[]>([]);
  const [stats, setStats] = useState<JsonRecord>({});
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const [eventResponse, statResponse] = await Promise.all([
        api.get("/waste/", { params: { user_id: user.id, limit: 30 } }),
        api.get("/dashboard/stats?scope=me"),
      ]);
      setEvents(asArray<WasteEvent>(eventResponse.data.events ?? eventResponse.data));
      setStats(statResponse.data);
      setError("");
    } catch (reason) {
      setError(getError(reason));
    }
  }, [user.id]);
  useEffect(() => { void load(); }, [load]);
  useLiveEvents(load);
  const score = asNumber(stats.waste_score ?? user.waste_score);
  const points = asNumber(stats.total_points ?? user.total_points);
  return <div className="page-stack"><section className="welcome-row"><div><div className="eyebrow dark-eyebrow">YOUR PERSONAL IMPACT</div><h1>Hey, {user.name?.split(" ")[0]} <span>✳</span></h1><p>Every thoughtful serving is a step towards a greener campus.</p></div><div className="student-rank"><Award size={19} /><span>Campus rank</span><b>#{asNumber(stats.rank) || "—"}</b></div></section>
    {error && <div className="inline-error">{error}</div>}
    <section className="student-hero"><div className="score-orb"><span>WASTE SCORE</span><strong>{score.toLocaleString()}</strong><small>starts at 1,000</small></div><div className="student-hero-copy"><div className="eyebrow">YOUR IMPACT, IN REAL TIME</div><h2>You’re making a difference.</h2><p>Your small choices add up. Keep choosing just what you need and help make every meal count.</p><div className="score-progress"><span style={{ width: `${Math.min(100, Math.max(0, score / 10))}%` }} /></div><small>{score} impact points · Low-waste choices add points</small></div><div className="student-sparkle"><Sparkles size={28} /></div></section>
    <section className="metric-grid student-metrics"><MetricCard label="TOTAL WASTE" value={(asNumber(stats.total_waste_kg) || events.reduce((total, event) => total + event.weight_grams, 0) / 1000).toFixed(2)} unit="kg" change="across all meals" icon={<Utensils size={17} />} tone="orange" /><MetricCard label="POINTS EARNED" value={points.toLocaleString()} unit="pts" change="keep it going" icon={<Award size={17} />} tone="green" /><MetricCard label="MEALS LOGGED" value={String(asNumber(stats.event_count) || events.length)} unit="" change="your contribution" icon={<Activity size={17} />} tone="blue" /><MetricCard label="CAMPUS RANK" value={`#${asNumber(stats.rank) || "—"}`} unit="" change="among all students" icon={<TrendingUp size={17} />} tone="yellow" /></section>
    <section className="lower-grid student-lower"><article className="panel"><div className="panel-heading"><div><h2>Your badges</h2><p>Milestones earned along the way</p></div></div><div className="badges-grid">{(user.badges ?? asArray<string>(stats.badges)).length ? (user.badges ?? asArray<string>(stats.badges)).map((badge, index) => <div className="badge-item" key={typeof badge === "string" ? badge : badge.name}><div className={`badge-medal medal-${index % 3}`}><Award size={21} /></div><b>{typeof badge === "string" ? badge : badge.name}</b><small>Earned · Keep it up</small></div>) : <div className="empty-state"><Award size={22} /><p>Your first badge is waiting.</p><small>Keep waste below 100g to earn one.</small></div>}</div></article><article className="panel"><div className="panel-heading"><div><h2>Your recent meals</h2><p>Your personal waste history</p></div><Link className="text-link" to="/live-feed">See all <span>→</span></Link></div><EventList events={events.slice(0, 4)} /></article></section>
  </div>;
}

function LiveFeed() {
  const [events, setEvents] = useState<WasteEvent[]>([]);
  const [meal, setMeal] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await api.get("/waste/", { params: { limit: 100, ...(meal ? { meal_type: meal } : {}), ...(status ? { status } : {}) } });
      setEvents(asArray<WasteEvent>(data.events ?? data));
      setError("");
    } catch (reason) { setError(getError(reason)); }
    finally { setBusy(false); }
  }, [meal, status]);
  useEffect(() => { void load(); }, [load]);
  useLiveEvents(load);
  return <div className="page-stack"><section className="welcome-row"><div><div className="eyebrow dark-eyebrow"><span className="live-dot" /> LIVE MONITORING</div><h1>Every gram, accounted for.</h1><p>Disposal activity across your campus, as it happens.</p></div><div className="live-status large-live"><span className="live-dot" /> Connected</div></section>
    <section className="panel filters-panel"><div className="filter-title"><Search size={17} /><b>Filter events</b></div><div className="filter-controls"><label>Meal<select value={meal} onChange={(event) => setMeal(event.target.value)}><option value="">All meals</option><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option></select></label><label>Alert type<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All events</option><option value="high_waste">High waste</option><option value="low_waste">Low waste</option></select></label><button className="button button-outline" onClick={() => void load()}><Activity size={15} /> Refresh</button></div></section>
    {error && <div className="inline-error">{error}</div>}
    <section className="panel full-feed-panel"><div className="panel-heading"><div><h2>Disposal events</h2><p>{events.length} events · latest first</p></div><span className="live-badge"><span /> Live</span></div>
      {busy ? <div className="loading-inline">Loading live events…</div> : events.length ? <div className="full-event-list">{events.map((event) => <div className="full-event-row" key={event.id}><div className={`event-avatar ${event.status === "high_waste" ? "event-high" : "event-low"}`}>{event.status === "high_waste" ? <Flame size={15} /> : <Leaf size={15} />}</div><div className="event-detail"><b>{event.user_name ?? `Campus member ${event.user_id ?? ""}`}</b><span>{event.food_items?.map(itemLabel).join(", ") || "Food waste logged"} · {humanMeal(event.meal_type)}</span></div><span className={`event-status ${event.status === "high_waste" ? "status-high" : "status-low"}`}>{event.status === "high_waste" ? "High waste" : "Rewarded"}</span><div className="event-meta"><b>{Math.round(event.weight_grams)}g</b><span>{new Date(event.timestamp).toLocaleString()}</span></div></div>)}</div> : <div className="empty-state"><Activity size={22} /><p>No events match those filters.</p></div>}
    </section></div>;
}

function Predictions() {
  const [date, setDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [meal, setMeal] = useState("lunch");
  const [data, setData] = useState<JsonRecord | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<JsonRecord[]>([]);
  const predict = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get("/predict/", { params: { date, meal_type: meal } });
      setData(response.data);
      setRows(asArray<JsonRecord>(response.data.items ?? response.data.predictions ?? response.data.recommendations));
      setError("");
    } catch (reason) { setError(getError(reason)); }
    finally { setLoading(false); }
  }, [date, meal]);
  useEffect(() => { void predict(); }, [predict]);
  const total = rows.reduce((sum, item) => sum + asNumber(item.recommended_quantity_kg ?? item.predicted_quantity_kg ?? item.quantity_kg), 0);
  return <div className="page-stack"><section className="welcome-row"><div><div className="eyebrow dark-eyebrow">SMARTER PREP, LESS WASTE</div><h1>Plan tomorrow, today. <span>✳</span></h1><p>Data-driven cooking recommendations that help every ingredient find its plate.</p></div><div className="forecast-confidence"><TrendingUp size={16} /><span>Forecast confidence</span><b>{data?.confidence != null ? `${Math.round(asNumber(data.confidence) * (asNumber(data.confidence) <= 1 ? 100 : 1))}%` : "—"}</b></div></section>
    <section className="forecast-controls panel"><div><div className="eyebrow dark-eyebrow">FORECAST PARAMETERS</div><h2>Build your meal plan</h2><p>Choose a date and meal to see recommended quantities.</p></div><div className="forecast-form"><label>Service date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Meal<select value={meal} onChange={(event) => setMeal(event.target.value)}><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option></select></label><button className="button button-dark" onClick={() => void predict()} disabled={loading}><Sparkles size={16} /> {loading ? "Calculating…" : "Update forecast"}</button></div></section>
    {error && <div className="inline-error">{error}</div>}
    <section className="forecast-summary-grid"><div className="forecast-summary dark-summary"><span className="summary-icon"><ChefHat size={19} /></span><small>TOTAL RECOMMENDED PREP</small><strong>{total.toFixed(1)} <i>kg</i></strong><span>{humanMeal(meal)} · {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</span></div><div className="forecast-summary"><span className="summary-icon muted-summary"><Users size={19} /></span><small>EXPECTED DINERS</small><strong>{asNumber(data?.expected_diners).toLocaleString() || "—"}</strong><span>Based on historical attendance</span></div><div className="forecast-summary"><span className="summary-icon muted-summary"><Leaf size={19} /></span><small>WASTE REDUCTION POTENTIAL</small><strong>{asNumber(data?.waste_reduction_percent) ? `${asNumber(data?.waste_reduction_percent)}%` : "—"}</strong><span>Compared to usual preparation</span></div></section>
    <section className="panel forecast-table-panel"><div className="panel-heading"><div><h2>Recommended cooking quantities</h2><p>Model combines historical demand and waste patterns</p></div><span className="model-chip"><Sparkles size={13} /> {String(data?.model ?? "Hybrid forecast")}</span></div>
      {rows.length ? <div className="table-scroll"><table><thead><tr><th>FOOD ITEM</th><th>RECOMMENDED</th><th>EXPECTED DEMAND</th><th>CONFIDENCE</th></tr></thead><tbody>{rows.map((row) => <tr key={String(row.food_item ?? row.name)}><td><span className="food-bullet" />{String(row.food_item ?? row.name)}</td><td><b>{asNumber(row.recommended_quantity_kg ?? row.predicted_quantity_kg ?? row.quantity_kg).toFixed(1)} kg</b></td><td>{asNumber(row.expected_demand_kg ?? row.demand_kg ?? row.predicted_quantity_kg).toFixed(1)} kg</td><td><span className="confidence-chip">{Math.round(asNumber(row.confidence ?? data?.confidence) * (asNumber(row.confidence ?? data?.confidence) <= 1 ? 100 : 1)) || 82}%</span></td></tr>)}</tbody></table></div> : <div className="empty-state"><ChefHat size={22} /><p>{loading ? "Calculating your forecast…" : "Forecast data will appear here."}</p><small>Seed historical data to power demand predictions.</small></div>}
    </section><div className="forecast-note"><CircleHelp size={15} /><span>Forecasts are estimates generated from past consumption patterns. Adjust for events or special menus as needed.</span></div>
  </div>;
}

function AdminSettings() {
  const [config, setConfig] = useState<JsonRecord>({});
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ waste_threshold_grams: "100", money_per_kg: "50", co2_per_kg: "2.5" });
  useEffect(() => {
    void Promise.all([api.get("/admin/config"), api.get("/users/")]).then(([configResponse, usersResponse]) => {
      const settings = configResponse.data.config ?? configResponse.data;
      setConfig(settings);
      setForm({
        waste_threshold_grams: String(settings.waste_threshold_grams ?? settings.threshold_grams ?? 100),
        money_per_kg: String(settings.money_per_kg ?? settings.money_saved_per_kg ?? 50),
        co2_per_kg: String(settings.co2_per_kg ?? settings.co2_saved_per_kg ?? 2.5),
      });
      setUsers(asArray<User>(usersResponse.data.users ?? usersResponse.data));
    }).catch((reason) => setError(getError(reason)));
  }, []);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = {
        waste_threshold_grams: Number(form.waste_threshold_grams),
        money_per_kg: Number(form.money_per_kg),
        co2_per_kg: Number(form.co2_per_kg),
      };
      const { data } = await api.put("/admin/config", payload);
      setConfig(data.config ?? data);
      setSuccess("Settings saved successfully.");
    } catch (reason) { setError(getError(reason)); }
    finally { setSaving(false); }
  };
  const updateRole = async (userId: User["id"], role: User["role"]) => {
    try {
      await api.patch(`/users/${userId}`, { role });
      setUsers((current) => current.map((person) => person.id === userId ? { ...person, role } : person));
      setSuccess("User role updated.");
    } catch (reason) { setError(getError(reason)); }
  };
  const sortedUsers = useMemo(() => [...users].sort((a, b) => a.name.localeCompare(b.name)), [users]);
  return <div className="page-stack"><section className="welcome-row"><div><div className="eyebrow dark-eyebrow">CAMPUS CONTROL CENTER</div><h1>Settings &amp; users. <span>✳</span></h1><p>Configure how ORT Sentinel works for your campus.</p></div><button className="button button-outline" onClick={() => void downloadCsv().catch((reason) => setError(getError(reason)))}><Download size={16} /> Export CSV</button></section>
    {error && <div className="inline-error" role="alert">{error}</div>}{success && <div className="success-banner">{success}</div>}
    <section className="admin-grid"><article className="panel config-panel"><div className="panel-heading"><div><h2>Waste &amp; impact settings</h2><p>Customize your campus sustainability calculations.</p></div><div className="settings-badge"><Settings2 size={17} /></div></div>
      <form className="settings-form" onSubmit={save}><label>High-waste alert threshold<span>Waste above this amount triggers an alert.</span><div className="input-suffix"><input type="number" min="1" value={form.waste_threshold_grams} onChange={(event) => setForm({ ...form, waste_threshold_grams: event.target.value })} required /><em>grams</em></div></label>
        <label>Money saved per kilogram<span>Estimated food cost savings per kg prevented.</span><div className="input-suffix"><em>₹</em><input type="number" min="0" step="0.01" value={form.money_per_kg} onChange={(event) => setForm({ ...form, money_per_kg: event.target.value })} required /></div></label>
        <label>CO₂ saved per kilogram<span>Estimated emissions avoided per kg of food saved.</span><div className="input-suffix"><input type="number" min="0" step="0.01" value={form.co2_per_kg} onChange={(event) => setForm({ ...form, co2_per_kg: event.target.value })} required /><em>kg CO₂</em></div></label>
        <div className="settings-actions"><span>{Object.keys(config).length ? "Changes apply to new events." : "Default values shown."}</span><button className="button button-dark" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></div>
      </form></article>
      <article className="panel hardware-panel"><div className="panel-heading"><div><h2>Connected systems</h2><p>Hardware &amp; integrations</p></div></div><div className="system-row"><div className="system-icon"><Activity size={17} /></div><div><b>Waste logging API</b><small>Ready to receive smart bin events</small></div><span className="system-status">Ready</span></div><div className="system-row"><div className="system-icon"><ShieldCheck size={17} /></div><div><b>RFID user mapping</b><small>ESP32-compatible event endpoint</small></div><span className="system-status">Ready</span></div><div className="integration-note"><Clock3 size={15} /> MQTT topic support can be enabled with your broker settings.</div></article>
    </section>
    <section className="panel users-panel"><div className="panel-heading"><div><h2>Campus users</h2><p>Manage roles and campus access · {users.length} accounts</p></div><span className="user-count"><Users size={15} /> {users.length} users</span></div>
      {sortedUsers.length ? <div className="table-scroll"><table><thead><tr><th>USER</th><th>EMAIL</th><th>WASTE SCORE</th><th>POINTS</th><th>ROLE</th></tr></thead><tbody>{sortedUsers.map((person) => <tr key={person.id}><td><span className="user-cell"><span className="leader-avatar">{person.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>{person.name}</span></td><td>{person.email}</td><td>{asNumber(person.waste_score).toLocaleString()}</td><td>{asNumber(person.total_points).toLocaleString()}</td><td><select className="role-select" value={person.role} onChange={(event) => void updateRole(person.id, event.target.value as User["role"])}><option value="student">Student</option><option value="manager">Manager</option><option value="admin">Admin</option></select></td></tr>)}</tbody></table></div> : <div className="empty-state"><Users size={22} /><p>No users available.</p></div>}
    </section>
  </div>;
}

export default App;
