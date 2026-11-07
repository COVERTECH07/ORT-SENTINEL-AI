import { ReactNode, useCallback, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  Activity, Bell, ChefHat, ChevronDown, Flame, LayoutDashboard, Leaf, LogOut, Menu, Moon,
  ScanSearch, Settings2, Sparkles, Sun, Utensils, X,
} from "lucide-react";
import api, { User } from "./api";
import SentinelLogo from "./components/SentinelLogo";
import { AuthPage } from "./pages/AuthPage";
import { Dashboard } from "./pages/Dashboard";
import { StudentPortal } from "./pages/StudentPortal";
import { LiveFeed } from "./pages/LiveFeed";
import { Predictions } from "./pages/Predictions";
import { AdminSettings } from "./pages/AdminSettings";
import { FoodDetect } from "./pages/FoodDetect";

type JsonRecord = Record<string, unknown>;
const asNumber = (value: unknown) => Number(value ?? 0);

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(Boolean(localStorage.getItem("ort_access_token")));
  const [mobileMenu, setMobileMenu] = useState(false);
  const [liveAlert, setLiveAlert] = useState<{ text: string; high: boolean } | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<{ id: number; text: string; high: boolean; time: string }[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("ort_theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
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
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("ort_theme", theme);
  }, [theme]);
  useEffect(() => {
    const showAlert = (event: Event) => {
      const detail = (event as CustomEvent<JsonRecord>).detail;
      const data = (detail.data ?? detail.waste ?? detail) as JsonRecord;
      const high = detail.threshold_exceeded === true || data.status === "high_waste";
      const weight = asNumber(data.weight_grams ?? (asNumber(data.amount_kg) * 1000));
      const text = high ? `High-waste alert · ${Math.round(weight)}g recorded` : `Low-waste reward · ${Math.round(weight)}g recorded`;
      setLiveAlert({ high, text });
      setNotifications((prev) => [{ id: Date.now(), text, high, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...prev].slice(0, 12));
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
              <div className="topbar-actions">
                <div className="live-status"><span className="live-dot" /> Live data</div>
                <button className="icon-btn" aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setTheme((t) => t === "dark" ? "light" : "dark")} title={theme === "dark" ? "Light mode" : "Dark mode"}>
                  {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                </button>
                <div className="notification-wrap">
                  <button className="icon-btn notification-btn" aria-label="Notifications" aria-expanded={showNotifications} onClick={() => setShowNotifications((v) => !v)}>
                    <Bell size={18} />{notifications.length > 0 && <i />}
                  </button>
                  {showNotifications && (
                    <div className="notification-panel" role="menu">
                      <div className="notification-panel-head"><b>Notifications</b><button className="text-link" onClick={() => { setNotifications([]); setShowNotifications(false); }}>Clear</button></div>
                      {notifications.length === 0 ? (
                        <div className="notification-empty"><Bell size={16} /><span>No new alerts yet. Live waste events will appear here.</span></div>
                      ) : notifications.map((n) => (
                        <div key={n.id} className={`notification-item ${n.high ? "notification-high" : "notification-low"}`}>
                          <span>{n.high ? <Flame size={14} /> : <Leaf size={14} />}</span>
                          <div><b>{n.text}</b><small>{n.time}</small></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
                <Route path="detect" element={<FoodDetect />} />
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
  if (path.includes("detect")) return "Food detect";
  if (path.includes("admin")) return "Settings";
  if (path.includes("student")) return "My impact";
  return "Overview";
}

function CampusSwitcher() {
  const [open, setOpen] = useState(false);
  return (
    <div className={`campus-select ${open ? "campus-open" : ""}`} onClick={() => setOpen((v) => !v)}>
      <div className="campus-symbol"><Utensils size={16} /></div>
      <div><b>ORT Campus</b><small>Main Dining Hall</small></div>
      <ChevronDown size={16} className="muted-icon" />
      {open && (
        <div className="campus-dropdown" onClick={(e) => e.stopPropagation()}>
          <div className="campus-option active"><Utensils size={14} /><div><b>ORT Campus</b><small>Main Dining Hall · Active</small></div></div>
          <div className="campus-option disabled"><Utensils size={14} /><div><b>North Wing Mess</b><small>Phase 3 · Multi-bin</small></div></div>
          <p className="campus-note">Single-campus mode for Phase 1–2. Multi-campus comes in Phase 3.</p>
        </div>
      )}
    </div>
  );
}

function Sidebar({ user, logout, open, close }: { user: User; logout: () => void; open: boolean; close: () => void }) {
  const isStudent = user.role === "student";
  const links = isStudent
    ? [
        { to: "/student", label: "My impact", icon: LayoutDashboard },
        { to: "/live-feed", label: "Live feed", icon: Activity },
        { to: "/detect", label: "Food detect", icon: ScanSearch },
        { to: "/predictions", label: "Predictions", icon: ChefHat },
      ]
    : [
        { to: "/", label: "Overview", icon: LayoutDashboard },
        { to: "/live-feed", label: "Live feed", icon: Activity },
        { to: "/detect", label: "Food detect", icon: ScanSearch },
        { to: "/predictions", label: "Predictions", icon: ChefHat },
        ...(user.role === "admin" ? [{ to: "/admin", label: "Settings", icon: Settings2 }] : []),
      ];
  return <>
    {open && <button className="scrim" aria-label="Close navigation" onClick={close} />}
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <Link to="/" className="brand"><SentinelLogo className="brand-mark" size={39} decorative /><div><strong>ORT<span> SENTINEL</span></strong><small>AI · SUSTAINABLE CAMPUS</small></div></Link>
      <CampusSwitcher />
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

export default App;
