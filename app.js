const initialProducts = [
  { code: "MED-0001", name: "Amoxicilina 500 mg", laboratory: "Bago", presentation: "Caja x 21 capsulas", unit: "capsulas", stock: 26, min: 20, price: 1.8, lot: "AMX-772", expiry: "2026-09-07" },
  { code: "MED-0002", name: "Losartan 50 mg", laboratory: "Inti", presentation: "Tabletas x 30", unit: "tabletas", stock: 18, min: 24, price: 1.5, lot: "LOS-220", expiry: "2026-09-12" },
  { code: "MED-0003", name: "Omeprazol 20 mg", laboratory: "COFAR", presentation: "Capsulas x 14", unit: "capsulas", stock: 42, min: 12, price: 2, lot: "OME-118", expiry: "2026-09-21" },
  { code: "MED-0004", name: "Ibuprofeno 400 mg", laboratory: "LAFAR", presentation: "Caja x 10 tabletas", unit: "tabletas", stock: 35, min: 18, price: 1.65, lot: "IBU-771", expiry: "2026-10-02" },
  { code: "MED-0005", name: "Suero oral", laboratory: "Vita", presentation: "Sobre unidad", unit: "sobres", stock: 61, min: 30, price: 4.5, lot: "SRO-405", expiry: "2026-10-18" },
  { code: "MED-0006", name: "Metformina 850 mg", laboratory: "Bago", presentation: "Tabletas x 30", unit: "tabletas", stock: 11, min: 25, price: 1.1, lot: "MET-312", expiry: "2026-11-04" },
];

const initialSales = [
  { ticket: 345, pay: "EFECTIVO", total: 84.5, cashier: "Ana", status: "Cerrada" },
  { ticket: 344, pay: "QR", total: 127, cashier: "Luis", status: "Cerrada" },
  { ticket: 343, pay: "CREDITO", total: 53.2, cashier: "Ana", status: "Pendiente" },
];

let products = structuredClone(initialProducts);
let sales = structuredClone(initialSales);
let cart = [];
let cashState = null;
const demoUser = {
  email: "admin@farmagest.bo",
  password: "admin123",
};
const SESSION_KEY = "farmagest-demo-session";
const PRODUCTS_KEY = "farmagest-products-v1";
const SALES_KEY = "farmagest-sales-v1";
const CART_KEY = "farmagest-cart-v1";
const CART_TTL_MS = 1000 * 60 * 45;
const WHATSAPP_REGISTRATION_NUMBER = "";

const currency = new Intl.NumberFormat("es-BO", {
  style: "currency",
  currency: "BOB",
  maximumFractionDigits: 2,
});
const allowedPaymentMethods = ["EFECTIVO", "QR"];

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function safeJsonLoad(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return structuredClone(fallback);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : structuredClone(fallback);
  } catch {
    localStorage.removeItem(key);
    return structuredClone(fallback);
  }
}

function saveState() {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  localStorage.setItem(SALES_KEY, JSON.stringify(sales));
}

function loadState() {
  products = safeJsonLoad(PRODUCTS_KEY, initialProducts)
    .map(normalizeProduct)
    .filter(Boolean);
  sales = safeJsonLoad(SALES_KEY, initialSales)
    .map(normalizeSale)
    .filter(Boolean);
}

function normalizeProduct(product) {
  const code = String(product?.code ?? "").trim();
  const name = String(product?.name ?? "").trim();
  const presentation = String(product?.presentation ?? "").trim();
  const laboratory = String(product?.laboratory ?? inferLaboratory(name)).trim();
  const unit = String(product?.unit ?? inferUnitFromPresentation(presentation)).trim();
  const stock = Number(product?.stock);
  const min = Number(product?.min);
  const price = Number(product?.price);
  const lot = String(product?.lot ?? "").trim();
  const expiry = String(product?.expiry ?? "").trim();

  if (!code || !name || !presentation || !lot || !expiry) return null;
  if (![stock, min, price].every(Number.isFinite)) return null;
  if (stock < 0 || min < 0 || price < 0) return null;

  return { code, name, laboratory, presentation, unit, stock, min, price, lot, expiry };
}

