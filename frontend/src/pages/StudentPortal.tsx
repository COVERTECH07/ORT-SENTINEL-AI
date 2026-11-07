import { useEffect, useState } from "react";
import { Award, Leaf, Sparkles, TrendingUp } from "lucide-react";
import api, { getError, User } from "../api";
import { asNumber, asArray } from "./utils";

type JsonRecord = Record<string, unknown>;

export function StudentPortal({ user }: { user: User }) {
  const [stats, setStats] = useState<JsonRecord | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void api.get("/dashboard/student-stats").then(({ data }) => setStats(data)).catch((r) => setError(getError(r)));
  }, []);
  const score = asNumber(stats?.waste_score ?? user.waste_score ?? 1000);
  const points = asNumber(stats?.total_points ?? user.total_points);
  const saved = asNumber(stats?.saved_kg);
  const rank = asNumber(stats?.rank ?? 1);
  return <div className="page-stack">
    <section className="student-hero">
      <div className="score-orb"><span>WASTE SCORE</span><strong>{Math.round(score)}</strong><small>pts</small></div>
      <div className="student-hero-copy">
        <div className="eyebrow">YOUR IMPACT</div>
        <h2>Keep going, {user.name?.split(" ")[0]}.</h2>
        <p>Every low-waste meal moves the campus closer to zero food waste. Your score updates with each scan.</p>
        <div className="score-progress"><span style={{ width: `${Math.min(100, Math.max(8, score / 12))}%` }} /></div>
        <small>{Math.round(score)} / 1200 target</small>
      </div>
      <Sparkles className="student-sparkle" size={42} />
    </section>
    {error && <div className="inline-error" role="alert">{error}</div>}
    <section className="metric-grid student-metrics">
      <article className="metric-card"><div className="metric-top"><span className="metric-label">POINTS</span><div className="metric-icon green"><Award size={17} /></div></div><div className="metric-value">{points}</div></article>
      <article className="metric-card"><div className="metric-top"><span className="metric-label">FOOD SAVED</span><div className="metric-icon green"><Leaf size={17} /></div></div><div className="metric-value">{saved.toFixed(1)}<small>kg</small></div></article>
      <article className="metric-card"><div className="metric-top"><span className="metric-label">CAMPUS RANK</span><div className="metric-icon yellow"><TrendingUp size={17} /></div></div><div className="metric-value">#{rank}</div></article>
      <article className="metric-card"><div className="metric-top"><span className="metric-label">STREAK</span><div className="metric-icon blue"><Sparkles size={17} /></div></div><div className="metric-value">{asNumber(stats?.streak_days)}<small>days</small></div></article>
    </section>
    <section className="panel"><div className="panel-heading"><div><h2>Badges</h2><p>Earn rewards for consistent low waste</p></div></div>
      <div className="badges-grid">
        <div className="badge-item"><div className="badge-medal medal-1"><Award size={20} /></div><b>Zero Hero</b><small>5 low-waste meals</small></div>
        <div className="badge-item"><div className="badge-medal medal-2"><Leaf size={20} /></div><b>Green Streak</b><small>7-day streak</small></div>
        <div className="badge-item"><div className="badge-medal"><Sparkles size={20} /></div><b>Campus Saver</b><small>Top 10 rank</small></div>
      </div>
    </section>
  </div>;
}
