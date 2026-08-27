import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-row">
          <span className="brand-icon">+</span>
          <div>
            <strong>FarmaGest</strong>
            <p className="muted">Acceso seguro</p>
          </div>
        </div>

        <h1>Iniciar sesion</h1>
        <p className="muted">Ingresa con una cuenta registrada en Supabase.</p>

        <LoginForm />
      </section>
    </main>
  );
}
