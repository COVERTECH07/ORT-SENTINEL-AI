import { useCallback, useEffect, useState } from "react";
import { Download, Users } from "lucide-react";
import api, { getError, User } from "../api";
import { asNumber, asArray, downloadCsv } from "./utils";

type JsonRecord = Record<string, unknown>;

export function AdminSettings() {
  const [settings, setSettings] = useState({ threshold_grams: 100, money_per_kg: 50, co2_per_kg: 2.5 });
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const load = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([api.get("/admin/settings"), api.get("/users/")]);
      if (s.data) setSettings({
        threshold_grams: asNumber(s.data.threshold_grams ?? s.data.high_waste_threshold_grams ?? 100),
        money_per_kg: asNumber(s.data.money_per_kg ?? s.data.money_saved_per_kg ?? 50),
        co2_per_kg: asNumber(s.data.co2_per_kg ?? s.data.co2_saved_per_kg ?? 2.5),
      });
      setUsers(asArray<User>(u.data.users ?? u.data));
      setError("");
    } catch (reason) { setError(getError(reason)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const save = async () => {
    try {
      await api.put("/admin/settings", settings);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (reason) { setError(getError(reason)); }
  };
  const updateRole = async (id: number | string, role: User["role"]) => {
    try {
      await api.patch(`/users/${id}`, { role });
      setUsers((list) => list.map((p) => p.id === id ? { ...p, role } : p));
    } catch (reason) { setError(getError(reason)); }
  };
  return <div className="page-stack">
    <section className="welcome-row"><div><div className="eyebrow dark-eyebrow">CAMPUS CONTROL CENTER</div><h1>Settings & users.</h1><p>Configure how ORT Sentinel works for your campus.</p></div>
      <button className="button button-outline" onClick={() => void downloadCsv()}><Download size={15} /> Export CSV</button></section>
    {error && <div className="inline-error" role="alert">{error}</div>}
    <section className="admin-grid">
      <article className="panel">
        <div className="panel-heading"><div><h2>Waste & impact settings</h2><p>Customize your campus sustainability calculations.</p></div></div>
        <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 10, fontWeight: 600, color: "#546153" }}>High-waste alert threshold
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="number" value={settings.threshold_grams} onChange={(e) => setSettings((s) => ({ ...s, threshold_grams: Number(e.target.value) }))} style={{ flex: 1, height: 36, border: "1px solid #e1e7df", borderRadius: 7, padding: "0 12px" }} /><span style={{ fontSize: 11, color: "#8a9585" }}>grams</span></div></label>
          <label style={{ display: "grid", gap: 6, fontSize: 10, fontWeight: 600, color: "#546153" }}>Money saved per kilogram
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span>₹</span><input type="number" value={settings.money_per_kg} onChange={(e) => setSettings((s) => ({ ...s, money_per_kg: Number(e.target.value) }))} style={{ flex: 1, height: 36, border: "1px solid #e1e7df", borderRadius: 7, padding: "0 12px" }} /></div></label>
          <label style={{ display: "grid", gap: 6, fontSize: 10, fontWeight: 600, color: "#546153" }}>CO₂ saved per kilogram
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="number" step="0.1" value={settings.co2_per_kg} onChange={(e) => setSettings((s) => ({ ...s, co2_per_kg: Number(e.target.value) }))} style={{ flex: 1, height: 36, border: "1px solid #e1e7df", borderRadius: 7, padding: "0 12px" }} /><span style={{ fontSize: 11, color: "#8a9585" }}>kg CO₂</span></div></label>
          <button className="button button-dark" onClick={() => void save()}>{saved ? "Saved ✓" : "Save changes"}</button>
        </div>
      </article>
      <article className="panel">
        <div className="panel-heading"><div><h2>Connected systems</h2><p>Hardware & integrations</p></div></div>
        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f0f2ed" }}><div><b style={{ fontSize: 12 }}>Waste logging API</b><div style={{ fontSize: 10, color: "#8a9585" }}>Ready to receive smart bin events</div></div><span style={{ fontSize: 10, color: "#4b9661", fontWeight: 600 }}>Ready</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f0f2ed" }}><div><b style={{ fontSize: 12 }}>RFID user mapping</b><div style={{ fontSize: 10, color: "#8a9585" }}>ESP32-compatible event endpoint</div></div><span style={{ fontSize: 10, color: "#4b9661", fontWeight: 600 }}>Ready</span></div>
          <div style={{ fontSize: 10, color: "#8a9585", padding: "8px 0" }}>MQTT topic support can be enabled with your broker settings.</div>
        </div>
      </article>
    </section>
    <section className="panel">
      <div className="panel-heading"><div><h2>Campus users</h2><p>Manage roles and campus access · {users.length} accounts</p></div></div>
      {users.length ? <div style={{ overflowX: "auto" }}><table className="users-table"><thead><tr><th>USER</th><th>EMAIL</th><th>WASTE SCORE</th><th>POINTS</th><th>ROLE</th></tr></thead>
        <tbody>{users.map((person) => <tr key={person.id}><td>{person.name}</td><td>{person.email}</td><td>{asNumber(person.waste_score).toLocaleString()}</td><td>{asNumber(person.total_points).toLocaleString()}</td>
          <td><select className="role-select" value={person.role} onChange={(e) => void updateRole(person.id, e.target.value as User["role"])}><option value="student">Student</option><option value="manager">Manager</option><option value="admin">Admin</option></select></td></tr>)}</tbody></table></div>
        : <div className="empty-state"><Users size={22} /><p>No users available.</p></div>}
    </section>
  </div>;
}