function inferUnitFromPresentation(presentation) {
  const text = normalizeText(presentation);
  if (text.includes("capsula")) return "capsulas";
  if (text.includes("tableta")) return "tabletas";
  if (text.includes("comprimido")) return "comprimidos";
  if (text.includes("sobre")) return "sobres";
  if (text.includes("frasco")) return "frascos";
  return "unidades";
}

function inferLaboratory(name) {
  const text = normalizeText(name);
  if (text.includes("amoxicilina") || text.includes("metformina")) return "Bago";
  if (text.includes("losartan")) return "Inti";
  if (text.includes("omeprazol")) return "COFAR";
  if (text.includes("ibuprofeno")) return "LAFAR";
  if (text.includes("suero")) return "Vita";
  return "Sin laboratorio";
}

function normalizeSale(sale) {
  const ticket = Number(sale?.ticket);
  const total = Number(sale?.total);
  const pay = String(sale?.pay ?? "").trim();
  const cashier = String(sale?.cashier ?? "").trim();
  const status = String(sale?.status ?? "").trim();

  if (!Number.isInteger(ticket) || ticket <= 0 || !Number.isFinite(total) || total < 0) return null;
  if (!pay || !cashier || !status) return null;

  return { ticket, pay, total, cashier, status };
}

function money(value) {
  return currency.format(value).replace("BOB", "Bs");
}

function parseAmount(value, fallback, useFallbackWhenEmpty = false) {
  if (value == null) return fallback;
  if (value === "" && useFallbackWhenEmpty) return fallback;
  if (value === "") return Number.NaN;
  return Number(value);
}

