import { signInAction } from "@/app/actions/auth";

export default function LoginPage() {
  async function action(formData: FormData) {
    "use server";
    await signInAction(formData);
  }

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
        <p className="muted">Sin Supabase configurado, cualquier email y clave abren el modo demo local.</p>

        <form action={action} className="form-stack">
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <label>
            Clave
            <input name="password" type="password" required />
          </label>
          <button className="primary-button" type="submit">Entrar</button>
        </form>
      </section>
    </main>
  );
}
