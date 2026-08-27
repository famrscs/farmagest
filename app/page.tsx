import Link from "next/link";

const features = [
  {
    title: "Control de stock",
    text: "Inventario por lotes, costo, precio de venta, margen y reposicion sugerida para cada medicamento.",
  },
  {
    title: "Redondeo y caja",
    text: "Ventas en efectivo o QR, arqueo diario y diferencia de caja para cerrar turnos con trazabilidad.",
  },
  {
    title: "Alertas de vencimiento",
    text: "Seguimiento de lotes, mermas y productos por vencer para reducir perdidas y compras tardias.",
  },
];

export default function LandingPage() {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <Link className="landing-brand" href="/">
          <span className="brand-icon">+</span>
          <strong>FarmaGest</strong>
        </Link>
        <nav className="landing-links" aria-label="Navegacion publica">
          <a href="#funciones">Funciones</a>
          <a href="#operacion">Operacion</a>
          <Link className="secondary-button" href="/login">Iniciar Sesion</Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <span className="landing-kicker">SaaS para farmacias</span>
          <h1>Gestiona inventario, caja y vencimientos desde un solo panel.</h1>
          <p>
            FarmaGest ayuda a farmacias pequenas y medianas a controlar stock por lotes,
            registrar ventas, revisar caja diaria y detectar alertas antes de perder dinero.
          </p>
          <div className="landing-actions">
            <Link className="primary-button landing-button" href="/login">Iniciar Sesion</Link>
            <Link className="secondary-button landing-button" href="/login">Registrarse / Solicitar Acceso</Link>
          </div>
        </div>

        <div className="landing-product" aria-label="Vista previa del panel FarmaGest">
          <div className="product-topbar">
            <strong>Panel operativo</strong>
            <span>Hoy</span>
          </div>
          <div className="product-metrics">
            <article><span>Stock critico</span><strong>12</strong></article>
            <article><span>Ventas</span><strong>Bs 2.840</strong></article>
            <article><span>Vencen pronto</span><strong>7</strong></article>
          </div>
          <div className="product-table">
            <div><span>MED-104</span><strong>Paracetamol 500 mg</strong><em>Reposicion</em></div>
            <div><span>MED-221</span><strong>Ibuprofeno 400 mg</strong><em>Vence pronto</em></div>
            <div><span>Caja</span><strong>Cierre del dia</strong><em>Sin diferencia</em></div>
          </div>
        </div>
      </section>

      <section className="landing-section" id="funciones">
        <div className="section-heading">
          <span className="landing-kicker">Funciones clave</span>
          <h2>Diseñado para operar la farmacia todos los dias.</h2>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-band" id="operacion">
        <div>
          <h2>Acceso por cuentas para cada farmacia.</h2>
          <p>
            El administrador SaaS crea usuarios y asigna permisos. Las farmacias entran a su dashboard privado para operar inventario, caja y ventas.
          </p>
        </div>
        <Link className="primary-button landing-button" href="/login">Entrar al sistema</Link>
      </section>
    </main>
  );
}