function daysTo(date) {
  const today = new Date("2026-08-26T00:00:00");
  const target = new Date(`${date}T00:00:00`);
  return Math.ceil((target - today) / 86400000);
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

function statusClass(product) {
  const days = daysTo(product.expiry);
  if (days <= 15 || product.stock <= product.min) return "danger";
  if (days <= 35) return "warn";
  return "ok";
}

function statusText(product) {
  const tone = statusClass(product);
  if (daysTo(product.expiry) < 0) return "Vencido";
  if (tone === "danger") return product.stock <= product.min ? "Stock bajo" : "Urgente";
  if (tone === "warn") return "Proximo";
  return "Normal";
}

function criticalScore(product) {
  const days = daysTo(product.expiry);
  const stockGap = Math.max(0, product.min - product.stock);
  const expiryRisk = days < 0 ? 200 : Math.max(0, 45 - days);
  const lowStockRisk = stockGap * 5;
  const lowUnitsRisk = Math.max(0, 20 - product.stock);

  return expiryRisk + lowStockRisk + lowUnitsRisk;
}

function filteredProducts() {
  const input = $("#globalSearch");
  const term = input ? normalizeText(input.value.trim()) : "";
  if (!term) return products;
  return products.filter((product) =>
    [product.code, product.name, product.laboratory, product.presentation, product.lot].some((value) =>
      normalizeText(value).includes(term)
    )
  );
}

function renderMetrics() {
  const revenue = sales
    .filter((sale) => sale.status === "Cerrada")
    .reduce((sum, sale) => sum + sale.total, 0);

  $("#metricProducts").textContent = products.length;
  $("#metricLowStock").textContent = products.filter((product) => product.stock <= product.min).length;
  $("#metricSales").textContent = sales.length;
  $("#metricRevenue").textContent = money(revenue);

  const critical = products.slice().sort((a, b) => criticalScore(b) - criticalScore(a))[0];
  $("#criticalName").textContent = critical.name;
  $("#criticalDetail").textContent = `${critical.presentation} - ${critical.laboratory}`;
  $("#criticalDays").textContent = Math.max(0, daysTo(critical.expiry));
  $("#criticalUnits").textContent = critical.stock;
  $("#criticalPrice").textContent = money(critical.price);
}

function productNameCell(product) {
  return `${escapeHtml(product.name)}<span class="muted">${escapeHtml(product.presentation)}</span>`;
}

function renderInventory() {
  const rows = filteredProducts()
    .map(
      (product) => `
        <tr>
          <td>${product.code}</td>
          <td>${productNameCell(product)}</td>
          <td>${escapeHtml(product.laboratory)}</td>
          <td>${escapeHtml(product.unit)}</td>
          <td>${product.stock}</td>
          <td>${product.min}</td>
          <td>${money(product.price)}</td>
        </tr>
      `
    )
    .join("");
  $("#inventoryRows").innerHTML = rows || `<tr><td colspan="7">Sin resultados</td></tr>`;
}

function renderExpiry(target = "#expiryRows", limit) {
  const list = filteredProducts()
    .slice()
    .sort((a, b) => daysTo(a.expiry) - daysTo(b.expiry))
    .slice(0, limit || products.length);

  const rows = list
    .map((product) => {
      const days = daysTo(product.expiry);
      const tone = statusClass(product);
      return `
        <tr>
          <td>${productNameCell(product)}</td>
          <td>${escapeHtml(product.lot)}</td>
          <td>${product.expiry}</td>
          <td>${target === "#expiryRows" ? `${days} dias` : product.stock}</td>
          <td><span class="status ${tone}">${target === "#expiryRows" ? (days < 0 ? "Bloqueado" : days <= 15 ? "Retirar" : "Promocionar") : statusText(product)}</span></td>
        </tr>
      `;
    })
    .join("");

  $(target).innerHTML = rows || `<tr><td colspan="5">Sin resultados</td></tr>`;
}

function renderSales() {
  $("#dashboardSales").innerHTML = sales
    .slice(0, 5)
    .map(
      (sale) => `
        <tr>
          <td>#${String(sale.ticket).padStart(6, "0")}</td>
          <td>${escapeHtml(sale.pay)}</td>
          <td>${money(sale.total)}</td>
          <td>${escapeHtml(sale.cashier)}</td>
          <td><span class="status ${sale.status === "Cerrada" ? "ok" : "warn"}">${escapeHtml(sale.status)}</span></td>
        </tr>
      `
    )
    .join("");
}

function renderPosProducts() {
  $("#posProducts").innerHTML = filteredProducts()
    .map(
      (product) => {
        const isUnavailable = product.stock <= 0 || daysTo(product.expiry) < 0;
        const buttonText = product.stock <= 0 ? "Sin stock" : daysTo(product.expiry) < 0 ? "Vencido" : "Agregar";

        return `
          <article class="product-card">
            <div>
              <h3>${escapeHtml(product.name)}</h3>
              <p>${escapeHtml(product.presentation)} - ${escapeHtml(product.laboratory)}</p>
              <div class="product-meta">
                <span>${money(product.price)}</span>
              <span>Stock ${product.stock} ${escapeHtml(product.unit)}</span>
                <span>Lote ${escapeHtml(product.lot)}</span>
              </div>
            </div>
            <button class="primary-action" data-add="${escapeHtml(product.code)}" type="button" ${isUnavailable ? "disabled" : ""}>${buttonText}</button>
          </article>
        `;
      }
    )
    .join("");
}

function renderCart() {
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  $("#cartCount").textContent = `${cart.reduce((sum, item) => sum + item.qty, 0)} items`;
  $("#cartTotal").textContent = money(total);
  $("#cartRows").innerHTML =
    cart
      .map(
        (item) => `
          <article class="cart-row">
            <div>
              <strong>${escapeHtml(item.name)}</strong>
              <span class="muted">${money(item.price)} por ${escapeHtml(item.unit)}</span>
            </div>
            <div>
              <button class="qty" data-dec="${item.code}" type="button">-</button>
              <strong>${item.qty}</strong>
              <button class="qty" data-inc="${item.code}" type="button">+</button>
            </div>
          </article>
        `
      )
      .join("") || `<p class="muted">Agrega productos para iniciar una venta.</p>`;
}

function addToCart(code) {
  const product = products.find((item) => item.code === code);
  if (!product || product.stock <= 0) return toast("No hay stock disponible.");
  if (daysTo(product.expiry) < 0) return toast("No se puede vender un lote vencido.");

  const item = cart.find((entry) => entry.code === code);
  const currentQty = item ? item.qty : 0;
  if (currentQty >= product.stock) return toast("Stock insuficiente para este producto.");

  if (item) item.qty += 1;
  else cart.push({ code: product.code, name: product.name, unit: product.unit, price: product.price, qty: 1 });
  saveCart();
  renderCart();
  toast("Producto agregado al carrito.");
}

function changeQty(code, delta) {
  const product = products.find((item) => item.code === code);
  const item = cart.find((entry) => entry.code === code);
  if (!item || !product) return;
  item.qty += delta;
  if (item.qty > product.stock) item.qty = product.stock;
  cart = cart.filter((entry) => entry.qty > 0);
  saveCart();
  renderCart();
}

function completeSale(pay) {
  if (!cart.length) return toast("El carrito esta vacio.");
  if (!allowedPaymentMethods.includes(pay)) return toast("Metodo de pago invalido.");

  const error = validateCart();
  if (error) return toast(error);

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  cart.forEach((item) => {
    const product = products.find((entry) => entry.code === item.code);
    product.stock -= item.qty;
  });
  sales.unshift({
    ticket: Math.max(...sales.map((sale) => sale.ticket)) + 1,
    pay,
    total,
    cashier: "Ana",
    status: "Cerrada",
  });
  cart = [];
  saveCart();
  saveState();
  renderAll();
  toast("Venta registrada y stock actualizado.");
}

function validateCart() {
  for (const item of cart) {
    const product = products.find((entry) => entry.code === item.code);
    if (!product) return `Producto no encontrado: ${item.name}`;
    if (daysTo(product.expiry) < 0) return `${product.name} esta vencido y fue bloqueado.`;
    if (item.qty <= 0) return `Cantidad invalida en ${product.name}.`;
    if (item.qty > product.stock) return `Stock insuficiente para ${product.name}.`;
  }
  return "";
}

function saveCart() {
  localStorage.setItem(
    CART_KEY,
    JSON.stringify({
      savedAt: Date.now(),
      items: cart,
    })
  );
}

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed.savedAt || Date.now() - parsed.savedAt > CART_TTL_MS) {
      localStorage.removeItem(CART_KEY);
      return;
    }
    cart = parsed.items
      .map((item) => {
        const product = products.find((entry) => entry.code === item.code);
        if (!product || daysTo(product.expiry) < 0) return null;
        return {
          code: product.code,
          name: product.name,
          unit: product.unit,
          price: product.price,
          qty: Math.min(Number(item.qty) || 0, product.stock),
        };
      })
      .filter(Boolean);
  } catch {
    localStorage.removeItem(CART_KEY);
  }
}

