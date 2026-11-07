import { FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import api, { getError } from "../api";
import SentinelLogo from "../components/SentinelLogo";

type JsonRecord = Record<string, unknown>;

export function AuthPage({ mode, onAuth }: { mode: "login" | "register"; onAuth: () => Promise<void> }) {
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
