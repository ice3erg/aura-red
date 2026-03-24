import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../features/auth/store";

export default function SignupPage() {
  const navigate = useNavigate();
  const signup = useAuthStore((s) => s.signup);
  const error = useAuthStore((s) => s.error);
  const isLoading = useAuthStore((s) => s.isLoading);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await signup(email, password);
    if (ok) navigate("/home");
  }

  return (
    <div style={{ maxWidth: 420, margin: "60px auto", padding: 24 }}>
      <h1>Регистрация</h1>
      <form onSubmit={handleSubmit}>
        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", marginBottom: 12, padding: 12 }}
        />
        <input
          placeholder="Пароль"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", marginBottom: 12, padding: 12 }}
        />
        <button
          type="submit"
          disabled={isLoading}
          style={{ width: "100%", padding: 12 }}
        >
          {isLoading ? "Создаём..." : "Создать аккаунт"}
        </button>
      </form>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <p>
        Уже есть аккаунт? <Link to="/login">Вход</Link>
      </p>
    </div>
  );
}
