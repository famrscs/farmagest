import { redirect } from "next/navigation";
import Link from "next/link";
import { registrarUsuarioAction, signOutAction } from "@/app/actions/auth";
import { isSaasOwnerEmail } from "@/lib/auth/saas-owner";
import { getSupabaseSecretKey, hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type ProfileRow = {
  id: string;
  nombre_completo: string;
  rol: "ADMIN" | "CAJERO";
  activo: boolean;
  fecha_creacion: string;
};

function hasAdminEnv() {
  return Boolean(getSupabaseSecretKey());
}

export default async function AdminPage() {
  if (!hasSupabaseEnv()) {
    redirect("/login");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!isSaasOwnerEmail(user.email)) {
    redirect("/dashboard");
  }

  const { data: profilesData } = await supabase
    .from("perfiles")
    .select("id, nombre_completo, rol, activo, fecha_creacion")
    .order("fecha_creacion", { ascending: false });

  const profiles = (profilesData ?? []) as ProfileRow[];
  const adminReady = hasAdminEnv();

  return (
    <main className="dashboard-page">
      <section className="admin-shell">
        <header className="dashboard-header admin-header">
          <div className="brand-row">
            <span className="brand-icon">+</span>
            <div>
              <strong>FarmaGest Admin</strong>
              <p className="muted">Consola privada del dueno del SaaS</p>
            </div>
          </div>
          <div className="header-actions">
            <Link className="secondary-button" href="/">Landing</Link>
            <form action={signOutAction}>
              <button className="secondary-button" type="submit">Cerrar sesion</button>
            </form>
          </div>
        </header>

        {!adminReady ? (
          <div className="demo-banner admin-warning">
            Falta SUPABASE_SERVICE_ROLE_KEY en el servidor. Agrega esa variable para crear cuentas reales desde este panel.
          </div>
        ) : null}

        <div className="admin-grid">
          <form className="form-stack admin-form" action={adminReady ? registrarUsuarioAction : undefined}>
            <div>
              <h1>Crear cuenta de farmacia</h1>
              <p className="muted">Crea cuentas para las farmacias clientes y sus operadores.</p>
            </div>
            <label>Nombre completo<input name="nombreCompleto" placeholder="Maria Perez" disabled={!adminReady} required /></label>
            <label>Email<input name="email" type="email" placeholder="usuario@farmacia.com" disabled={!adminReady} required /></label>
            <div className="form-row">
              <label>Clave temporal<input name="password" type="password" minLength={8} disabled={!adminReady} required /></label>
              <label>Rol
                <select name="rol" disabled={!adminReady} required>
                  <option value="CAJERO">Cajero</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </label>
            </div>
            <button className="primary-button" type="submit" disabled={!adminReady}>Crear cuenta</button>
          </form>

          <div className="table-wrap admin-users-table">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Alta</th>
                </tr>
              </thead>
              <tbody>
                {profiles.length ? profiles.map((profile) => (
                  <tr key={profile.id}>
                    <td><strong>{profile.nombre_completo}</strong></td>
                    <td>{profile.rol === "ADMIN" ? "Administrador" : "Cajero"}</td>
                    <td><span className={profile.activo ? "status ok" : "status danger"}>{profile.activo ? "Activo" : "Inactivo"}</span></td>
                    <td>{new Intl.DateTimeFormat("es-BO", { timeZone: "America/La_Paz", day: "2-digit", month: "short", year: "numeric" }).format(new Date(profile.fecha_creacion))}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4}>No hay usuarios para mostrar.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
