import { actualizarUmbralAction, marcarAuditoriaRevisadaAction, registrarMermaAction } from "@/app/actions/audit";
import { registrarUsuarioAction, signOutAction } from "@/app/actions/auth";
import { registrarProductoAction } from "@/app/actions/inventory";
import { SalesRegister } from "@/app/components/SalesRegister";
import { DailyCashBox } from "@/app/components/DailyCashBox";
import { getSupabaseSecretKey, hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

type ProductRow = {
  id: string;
  codigo_interno: string;
  nombre_comercial: string;
  principio_activo: string | null;
  presentacion: string | null;
  unidad_medida: "UNIDAD" | "ENVASE";
  cantidad_por_envase: number;
  costo_unitario: number | string;
  precio_venta: number | string;
  stock_minimo: number;
  laboratorios: { nombre: string }[] | { nombre: string } | null;
  lotes: {
    id: string;
    numero_lote: string;
    fecha_vencimiento: string;
    cantidad_disponible: number;
    costo_compra: number | string;
    proveedor: string | null;
  }[];
};

type ProfileRow = {
  id: string;
  nombre_completo: string;
  rol: "ADMIN" | "CAJERO";
  activo: boolean;
  fecha_creacion: string;
};

type AuditRow = {
  id: string;
  usuario_id: string;
  accion: string;
  descripcion: string;
  data: Record<string, unknown> | null;
  severidad: "BAJA" | "MEDIA" | "ALTA" | "CRITICA";
  fecha: string;
  revisada: boolean;
  perfiles: { nombre_completo: string; rol: "ADMIN" | "CAJERO" }[] | { nombre_completo: string; rol: "ADMIN" | "CAJERO" } | null;
};

type MermaRow = {
  id: string;
  fecha_conteo: string;
  stock_teorico: number;
  stock_fisico: number;
  diferencia: number;
  porcentaje_diferencia: number | string;
  supera_umbral: boolean;
  revisada: boolean;
  observaciones: string | null;
  productos: { nombre_comercial: string; codigo_interno: string }[] | { nombre_comercial: string; codigo_interno: string } | null;
};

type AlertConfigRow = {
  id: string;
  clave: string;
  valor: number;
  descripcion: string | null;
};

type SaleRow = {
  id: string;
  fecha: string;
  total: number | string;
  forma_pago: string;
  estado: "CERRADA" | "ANULADA";
  numero_ticket: number;
  detalle_ventas: {
    cantidad: number;
    precio_unitario: number | string;
    costo_unitario: number | string;
    subtotal: number | string;
    productos: {
      nombre_comercial: string;
      presentacion: string | null;
    }[] | { nombre_comercial: string; presentacion: string | null } | null;
  }[];
};

const demoProducts: ProductRow[] = [
  {
    id: "demo-1",
    codigo_interno: "MED-0001",
    nombre_comercial: "Tapsin 500 mg",
    principio_activo: "Paracetamol",
    presentacion: "Caja x 20 tabletas",
    unidad_medida: "ENVASE",
    cantidad_por_envase: 20,
    costo_unitario: 18,
    precio_venta: 28,
    stock_minimo: 240,
    laboratorios: { nombre: "Laboratorio Chile" },
    lotes: [{ id: "lote-1", numero_lote: "TAP-2401", fecha_vencimiento: "2027-03-20", cantidad_disponible: 160, costo_compra: 18, proveedor: "Distribuidora Central" }],
  },
  {
    id: "demo-2",
    codigo_interno: "MED-0002",
    nombre_comercial: "Panadol Forte",
    principio_activo: "Paracetamol",
    presentacion: "Blister x 10 comprimidos",
    unidad_medida: "ENVASE",
    cantidad_por_envase: 10,
    costo_unitario: 11,
    precio_venta: 18,
    stock_minimo: 100,
    laboratorios: { nombre: "GSK" },
    lotes: [{ id: "lote-2", numero_lote: "PAN-118", fecha_vencimiento: "2027-01-15", cantidad_disponible: 240, costo_compra: 11, proveedor: "Mayorista Salud" }],
  },
  {
    id: "demo-3",
    codigo_interno: "MED-0003",
    nombre_comercial: "Ibuprofeno MK 400 mg",
    principio_activo: "Ibuprofeno",
    presentacion: "Tableta individual",
    unidad_medida: "UNIDAD",
    cantidad_por_envase: 1,
    costo_unitario: 0.85,
    precio_venta: 1.5,
    stock_minimo: 30,
    laboratorios: { nombre: "MK" },
    lotes: [{ id: "lote-3", numero_lote: "IBU-771", fecha_vencimiento: "2027-05-04", cantidad_disponible: 18, costo_compra: 0.85, proveedor: "Farmadis" }],
  },
  {
    id: "demo-4",
    codigo_interno: "MED-0004",
    nombre_comercial: "Amoxidal 500 mg",
    principio_activo: "Amoxicilina",
    presentacion: "Caja x 21 capsulas",
    unidad_medida: "ENVASE",
    cantidad_por_envase: 21,
    costo_unitario: 32,
    precio_venta: 48,
    stock_minimo: 168,
    laboratorios: { nombre: "Roemmers" },
    lotes: [{ id: "lote-4", numero_lote: "AMX-772", fecha_vencimiento: "2027-07-10", cantidad_disponible: 126, costo_compra: 32, proveedor: "Distribuidora Farma" }],
  },
];

const demoSales: SaleRow[] = [
  {
    id: "venta-1",
    fecha: "2026-08-27T09:15:00-04:00",
    total: 46,
    forma_pago: "EFECTIVO",
    estado: "CERRADA",
    numero_ticket: 101,
    detalle_ventas: [
      { cantidad: 1, precio_unitario: 28, costo_unitario: 18, subtotal: 28, productos: { nombre_comercial: "Tapsin 500 mg", presentacion: "Caja x 20 tabletas" } },
      { cantidad: 1, precio_unitario: 18, costo_unitario: 11, subtotal: 18, productos: { nombre_comercial: "Panadol Forte", presentacion: "Blister x 10 comprimidos" } },
    ],
  },
  {
    id: "venta-2",
    fecha: "2026-08-26T16:40:00-04:00",
    total: 12,
    forma_pago: "QR",
    estado: "CERRADA",
    numero_ticket: 100,
    detalle_ventas: [
      { cantidad: 8, precio_unitario: 1.5, costo_unitario: 0.85, subtotal: 12, productos: { nombre_comercial: "Ibuprofeno MK 400 mg", presentacion: "Tableta individual" } },
    ],
  },
];

const moneyFormatter = new Intl.NumberFormat("es-BO", {
  style: "currency",
  currency: "BOB",
  maximumFractionDigits: 2,
});

function money(value: number | string | null | undefined) {
  return moneyFormatter.format(Number(value ?? 0)).replace("BOB", "Bs");
}

function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

function dayKey(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    timeZone: "America/La_Paz",
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function firstRelated<T>(value: T[] | T | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function localDateKey(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz" }).format(new Date(value));
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    timeZone: "America/La_Paz",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function configLabel(key: string) {
  const labels: Record<string, string> = {
    DESCUENTO_MAXIMO_SIN_JUSTIFICACION: "Descuento con justificacion (%)",
    ANULACIONES_MAX_DIA: "Anulaciones maximas por dia",
    UMBRAL_MERMA_PORCENTAJE: "Umbral de merma (%)",
    DESCUENTO_MAXIMO_TOTAL: "Maximo descuento cajero (%)",
    HORA_CIERRE_OPERACION: "Hora de cierre operativo",
  };

  return labels[key] ?? key;
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    ANULACION: "Anulacion",
    DESCUENTO: "Descuento",
    DEVOLUCION: "Devolucion",
    CAMBIO_PRECIO: "Cambio precio",
    AJUSTE_STOCK: "Ajuste stock",
    MERMA: "Merma",
    ALERTA: "Alerta",
  };

  return labels[action] ?? action;
}


function hasAdminEnv() {
  return Boolean(getSupabaseSecretKey());
}

async function loadDashboardData() {
  if (!hasSupabaseEnv()) {
    return { products: demoProducts, sales: demoSales, profiles: [] as ProfileRow[], audits: [] as AuditRow[], mermas: [] as MermaRow[], alertConfig: [] as AlertConfigRow[], currentProfile: null as ProfileRow | null, isDemoMode: true };
  }

  const supabase = await createClient();

    const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: productsData }, { data: salesData }, { data: profilesData }, { data: auditsData }, { data: mermasData }, { data: alertConfigData }, { data: currentProfileData }] = await Promise.all([
    supabase
      .from("productos")
      .select(`
        id,
        codigo_interno,
        nombre_comercial,
        principio_activo,
        presentacion,
        unidad_medida,
        cantidad_por_envase,
        costo_unitario,
        precio_venta,
        stock_minimo,
        laboratorios(nombre),
        lotes(id, numero_lote, fecha_vencimiento, cantidad_disponible, costo_compra, proveedor)
      `)
      .eq("activo", true)
      .order("nombre_comercial", { ascending: true })
      .limit(80),
    supabase
      .from("ventas")
      .select(`
        id,
        fecha,
        total,
        forma_pago,
        estado,
        numero_ticket,
        detalle_ventas(
          cantidad,
          precio_unitario,
          costo_unitario,
          subtotal,
          productos(nombre_comercial, presentacion)
        )
      `)
      .order("fecha", { ascending: false })
      .limit(80),
    supabase
      .from("perfiles")
      .select("id, nombre_completo, rol, activo, fecha_creacion")
      .order("fecha_creacion", { ascending: false }),
    supabase
      .from("auditoria_acciones")
      .select("id, usuario_id, accion, descripcion, data, severidad, fecha, revisada, perfiles(nombre_completo, rol)")
      .order("fecha", { ascending: false })
      .limit(80),
    supabase
      .from("mermas")
      .select("id, fecha_conteo, stock_teorico, stock_fisico, diferencia, porcentaje_diferencia, supera_umbral, revisada, observaciones, productos(nombre_comercial, codigo_interno)")
      .order("fecha_conteo", { ascending: false })
      .limit(40),
    supabase
      .from("alertas_config")
      .select("id, clave, valor, descripcion")
      .order("clave", { ascending: true }),
    user?.id
      ? supabase
          .from("perfiles")
          .select("id, nombre_completo, rol, activo, fecha_creacion")
          .eq("id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
        products: (productsData ?? []) as unknown as ProductRow[],
    sales: (salesData ?? []) as unknown as SaleRow[],
        profiles: (profilesData ?? []) as unknown as ProfileRow[],
    audits: (auditsData ?? []) as unknown as AuditRow[],
    mermas: (mermasData ?? []) as unknown as MermaRow[],
    alertConfig: (alertConfigData ?? []) as unknown as AlertConfigRow[],
    currentProfile: (currentProfileData ?? null) as unknown as ProfileRow | null,
    isDemoMode: false,
  };
}

export default async function DashboardPage() {
  const { products, sales, profiles, audits, mermas, alertConfig, currentProfile, isDemoMode } = await loadDashboardData();
  const canManageUsers = currentProfile?.rol === "ADMIN" && currentProfile.activo;
  const adminReady = hasAdminEnv();
  const activeSales = sales.filter((sale) => sale.estado === "CERRADA");

  const inventory = products.map((product) => {
    const stockTotal = product.lotes?.reduce((sum, lote) => sum + lote.cantidad_disponible, 0) ?? 0;
    const acquisitionCost = Number(product.costo_unitario);
    const salePrice = Number(product.precio_venta);
    const margin = salePrice - acquisitionCost;
    const marginRate = salePrice > 0 ? (margin / salePrice) * 100 : 0;
    const packageFactor = Math.max(Number(product.cantidad_por_envase || 1), 1);
    const isPackage = product.unidad_medida === "ENVASE";

    return {
      ...product,
      stockTotal,
      acquisitionCost,
      salePrice,
      margin,
      marginRate,
      packageFactor,
      saleUnitLabel: isPackage ? `Envase x ${packageFactor}` : "Unidad",
      equivalentUnitCost: acquisitionCost / packageFactor,
      equivalentUnitPrice: salePrice / packageFactor,
      equivalentUnitMargin: margin / packageFactor,
      stockPackages: isPackage ? Math.floor(stockTotal / packageFactor) : stockTotal,
      looseUnits: isPackage ? stockTotal % packageFactor : 0,
      minimumPackages: isPackage ? Math.ceil(product.stock_minimo / packageFactor) : product.stock_minimo,
      lowStock: stockTotal <= product.stock_minimo,
      orderSuggestion: Math.max(product.stock_minimo * 2 - stockTotal, product.stock_minimo - stockTotal, 0),
      orderSuggestionPackages: isPackage ? Math.ceil(Math.max(product.stock_minimo * 2 - stockTotal, product.stock_minimo - stockTotal, 0) / packageFactor) : Math.max(product.stock_minimo * 2 - stockTotal, product.stock_minimo - stockTotal, 0),
    };
  });

  const lowStockProducts = inventory
    .filter((product) => product.lowStock)
    .sort((a, b) => a.stockTotal - b.stockTotal)
    .slice(0, 8);

  const saleProducts = inventory.map((product) => {
    const firstLot = product.lotes.find((lote) => lote.cantidad_disponible > 0) ?? null;

    return {
      id: product.id,
      loteId: firstLot?.id ?? null,
      nombre: product.nombre_comercial,
      detalle: `${product.principio_activo ?? "Medicamento base no registrado"} - ${product.presentacion ?? "Sin presentacion"}`,
      precio: product.salePrice,
      costo: product.acquisitionCost,
      cantidad: product.stockTotal,
      unidad: product.saleUnitLabel,
      unidadesPorCaja: product.packageFactor,
    };
  });

  const salesByDay = activeSales.reduce<Record<string, { total: number; count: number; margin: number }>>((acc, sale) => {
    const key = dayKey(sale.fecha);
    const margin = sale.detalle_ventas.reduce(
      (sum, item) => sum + (Number(item.precio_unitario) - Number(item.costo_unitario)) * item.cantidad,
      0
    );
    acc[key] ??= { total: 0, count: 0, margin: 0 };
    acc[key].total += Number(sale.total);
    acc[key].count += 1;
    acc[key].margin += margin;
    return acc;
  }, {});

  const dailySales = Object.entries(salesByDay).slice(0, 7);
  const cashByDay = activeSales.reduce<Record<string, { efectivo: number; qr: number; total: number }>>((acc, sale) => {
    const key = dayKey(sale.fecha);
    acc[key] ??= { efectivo: 0, qr: 0, total: 0 };
    const total = Number(sale.total);
    acc[key].total += total;

    if (sale.forma_pago === "EFECTIVO") {
      acc[key].efectivo += total;
    } else if (sale.forma_pago === "QR" || sale.forma_pago === "TARJETA") {
      acc[key].qr += total;
    }

    return acc;
  }, {});
  const cashDays = Object.entries(cashByDay).map(([day, item]) => ({ day, ...item })).slice(0, 7);
  const totalRevenue = activeSales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const totalMargin = activeSales.reduce(
    (sum, sale) =>
      sum +
      sale.detalle_ventas.reduce(
        (itemSum, item) => itemSum + (Number(item.precio_unitario) - Number(item.costo_unitario)) * item.cantidad,
        0
      ),
    0
  );
  const today = localDateKey(new Date());
  const auditsToday = audits.filter((audit) => localDateKey(audit.fecha) === today);
  const anulacionesToday = auditsToday.filter((audit) => audit.accion === "ANULACION").length;
  const descuentosAltosToday = auditsToday.filter((audit) => audit.accion === "DESCUENTO" && ["ALTA", "CRITICA"].includes(audit.severidad)).length;
  const alertasPendientes = audits.filter((audit) => !audit.revisada && ["ALTA", "CRITICA"].includes(audit.severidad));
  const mermasPendientes = mermas.filter((merma) => merma.supera_umbral && !merma.revisada);

  return (
    <main className="dashboard-page">
      <section className="dashboard-shell">
        <input className="tab-input" id="tab-dashboard" name="dashboardTab" type="radio" defaultChecked />
        <input className="tab-input" id="tab-inventario" name="dashboardTab" type="radio" />
        <input className="tab-input" id="tab-ventas" name="dashboardTab" type="radio" />
        <input className="tab-input" id="tab-stock" name="dashboardTab" type="radio" />
                <input className="tab-input" id="tab-caja" name="dashboardTab" type="radio" />
        <input className="tab-input" id="tab-seguridad" name="dashboardTab" type="radio" />
        <input className="tab-input" id="tab-admin" name="dashboardTab" type="radio" />
        <input className="tab-input" id="tab-registro" name="dashboardTab" type="radio" />
        <aside className="dashboard-sidebar">
          <div className="brand-row compact-brand">
            <span className="brand-icon">+</span>
            <div>
              <strong>FarmaGest</strong>
              <p className="muted">Farmacia Bolivia</p>
            </div>
          </div>
          <nav className="dashboard-nav" aria-label="Menu principal">
            <label className="nav-item nav-dashboard" htmlFor="tab-dashboard"><span>01</span> Inicio</label>
            <label className="nav-item nav-inventario" htmlFor="tab-inventario"><span>02</span> Medicamentos</label>
            <label className="nav-item nav-ventas" htmlFor="tab-ventas"><span>03</span> Ventas</label>
            <label className="nav-item nav-stock" htmlFor="tab-stock"><span>04</span> Por reponer</label>
            <label className="nav-item nav-caja" htmlFor="tab-caja"><span>05</span> Caja del dia</label>{canManageUsers ? <label className="nav-item nav-seguridad" htmlFor="tab-seguridad"><span>06</span> Seguridad</label> : null}{canManageUsers ? <label className="nav-item nav-admin" htmlFor="tab-admin"><span>07</span> Admin</label> : null}

          </nav>
        </aside>

        <section className="dashboard-card" id="dashboard">
        <header className="dashboard-header">
          <div className="brand-row">
            <span className="brand-icon">+</span>
            <div>
              <strong>FarmaGest</strong>
              <p className="muted">Medicamentos, ventas y pedidos en un solo lugar</p>
            </div>
          </div>

          {isDemoMode ? (
            <span className="demo-pill">Modo prueba</span>
          ) : (
            <form action={signOutAction}>
              <button className="secondary-button" type="submit">Cerrar sesion</button>
            </form>
          )}
        </header>

        {isDemoMode ? (
          <div className="demo-banner">
            Estas viendo datos de prueba. Cuando conectes la base de datos, el panel usara la informacion real de tu farmacia.
          </div>
        ) : null}

        <section className="dashboard-view dashboard-view-dashboard">
          <div className="dashboard-grid">
          <article className="metric">
            <span className="muted">Medicamentos registrados</span>
            <strong>{inventory.length}</strong>
          </article>
          <article className="metric">
            <span className="muted">Por reponer</span>
            <strong>{lowStockProducts.length}</strong>
          </article>
          <article className="metric">
            <span className="muted">Ventas realizadas</span>
            <strong>{activeSales.length}</strong>
          </article>
                    <article className="metric">
            <span className="muted">Ganancia aproximada</span>
            <strong>{money(totalMargin)}</strong>
          </article>
                    <article className="metric">
            <span className="muted">Usuarios activos</span>
            <strong>{profiles.filter((profile) => profile.activo).length}</strong>
          </article>
          <article className="metric">
            <span className="muted">Alertas pendientes</span>
            <strong>{alertasPendientes.length}</strong>
          </article>
        </div>
        </section>

        <section className="tab-content">
          <article className="panel dashboard-view dashboard-view-inventario" id="inventario">
            <div className="panel-head">
              <div>
                <h2>Medicamentos</h2>
                <p className="muted">Nombre comercial, medicamento base, lo que costo, precio de venta y ganancia.</p>
              </div>
              <label className="primary-button tab-button" htmlFor="tab-registro">Agregar medicamento</label>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Codigo</th>
                    <th>Medicamento</th>
                    <th>Cantidad</th>
                    <th>Lo que costo</th>
                    <th>Precio de venta</th>
                    <th>Ganancia</th>
                    <th>Unidad</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((product) => (
                    <tr key={product.id}>
                      <td>{product.codigo_interno}</td>
                      <td>
                        <strong>{product.nombre_comercial}</strong>
                        <span className="row-detail">
                          {product.principio_activo ?? "Sin medicamento base"} - {product.presentacion ?? "Sin presentacion"}
                        </span>
                        <span className="row-detail">{firstRelated(product.laboratorios)?.nombre ?? "Sin laboratorio"}</span>
                      </td>
                      <td>
                        <span className={product.lowStock ? "status danger" : "status ok"}>{product.stockPackages}</span>{product.unidad_medida === "ENVASE" ? <span className="row-detail">{product.stockTotal} unidades disponibles</span> : null}
                      </td>
                      <td>
                        <strong>{money(product.acquisitionCost)}</strong>
                        {product.unidad_medida === "ENVASE" ? (
                          <span className="row-detail">{money(product.equivalentUnitCost)} por unidad</span>
                        ) : null}
                      </td>
                      <td>
                        <strong>{money(product.salePrice)}</strong>
                        {product.unidad_medida === "ENVASE" ? (
                          <span className="row-detail">{money(product.equivalentUnitPrice)} por unidad</span>
                        ) : null}
                      </td>
                      <td>
                        <strong>{money(product.margin)}</strong>
                        <span className="row-detail">
                          {percent(product.marginRate)}
                          {product.unidad_medida === "ENVASE" ? ` - ${money(product.equivalentUnitMargin)} por unidad` : ""}
                        </span>
                      </td>
                      <td>{product.saleUnitLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel form-panel dashboard-view dashboard-view-registro" id="registro">
            <div className="panel-head">
              <div>
                <h2>Agregar medicamento</h2>
                <p className="muted">Usa el nombre comercial y el medicamento base para diferenciar productos parecidos.</p>
              </div>
            </div>
            <form className="form-stack" action={isDemoMode ? undefined : registrarProductoAction}>
              <label>Codigo interno<input name="codigoInterno" placeholder="MED-0007" disabled={isDemoMode} required /></label>
              <label>Nombre comercial<input name="nombreComercial" placeholder="Tapsin 500 mg" disabled={isDemoMode} required /></label>
              <label>Medicamento base<input name="principioActivo" placeholder="Paracetamol" disabled={isDemoMode} /></label>
              <label>Presentacion<input name="presentacion" placeholder="Caja x 20 tabletas" disabled={isDemoMode} required /></label>
              <label>Laboratorio<input name="laboratorio" placeholder="Laboratorio o proveedor" disabled={isDemoMode} /></label>
              <div className="form-row">
                <label>Como se vende
                  <select name="unidadMedida" disabled={isDemoMode} required>
                    <option value="UNIDAD">Unidad</option>
                    <option value="ENVASE">Caja o paquete</option>
                  </select>
                </label>
                <label>Unidades por caja<input name="cantidadPorEnvase" type="number" min="1" defaultValue="1" disabled={isDemoMode} required /></label>
              </div>
              <div className="form-row">
                <label>Cantidad minima<input name="stockMinimo" type="number" min="0" defaultValue="5" disabled={isDemoMode} required /><span className="field-help">Si vendes por caja, escribe cuantas cajas quieres tener como minimo.</span></label>
                <label>Cantidad actual<input name="cantidadDisponible" type="number" min="1" defaultValue="1" disabled={isDemoMode} required /><span className="field-help">Si vendes por caja, escribe cuantas cajas entraron.</span></label>
              </div>
              <div className="form-row">
                <label>Lo que costo<input name="costoAdquisicion" type="number" min="0" step="0.01" disabled={isDemoMode} required /></label>
                <label>Precio de venta<input name="precioVenta" type="number" min="0" step="0.01" disabled={isDemoMode} required /></label>
              </div>
              <div className="form-row">
                <label>Lote<input name="numeroLote" disabled={isDemoMode} required /></label>
                <label>Fecha de vencimiento<input name="fechaVencimiento" type="date" disabled={isDemoMode} required /></label>
              </div>
              <label>Proveedor o distribuidor<input name="proveedor" disabled={isDemoMode} /></label>
              <button className="primary-button" type="submit" disabled={isDemoMode}>Guardar medicamento</button>
            </form>
          </article>

          <article className="panel dashboard-view dashboard-view-ventas" id="ventas-dia">
            <div className="panel-head">
              <div>
                <h2>Ventas</h2>
                <p className="muted">Agrega medicamentos al carrito y cobra en efectivo o QR.</p>
              </div>
              <strong>{money(totalRevenue)}</strong>
            </div>

            <SalesRegister
              products={saleProducts}
              isDemoMode={isDemoMode}
              initialDailySales={dailySales.map(([day, item]) => ({
                day,
                total: item.total,
                count: item.count,
                profit: item.margin,
              }))}
            />
          </article>

          <article className="panel dashboard-view dashboard-view-stock" id="stock-bajo">
            <div className="panel-head">
              <div>
                <h2>Medicamentos por reponer</h2>
                <p className="muted">Medicamentos que ya estan cerca de agotarse.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Cantidad actual</th>
                    <th>Cantidad minima</th>
                    <th>Sugerido para comprar</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockProducts.length ? lowStockProducts.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <strong>{product.nombre_comercial}</strong>
                        <span className="row-detail">{firstRelated(product.laboratorios)?.nombre ?? "Sin laboratorio"}</span>
                      </td>
                      <td>{product.stockPackages}{product.unidad_medida === "ENVASE" ? <span className="row-detail">{product.stockTotal} unidades</span> : null}</td>
                      <td>{product.minimumPackages}{product.unidad_medida === "ENVASE" ? <span className="row-detail">{product.stock_minimo} unidades</span> : null}</td>
                      <td>{product.orderSuggestionPackages}{product.unidad_medida === "ENVASE" ? <span className="row-detail">{product.orderSuggestion} unidades</span> : null}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4}>No hay medicamentos por reponer.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          {canManageUsers ? (
            <article className="panel dashboard-view dashboard-view-seguridad" id="seguridad-auditoria">
              <div className="panel-head">
                <div>
                  <h2>Seguridad</h2>
                  <p className="muted">Auditoria anti-robo, mermas, descuentos y anulaciones sospechosas.</p>
                </div>
              </div>

              <div className="security-metrics">
                <article className="metric"><span className="muted">Alertas pendientes</span><strong>{alertasPendientes.length}</strong></article>
                <article className="metric"><span className="muted">Anulaciones hoy</span><strong>{anulacionesToday}</strong></article>
                <article className="metric"><span className="muted">Descuentos altos hoy</span><strong>{descuentosAltosToday}</strong></article>
                <article className="metric"><span className="muted">Mermas por revisar</span><strong>{mermasPendientes.length}</strong></article>
              </div>

              <div className="security-grid">
                <form className="form-stack security-box" action={registrarMermaAction}>
                  <div>
                    <h3>Conteo fisico</h3>
                    <p className="muted">Compara el stock del sistema contra lo contado en farmacia.</p>
                  </div>
                  <label>Producto
                    <select name="productoId" required>
                      {inventory.map((product) => (
                        <option key={product.id} value={product.id}>{product.nombre_comercial} - sistema: {product.stockTotal}</option>
                      ))}
                    </select>
                  </label>
                  <label>Stock fisico contado<input name="stockFisico" type="number" min="0" required /></label>
                  <label>Observaciones<input name="observaciones" placeholder="Conteo nocturno, estante A, faltante revisado" /></label>
                  <button className="primary-button" type="submit">Guardar conteo</button>
                </form>

                <div className="security-box">
                  <div className="panel-head compact-head">
                    <div>
                      <h3>Umbrales</h3>
                      <p className="muted">Parametros que activan bloqueos y alertas.</p>
                    </div>
                  </div>
                  <div className="config-list">
                    {alertConfig.length ? alertConfig.map((item) => (
                      <form className="config-row" action={actualizarUmbralAction} key={item.id}>
                        <input type="hidden" name="clave" value={item.clave} />
                        <label>{configLabel(item.clave)}<input name="valor" type="number" min="0" max="100" defaultValue={item.valor} /></label>
                        <button className="secondary-button small-button" type="submit">Guardar</button>
                      </form>
                    )) : <p className="muted">Ejecuta la migracion de auditoria para cargar los umbrales.</p>}
                  </div>
                </div>
              </div>

              <div className="table-wrap security-table">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Accion</th>
                      <th>Usuario</th>
                      <th>Detalle</th>
                      <th>Riesgo</th>
                      <th>Seguimiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audits.length ? audits.map((audit) => {
                      const auditProfile = firstRelated(audit.perfiles);
                      return (
                        <tr key={audit.id}>
                          <td>{dateTime(audit.fecha)}</td>
                          <td>{actionLabel(audit.accion)}</td>
                          <td>
                            <strong>{auditProfile?.nombre_completo ?? "Usuario"}</strong>
                            <span className="row-detail">{auditProfile?.rol ?? "Sin perfil"}</span>
                          </td>
                          <td>{audit.descripcion}</td>
                          <td><span className={`risk-pill risk-${audit.severidad.toLowerCase()}`}>{audit.severidad}</span></td>
                          <td>
                            {audit.revisada ? <span className="status ok">Revisada</span> : (
                              <form action={marcarAuditoriaRevisadaAction}>
                                <input type="hidden" name="auditoriaId" value={audit.id} />
                                <button className="secondary-button small-button" type="submit">Marcar</button>
                              </form>
                            )}
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr><td colSpan={6}>No hay eventos de auditoria registrados.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="table-wrap security-table">
                <table>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Fecha</th>
                      <th>Sistema</th>
                      <th>Fisico</th>
                      <th>Diferencia</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mermas.length ? mermas.map((merma) => {
                      const product = firstRelated(merma.productos);
                      return (
                        <tr key={merma.id}>
                          <td><strong>{product?.nombre_comercial ?? "Producto"}</strong><span className="row-detail">{product?.codigo_interno ?? "Sin codigo"}</span></td>
                          <td>{merma.fecha_conteo}</td>
                          <td>{merma.stock_teorico}</td>
                          <td>{merma.stock_fisico}</td>
                          <td>{merma.diferencia} <span className="row-detail">{Number(merma.porcentaje_diferencia).toFixed(2)}%</span></td>
                          <td><span className={merma.supera_umbral ? "status danger" : "status ok"}>{merma.supera_umbral ? "Alerta" : "Normal"}</span></td>
                        </tr>
                      );
                    }) : (
                      <tr><td colSpan={6}>Todavia no hay conteos de merma.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          ) : null}
          {canManageUsers ? (
            <article className="panel dashboard-view dashboard-view-admin" id="admin-usuarios">
              <div className="panel-head">
                <div>
                  <h2>Admin</h2>
                  <p className="muted">Crea usuarios nuevos y asigna permisos para operar la farmacia.</p>
                </div>
              </div>

              {!adminReady ? (
                <div className="demo-banner admin-warning">
                  Falta SUPABASE_SERVICE_ROLE_KEY en el servidor. Agrega esa variable para crear cuentas reales desde este panel.
                </div>
              ) : null}

              <div className="admin-grid">
                <form className="form-stack admin-form" action={isDemoMode || !adminReady ? undefined : registrarUsuarioAction}>
                  <label>Nombre completo<input name="nombreCompleto" placeholder="Maria Perez" disabled={isDemoMode || !adminReady} required /></label>
                  <label>Email<input name="email" type="email" placeholder="usuario@farmacia.com" disabled={isDemoMode || !adminReady} required /></label>
                  <div className="form-row">
                    <label>Clave temporal<input name="password" type="password" minLength={8} disabled={isDemoMode || !adminReady} required /></label>
                    <label>Rol
                      <select name="rol" disabled={isDemoMode || !adminReady} required>
                        <option value="CAJERO">Cajero</option>
                        <option value="ADMIN">Administrador</option>
                      </select>
                    </label>
                  </div>
                  <button className="primary-button" type="submit" disabled={isDemoMode || !adminReady}>Crear cuenta</button>
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
            </article>
          ) : null}

          <article className="panel dashboard-view dashboard-view-caja" id="caja-dia">
            <div className="panel-head">
              <div>
                <h2>Caja del dia</h2>
                <p className="muted">Revisa efectivo, QR y diferencia al cerrar caja.</p>
              </div>
            </div>
            <DailyCashBox days={cashDays} />
          </article>
        </section>
        </section>
      </section>
    </main>
  );
}












