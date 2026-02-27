import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, signup } from "../services/auth";

export default function LoginSignup() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (mode === "signup") await signup(form);
      else await login({ email: form.email, password: form.password });
      navigate("/");
    } catch (e) {
      setError(e.response?.data?.message || "Unable to authenticate.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page auth-page">
      <section className="panel auth-panel">
        <h1>Talesync</h1>
        <p className="muted">Every Voice Matters</p>
        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label>
              Name
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
          )}
          <label>
            Email
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label>
            Password
            <input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn-primary" disabled={loading}>
            {loading ? "Please wait..." : mode === "signup" ? "Create Account" : "Login"}
          </button>
        </form>
        <button className="link-button" onClick={() => setMode(mode === "signup" ? "login" : "signup")}> 
          {mode === "signup" ? "Already have an account? Login" : "Need an account? Sign up"}
        </button>
      </section>
    </main>
  );
}