function renderCashSummary(values = {}) {
  cashState = values;
  const cashSales = sales
    .filter((sale) => sale.pay === "EFECTIVO" && sale.status === "Cerrada")
    .reduce((sum, sale) => sum + sale.total, 0);
  const cardSales = sales
    .filter((sale) => sale.pay === "QR" && sale.status === "Cerrada")
    .reduce((sum, sale) => sum + sale.total, 0);
  const opening = parseAmount(values.opening, 300);
  const expenses = parseAmount(values.expenses, 40);
  const withdrawals = parseAmount(values.withdrawals, 0);
  const expected = opening + cashSales - expenses - withdrawals;
  const counted = parseAmount(values.counted, expected, true);

  if (![opening, expenses, withdrawals, counted].every(Number.isFinite)) {
    $("#cashSummary").innerHTML = `<p class="muted">Completa los montos para calcular el arqueo.</p>`;
    return;
  }

  if (opening < 0 || expenses < 0 || withdrawals < 0 || counted < 0) {
    $("#cashSummary").innerHTML = `<p class="muted">Los montos no pueden ser negativos.</p>`;
    return;
  }

  const diff = counted - expected;

  const countedInput = $("#countedCash");
  if (countedInput && countedInput.value === "") {
    countedInput.value = expected.toFixed(2);
  }

  $("#cashSummary").innerHTML = `
    <div class="cash-row"><span>Fondo inicial</span><strong>${money(opening)}</strong></div>
    <div class="cash-row"><span>Ventas efectivo</span><strong>${money(cashSales)}</strong></div>
    <div class="cash-row"><span>Ventas QR</span><strong>${money(cardSales)}</strong></div>
    <div class="cash-row"><span>Efectivo esperado</span><strong>${money(expected)}</strong></div>
    <div class="cash-row"><span>Diferencia</span><strong class="${Math.abs(diff) > 10 ? "danger-text" : ""}">${money(diff)}</strong></div>
  `;
}

function switchView(view) {
  document.querySelectorAll(".view").forEach((section) => section.classList.toggle("active", section.id === view));
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $("#pageTitle").textContent = document.querySelector(`[data-view="${view}"]`).textContent.trim().replace(/^\d+\s*/, "");
  renderAll();
}

function renderAll() {
  renderMetrics();
  renderInventory();
  renderExpiry("#dashboardExpiry", 4);
  renderExpiry("#expiryRows");
  renderSales();
  renderPosProducts();
  renderCart();
  renderCashSummary(cashState ?? {});
}

function setPublicScreen(screen, historyMode = "replace") {
  const target = ["home", "login", "register"].includes(screen) ? screen : "home";
  $("#homeScreen").classList.toggle("hidden", target !== "home");
  $("#loginScreen").classList.toggle("hidden", target !== "login");
  $("#registerScreen").classList.toggle("hidden", target !== "register");
  $("#appShell").classList.add("locked");

  if (historyMode !== "none") {
    const method = historyMode === "push" ? "pushState" : "replaceState";
    const url = target === "home" ? `${location.pathname}${location.search}` : `#${target}`;
    history[method]({ publicScreen: target }, "", url);
  }

  window.scrollTo({ top: 0, behavior: "auto" });
}

function showLoginScreen() {
  setPublicScreen("login", "push");
}

function showHomeScreen() {
  setPublicScreen("home", "replace");
}

function showRegisterScreen() {
  setPublicScreen("register", "push");
}

function setAuthenticated(isAuthenticated) {
  if (isAuthenticated) {
    $("#homeScreen").classList.add("hidden");
    $("#registerScreen").classList.add("hidden");
    $("#loginScreen").classList.add("hidden");
    $("#appShell").classList.remove("locked");
    sessionStorage.setItem(SESSION_KEY, "active");
    history.replaceState({ app: true }, "", "#dashboard");
    setDefaultExpiryDate();
    renderAll();
    return;
  }

  sessionStorage.removeItem(SESSION_KEY);
  setPublicScreen("home", "replace");
}

function buildRegistrationMessage(data) {
  return [
    "Hola, quiero registrar mi farmacia en FarmaGest.",
    "",
    `Nombre completo: ${data.fullName}`,
    `Correo electronico: ${data.email}`,
    `Celular: ${data.phone}`,
    `Nombre de la farmacia: ${data.clinicName}`,
    `Ciudad: ${data.city}`,
    `Plan: ${data.plan}`,
  ].join("\n");
}

function setDefaultExpiryDate() {
  const expiryInput = document.querySelector('[name="expiry"]');
  if (!expiryInput || expiryInput.value) return;

  const defaultDate = new Date("2026-08-26T00:00:00");
  defaultDate.setMonth(defaultDate.getMonth() + 6);
  expiryInput.value = defaultDate.toISOString().slice(0, 10);
  expiryInput.min = "2026-08-26";
}

$("#loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const email = data.get("email").trim().toLowerCase();
  const password = data.get("password");

  if (email === demoUser.email && password === demoUser.password) {
    loadCart();
    setAuthenticated(true);
    toast("Sesion iniciada correctamente.");
    return;
  }

  toast("Email o clave incorrectos.");
});

$("#homeLogin").addEventListener("click", showLoginScreen);
$("#homeRegister").addEventListener("click", showRegisterScreen);
$("#homeRegisterTop").addEventListener("click", showRegisterScreen);
$("#homeContactRegister").addEventListener("click", showRegisterScreen);
$("#aboutRegister").addEventListener("click", showRegisterScreen);
$("#sectorsRegister").addEventListener("click", showRegisterScreen);
$("#backHome").addEventListener("click", showHomeScreen);
$("#loginBrandHome").addEventListener("click", showHomeScreen);
$("#registerBackHome").addEventListener("click", showHomeScreen);

window.addEventListener("popstate", (event) => {
  if (sessionStorage.getItem(SESSION_KEY) === "active") return;
  setPublicScreen(event.state?.publicScreen ?? "home", "none");
});

$("#registerForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const raw = new FormData(form);
  const data = {
    fullName: String(raw.get("fullName") ?? "").trim().slice(0, 120),
    email: String(raw.get("email") ?? "").trim().toLowerCase().slice(0, 120),
    phone: String(raw.get("phone") ?? "").trim().slice(0, 40),
    clinicName: String(raw.get("clinicName") ?? "").trim().slice(0, 120),
    city: String(raw.get("city") ?? "").trim().slice(0, 80),
    plan: String(raw.get("plan") ?? "").trim(),
  };
  const phoneDigits = data.phone.replace(/\D/g, "");

  if (!data.fullName || !data.email || !data.phone || !data.clinicName || !data.city || !data.plan) {
    toast("Completa todos los datos del registro.");
    return;
  }

  if (phoneDigits.length < 7) {
    toast("Ingresa un celular valido.");
    return;
  }

  const message = encodeURIComponent(buildRegistrationMessage(data));
  const number = WHATSAPP_REGISTRATION_NUMBER.trim();
  const url = number ? `https://wa.me/${number}?text=${message}` : `https://wa.me/?text=${message}`;
  window.open(url, "_blank", "noopener,noreferrer");
  toast("Registro listo para enviar por WhatsApp.");
});

$("#logoutButton").addEventListener("click", () => {
  setAuthenticated(false);
  toast("Sesion cerrada.");
});

$("#dashboardLogout").addEventListener("click", () => {
  setAuthenticated(false);
  toast("Sesion cerrada.");
});

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

$("#quickSale").addEventListener("click", () => switchView("ventas"));
$("#globalSearch").addEventListener("input", renderAll);

$("#productForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const stock = Number(data.get("stock"));
  const min = Number(data.get("min"));
  const price = Number(data.get("price"));
  const name = data.get("name").trim().slice(0, 120);
  const presentation = data.get("presentation").trim().slice(0, 120);
  const laboratory = data.get("laboratory").trim().slice(0, 80);
  const unit = data.get("unit").trim();
  const lot = data.get("lot").trim().slice(0, 40);
  const expiry = data.get("expiry");

  if (
    !name ||
    !presentation ||
    !laboratory ||
    !unit ||
    !lot ||
    !expiry ||
    !Number.isFinite(stock) ||
    !Number.isFinite(min) ||
    !Number.isFinite(price) ||
    stock <= 0 ||
    min < 0 ||
    price < 0
  ) {
    toast("Datos invalidos para crear producto.");
    return;
  }

  if (daysTo(expiry) < 0) {
    toast("No puedes registrar un producto ya vencido.");
    return;
  }

  products.push({
    code: `MED-${String(products.length + 1).padStart(4, "0")}`,
    name,
    laboratory,
    presentation,
    unit,
    stock,
    min,
    price,
    lot,
    expiry,
  });
  event.currentTarget.reset();
  saveState();
  renderAll();
  toast("Producto agregado al inventario.");
});

$("#restockDemo").addEventListener("click", () => {
  products.forEach((product) => {
    if (product.stock <= product.min) product.stock += 24;
  });
  saveState();
  renderAll();
  toast("Reposicion aplicada a productos bajos.");
});

$("#posProducts").addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (button) addToCart(button.dataset.add);
});

$("#cartRows").addEventListener("click", (event) => {
  const inc = event.target.closest("[data-inc]");
  const dec = event.target.closest("[data-dec]");
  if (inc) changeQty(inc.dataset.inc, 1);
  if (dec) changeQty(dec.dataset.dec, -1);
});

document.querySelectorAll("[data-pay]").forEach((button) => {
  button.addEventListener("click", () => completeSale(button.dataset.pay));
});

$("#cashForm").addEventListener("submit", (event) => {
  event.preventDefault();
  renderCashSummary(Object.fromEntries(new FormData(event.currentTarget)));
  toast("Arqueo calculado.");
});

loadState();
loadCart();
if (sessionStorage.getItem(SESSION_KEY) === "active") {
  setAuthenticated(true);
} else if (location.hash === "#login") {
  setPublicScreen("login", "replace");
} else if (location.hash === "#register") {
  setPublicScreen("register", "replace");
} else {
  setPublicScreen("home", "replace");
}
