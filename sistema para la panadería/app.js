const STORAGE_KEY = "gestion-panaderia-v1";
const ADMIN_DEFAULT_PASSWORD = "12345678";
const ADMIN_CREDENTIAL_VERSION = 3;
const sections = [
  ["inicio", "Inicio", "⌂", ["dueño", "cajero", "producción", "encargado-caja", "encargado-tortas", "encargado-stock"]],
  ["ventas", "Ventas", "▣", ["dueño", "cajero", "encargado-caja"]],
  ["productos", "Productos", "◈", ["dueño"]],
  ["recetas", "Recetas", "▧", ["dueño", "producción", "encargado-tortas"]],
  ["insumos", "Insumos y compras", "▤", ["dueño", "producción", "encargado-stock"]],
  ["pedidos", "Pedidos especiales", "◷", ["dueño", "cajero", "producción", "encargado-tortas"]],
  ["caja", "Cierre de caja", "▣", ["dueño", "cajero", "encargado-caja"]],
  ["reportes", "Reportes", "▥", ["dueño"]],
  ["personal", "Personal y proveedores", "♙", ["dueño"]]
];
const positions = [
  "Vendedor / Personal de Atención",
  "Panadero",
  "Facturero",
  "Cajero",
  "Encargado de Caja",
  "Encargado de Tortas/Tartas",
  "Encargado de Stock",
  "Dueño"
];
const accessPositions = positions.slice(3);
const employeeAccessPositions = accessPositions.filter(position => position !== "Dueño");
const roleNames = {
  dueño: "Dueño / Administrador",
  cajero: "Cajero",
  producción: "Encargado de producción",
  "encargado-caja": "Encargado de Caja",
  "encargado-tortas": "Encargado de Tortas/Tartas",
  "encargado-stock": "Encargado de Stock",
  "sin-acceso": "Sin acceso"
};
const roleForPosition = {
  Cajero: "cajero",
  "Encargado de Caja": "encargado-caja",
  "Encargado de Tortas/Tartas": "encargado-tortas",
  "Encargado de Stock": "encargado-stock",
  Dueño: "dueño"
};
const blankState = () => ({
  users: [], employees: [], products: [], recipes: [], ingredients: [], suppliers: [], purchases: [],
  stockEntries: [], orders: [], sales: [], closures: [], activeUser: null, activeShift: "Mañana"
});
let state;
let currentSection = "inicio";
let cart = [];
let toastTimer;
let filterText = "";
let reportPeriod = "month";
let storageProblem = "";
 
const app = document.getElementById("app");
const toastNode = document.getElementById("toast");
const authScreen = document.getElementById("auth-screen");
const setupPanel = document.getElementById("setup-panel");
const loginPanel = document.getElementById("login-panel");

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      const backup = JSON.parse(localStorage.getItem(`${STORAGE_KEY}-daily-backup`) || "null");
      if (backup?.state?.users) {
        storageProblem = `Se recuperó la copia diaria del ${backup.date}.`;
        return { ...blankState(), ...backup.state, activeUser: null };
      }
      return blankState();
    }
    const parsed = JSON.parse(saved);
    const initial = blankState();
    for (const key of Object.keys(initial)) {
      if (key in parsed) initial[key] = parsed[key];
    }
    if (!Array.isArray(initial.users) || !Array.isArray(initial.products)) {
      throw new Error("Los datos guardados no tienen el formato esperado.");
    }
    initial.activeUser = null;
    return initial;
  } catch (error) {
    try {
      const backup = JSON.parse(localStorage.getItem(`${STORAGE_KEY}-daily-backup`) || "null");
      if (backup?.state?.users) {
        storageProblem = `Se recuperó la copia diaria del ${backup.date}.`;
        return { ...blankState(), ...backup.state, activeUser: null };
      }
    } catch (backupError) {
      storageProblem = `Falló la lectura de los datos (${error.message}) y de la copia diaria (${backupError.message}).`;
      return blankState();
    }
    storageProblem = `No se pudieron leer los datos guardados (${error.message}) y no hay una copia diaria recuperable.`;
    return blankState();
  }
}

function saveState(message) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    notify(`No se pudieron guardar los cambios: ${error.message}`, true);
    return false;
  }
  storageProblem = "";
  if (message) notify(message);
  try {
    localStorage.setItem(`${STORAGE_KEY}-daily-backup`, JSON.stringify({ date: today(), state }));
  } catch (error) {
    notify(`Los datos se guardaron, pero falló la copia diaria: ${error.message}`, true);
  }
  return true;
}

function notify(message, error = false) {
  toastNode.textContent = message;
  toastNode.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastNode.className = "toast", 3200);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function money(value) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localTimestamp() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

function dateLabel(value, withTime = false) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return new Intl.DateTimeFormat("es-AR", withTime
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeIdentity(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

function positionForUser(user) {
  return state.employees?.find(employee => employee.id === user.employeeId)?.position || user.position || (user.role === "dueño" ? "Dueño" : "");
}

function roleForUserPosition(position) {
  const matchingPosition = Object.keys(roleForPosition).find(item => normalizeIdentity(item) === normalizeIdentity(position));
  return matchingPosition ? roleForPosition[matchingPosition] : null;
}

function hasAdminAccount(data) {
  return data.users.some(user => user.role === "dueño");
}

function migrateUserRoles(data) {
  let changed = false;
  const usernames = new Set();
  for (const user of data.users) {
    const employee = data.employees.find(item => item.id === user.employeeId);
    const position = employee?.position || user.position;
    if (!user.username || usernames.has(normalizeIdentity(user.username))) {
      const base = String(user.name || "usuario").trim().replace(/\s+/g, " ").slice(0, 30) || "usuario";
      let username = base;
      let suffix = 2;
      while (usernames.has(normalizeIdentity(username))) {
        const ending = `-${suffix++}`;
        username = `${base.slice(0, 30 - ending.length)}${ending}`;
      }
      user.username = username;
      changed = true;
    }
    usernames.add(normalizeIdentity(user.username));
    if (user.role === "dueño") {
      user.position = "Dueño";
      if (employee) employee.position = "Dueño";
      continue;
    }
    const role = roleForUserPosition(position);
    const nextRole = role && role !== "dueño" ? role : "sin-acceso";
    if (user.role !== nextRole) {
      user.role = nextRole;
      changed = true;
    }
  }
  if (data.users.find(user => user.id === data.activeUser)?.role === "sin-acceso") {
    data.activeUser = null;
    changed = true;
  }
  return changed;
}

function positionOptionsHtml(selected = "", availablePositions = positions) {
  const options = [...new Set([...availablePositions, ...(selected ? [selected] : [])])];
  return `<option value="" disabled ${selected ? "" : "selected"}>Elegí un puesto</option>${options.map(position => `<option value="${esc(position)}" ${position === selected ? "selected" : ""}>${esc(position)}</option>`).join("")}`;
}

function positionField(selected = "", availablePositions = positions) {
  return `<label class="field"><span>Puesto</span><select class="select" name="position" required>${positionOptionsHtml(selected, availablePositions)}</select></label>`;
}

function isProductionRole(role = activeUser()?.role) {
  return ["producción", "encargado-tortas", "encargado-stock"].includes(role);
}

function hashPassword(password, salt) {
  if (!window.crypto?.subtle) return Promise.reject(new Error("El navegador no permite proteger contraseñas en este contexto. Abrí la aplicación desde localhost."));
  return crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"])
    .then(key => crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 120000, hash: "SHA-256" }, key, 256))
    .then(buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join(""));
}

function legacyPasswordHash(password, salt) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${password}`))
    .then(buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join(""));
}

function activeUser() {
  return state.users.find(user => user.id === state.activeUser) || null;
}

function can(section) {
  const user = activeUser();
  return user && sections.find(item => item[0] === section)?.[3].includes(user.role);
}

function pageHeader(title, description, actions = "") {
  const backButton = currentSection === "inicio" ? "" : `<button class="button back-button" data-action="back-home" aria-label="Volver a Inicio" title="Volver a Inicio">←</button>`;
  return `<div class="page-head"><div class="page-title-group">${backButton}<div><h1>${title}</h1><p>${description}</p></div></div><div class="head-actions">${actions}</div></div>`;
}

function button(label, action, primary = false, extra = "") {
  return `<button class="button${primary ? " primary" : ""} ${extra}" data-action="${action}">${label}</button>`;
}

function appFrame(content) {
  const user = activeUser();
  const items = sections.filter(item => item[3].includes(user.role)
    && ["inicio", "personal"].includes(item[0]));
  return `<div class="shell">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><div class="brand-mark">♨</div><div><div class="brand-name">La Panadería</div><div class="brand-sub">Gestión diaria</div></div></div>
      <div class="nav-label">Menú principal</div>
      <nav class="nav">${items.map(([id, label, icon]) => `<button class="${currentSection === id ? "active" : ""}" data-section="${id}"><span class="nav-icon">${icon}</span>${id === "insumos" && user.role !== "dueño" ? "Insumos" : label}</button>`).join("")}</nav>
      <div class="sidebar-bottom">
        <div class="local-note"><strong>Guardado en este dispositivo</strong>${user.role === "dueño" ? "Los datos se conservan en este navegador. Descargá una copia de seguridad desde Inicio." : "Los datos se conservan en este navegador de la panadería."}</div>
        <div class="user-chip"><div class="avatar">${esc(user.name.slice(0, 1).toUpperCase())}</div><div><div class="user-name">${esc(user.name)}</div><div class="user-role">${roleNames[user.role]}</div></div><button class="logout" data-action="logout" title="Cerrar sesión">↪</button></div>
      </div>
    </aside>
    <main class="main">
      <header class="topbar"><div class="top-actions"><button class="button mobile-menu" data-action="menu">☰</button><div><div class="eyebrow">Sistema de gestión</div><div class="topbar-date">${new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</div></div></div><div class="top-actions"><span class="badge green">${esc(state.activeShift)}</span></div></header>
      <div class="content">${content}</div>
    </main>
  </div>`;
}

function lowStock() {
  return state.ingredients.filter(item => Number(item.minimum) > 0 && Number(item.stock) <= Number(item.minimum));
}

function todaySales() {
  return state.sales.filter(sale => sale.date.slice(0, 10) === today());
}

function totalSales(sales) {
  return sales.reduce((total, sale) => total + Number(sale.total), 0);
}

function recentActivity() {
  const events = [
    ...(isProductionRole() ? [] : state.sales.map(sale => ({ date: sale.date, label: `Venta ${sale.number}`, detail: `${sale.items.length} productos · ${sale.payment}`, amount: sale.total }))),
    ...state.orders.map(order => ({ date: `${order.createdAt}T12:00:00`, label: `Pedido ${order.customer}`, detail: `Entrega ${dateLabel(order.dueDate)} · ${order.status}`, amount: isProductionRole() ? null : order.total }))
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  if (!events.length) return `<div class="empty">Todavía no hay movimientos registrados.</div>`;
  return `<div class="activity-list">${events.map(item => `<div class="shift-balance"><div><strong>${esc(item.label)}</strong><span class="subtext">${esc(item.detail)}</span></div>${item.amount == null ? "" : `<strong>${money(item.amount)}</strong>`}</div>`).join("")}</div>`;
}

function homeView() {
  const todayItems = todaySales();
  const pending = state.orders.filter(order => order.status === "Pendiente");
  const alerts = lowStock();
  const products = state.products.filter(item => item.active !== false).length;
  const isProduction = isProductionRole();
  const actions = activeUser().role === "dueño" ? `<button class="button" data-action="backup">↓ Copia de seguridad</button>` : "";
  const quickLinks = [
    ["ventas", "🧾", "Registrar una venta", "Cobrá en efectivo, tarjeta o billetera"],
    ["productos", "🌽", "Productos", "Administrá el catálogo y los precios"],
    ["recetas", "📗", "Recetas", "Consultá las instrucciones de elaboración"],
    ["insumos", "🌾", activeUser().role === "dueño" ? "Insumos y compras" : "Insumos", "Controlá existencias y niveles mínimos"],
    ["pedidos", "🎂", "Pedidos especiales", "Consultá y gestioná los encargos"],
    ["caja", "📒", "Cierre de caja", "Revisá los ingresos y cerrá el turno"],
    ["reportes", "📕", "Reportes", "Consultá las ventas por período"]
  ].filter(([section]) => can(section));
  const firstStat = isProduction
    ? `<div class="stat"><div class="stat-top">Insumos registrados <span class="stat-icon">▤</span></div><div class="stat-value">${state.ingredients.length}</div><div class="stat-foot">Materias primas en inventario</div></div>`
    : `<div class="stat"><div class="stat-top">Ventas de hoy <span class="stat-icon">↗</span></div><div class="stat-value">${money(totalSales(todayItems))}</div><div class="stat-foot">${todayItems.length} operaciones registradas</div></div>`;
  return `${pageHeader(`Buen día, ${esc(activeUser().name.split(" ")[0])}`, "Un resumen claro de lo que pasa hoy en la panadería.", actions)}
    ${storageProblem ? `<div class="notice" style="margin-bottom:16px">${esc(storageProblem)}</div>` : ""}
    <div class="grid stats">
      ${firstStat}
      <div class="stat"><div class="stat-top">Pedidos pendientes <span class="stat-icon">◷</span></div><div class="stat-value">${pending.length}</div><div class="stat-foot">${pending.filter(order => order.dueDate === today()).length} con entrega para hoy</div></div>
      <div class="stat"><div class="stat-top">Alertas de insumos <span class="stat-icon">!</span></div><div class="stat-value">${alerts.length}</div><div class="stat-foot">${alerts.length ? "Revisá los niveles mínimos" : "Todo por encima del mínimo"}</div></div>
      <div class="stat"><div class="stat-top">Productos activos <span class="stat-icon">◈</span></div><div class="stat-value">${products}</div><div class="stat-foot">Catálogo de venta</div></div>
    </div>
    <div class="grid dashboard-grid">
            <section class="card"><div class="card-head"><h2>Funciones</h2></div><div class="card-body"><div class="quick-grid">
        ${quickLinks.map(([section, icon, title, description]) => `<button class="quick-link" data-section="${section}"><span class="quick-icon">${icon}</span><strong>${title}</strong><small>${description}</small></button>`).join("")}
      </div></div></section>
      <section class="card"><div class="card-head"><h2>Alertas de stock</h2><span>${alerts.length} insumos</span></div><div class="card-body">${alerts.length ? `<div class="alert-list">${alerts.map(item => `<div class="alert-item critical"><span class="alert-dot"></span><span><strong>Queda poco ${esc(item.name)}.</strong><br>Stock: ${item.stock} ${esc(item.unit)} · mínimo: ${item.minimum} ${esc(item.unit)}.</span></div>`).join("")}</div>` : `<div class="empty">No hay insumos por debajo del nivel mínimo.</div>`}</div></section>
      <section class="card"><div class="card-head"><h2>Actividad reciente</h2><span>Últimos movimientos</span></div><div class="card-body">${recentActivity()}</div></section>
      <section class="card"><div class="card-head"><h2>Pedidos próximos</h2><span>Por fecha de entrega</span></div><div class="card-body">${pendingOrdersPreview()}</div></section>
    </div>`;
}

function pendingOrdersPreview() {
  const list = state.orders.filter(order => order.status === "Pendiente").sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4);
  if (!list.length) return `<div class="empty">No hay pedidos pendientes.</div>`;
  return list.map(order => `<div class="shift-balance"><div><strong>${esc(order.customer)}</strong><span class="subtext">${esc(order.productName)} · ${order.quantity} · ${dateLabel(order.dueDate)}</span></div><span class="badge ${order.dueDate === today() ? "gold" : ""}">${order.dueDate === today() ? "Hoy" : esc(order.status)}</span></div>`).join("");
}

function productRows() {
  if (!state.products.length) return `<tr><td colspan="6"><div class="empty">Todavía no hay productos. Cargá el catálogo y sus precios para empezar a vender.</div></td></tr>`;
  return state.products.filter(item => item.name.toLowerCase().includes(filterText.toLowerCase())).map(item => `<tr>
    <td><strong>${esc(item.name)}</strong></td><td>${esc(item.type)}</td><td>${money(item.price)} <span class="subtext">por ${esc(item.unit || "unidad")}</span></td><td>${item.stock === "" || item.stock == null ? "—" : esc(item.stock)}</td>
    <td><span class="badge ${item.active === false ? "red" : "green"}">${item.active === false ? "Inactivo" : "Activo"}</span></td>
    <td><div class="table-actions"><button class="button small" data-action="edit-product" data-id="${esc(item.id)}">Editar</button><button class="button small" data-action="toggle-product" data-id="${esc(item.id)}">${item.active === false ? "Activar" : "Desactivar"}</button></div></td>
  </tr>`).join("");
}

function productsView() {
  return `${pageHeader("Productos", "Administrá panes, tortas, combos y sus precios.", button("+ Nuevo producto", "new-product", true))}
    <section class="card"><div class="toolbar"><input class="input" id="search" placeholder="Buscar producto..." value="${esc(filterText)}"><select class="select" id="product-filter"><option value="all">Todos los tipos</option><option>Diario</option><option>Variable</option><option>Combo</option></select><span class="subtext">${state.products.length} productos</span></div>
    <div class="table-wrap"><table><thead><tr><th>Producto</th><th>Tipo</th><th>Precio</th><th>Stock</th><th>Estado</th><th></th></tr></thead><tbody id="product-rows">${productRows()}</tbody></table></div></section>`;
}

function ingredientsView() {
  const list = state.ingredients.filter(item => item.name.toLowerCase().includes(filterText.toLowerCase()));
  const rows = list.length ? list.map(item => `<tr><td><strong>${esc(item.name)}</strong></td><td>${esc(item.stock)} ${esc(item.unit)}</td><td>${esc(item.minimum)} ${esc(item.unit)}</td><td>${Number(item.minimum) > 0 && Number(item.stock) <= Number(item.minimum) ? `<span class="badge red">Reponer</span>` : `<span class="badge green">En nivel</span>`}</td><td><div class="table-actions"><button class="button small" data-action="stock-entry" data-id="${esc(item.id)}">Ingresar stock</button>${activeUser().role === "dueño" ? `<button class="button small" data-action="edit-ingredient" data-id="${esc(item.id)}">Editar</button>` : ""}</div></td></tr>`).join("") : `<tr><td colspan="5"><div class="empty">Todavía no hay insumos cargados. Registrá materias primas y su nivel mínimo.</div></td></tr>`;
  const isOwner = activeUser().role === "dueño";
  const stats = isOwner
    ? `<div class="grid stats"><div class="stat"><div class="stat-top">Insumos registrados <span class="stat-icon">▤</span></div><div class="stat-value">${state.ingredients.length}</div><div class="stat-foot">Inventario de materias primas</div></div><div class="stat"><div class="stat-top">Necesitan reposición <span class="stat-icon">!</span></div><div class="stat-value">${lowStock().length}</div><div class="stat-foot">En el mínimo o por debajo</div></div><div class="stat"><div class="stat-top">Proveedores <span class="stat-icon">♙</span></div><div class="stat-value">${state.suppliers.length}</div><div class="stat-foot">Contactos registrados</div></div><div class="stat"><div class="stat-top">Compras registradas <span class="stat-icon">↘</span></div><div class="stat-value">${state.purchases.length}</div><div class="stat-foot">Entradas de mercadería</div></div></div>`
    : `<div class="grid stats"><div class="stat"><div class="stat-top">Insumos registrados <span class="stat-icon">▤</span></div><div class="stat-value">${state.ingredients.length}</div><div class="stat-foot">Inventario de materias primas</div></div><div class="stat"><div class="stat-top">Necesitan reposición <span class="stat-icon">!</span></div><div class="stat-value">${lowStock().length}</div><div class="stat-foot">En el mínimo o por debajo</div></div></div>`;
  return `${pageHeader("Insumos y compras", "Controlá materias primas, niveles mínimos y entradas de mercadería.", `${isOwner ? button("+ Nuevo insumo", "new-ingredient", true) : ""}${isOwner ? button("+ Proveedor", "new-supplier") : ""}`)}
    ${stats}
    <section class="card"><div class="card-head"><h2>Existencias</h2><span>${state.ingredients.length} insumos</span></div><div class="toolbar"><input class="input" id="search" placeholder="Buscar insumo..." value="${esc(filterText)}"></div><div class="table-wrap"><table><thead><tr><th>Insumo</th><th>Stock actual</th><th>Stock mínimo</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section>
    <section class="card" style="margin-top:16px"><div class="card-head"><h2>Ingresos de mercadería</h2><span>${state.stockEntries.length} entradas</span></div>${state.stockEntries.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Insumo</th><th>Cantidad</th><th>Proveedor</th><th>Registró</th></tr></thead><tbody>${state.stockEntries.slice().reverse().slice(0,20).map(entry => `<tr><td>${dateLabel(entry.date)}</td><td>${esc(entry.ingredientName)}</td><td>${esc(entry.quantity)} ${esc(entry.unit)}</td><td>${esc(entry.supplier || "—")}</td><td>${esc(entry.userName)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Todavía no hay ingresos registrados.</div>`}</section>
    ${isOwner ? `<section class="card" style="margin-top:16px"><div class="card-head"><h2>Registro de compras</h2><button class="button small" data-action="new-purchase" ${state.suppliers.length ? "" : "disabled"}>+ Registrar compra</button></div>${state.purchases.length ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Proveedor</th><th>Detalle</th><th>Monto</th></tr></thead><tbody>${state.purchases.slice().reverse().map(row => `<tr><td>${dateLabel(row.date)}</td><td>${esc(row.supplierName)}</td><td>${esc(row.detail)}</td><td>${money(row.amount)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">${state.suppliers.length ? "Todavía no hay compras registradas." : "Agregá un proveedor para registrar compras."}</div>`}</section>` : ""}`;
}

function ordersView() {
  const isProduction = isProductionRole();
  const list = state.orders.filter(order => `${order.customer} ${order.productName}`.toLowerCase().includes(filterText.toLowerCase()));
  const rows = list.length ? list.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(order => {
    const paid = Number(order.deposit) + Number(order.balancePaid || 0);
    const balance = Math.max(0, Number(order.total) - paid);
    const statusClass = order.status === "Entregado" ? "green" : order.status === "Cancelado" ? "red" : order.dueDate < today() ? "red" : "gold";
    const actions = `${order.status === "Pendiente" ? `<button class="button small" data-action="print-order-comanda" data-id="${esc(order.id)}">Comanda</button>` : ""}${!isProduction && order.status === "Pendiente" ? `<button class="button small" data-action="pay-balance" data-id="${esc(order.id)}" ${balance <= 0 ? "disabled" : ""}>Cobrar saldo</button><button class="button small" data-action="deliver-order" data-id="${esc(order.id)}">Entregar</button><button class="button small danger" data-action="cancel-order" data-id="${esc(order.id)}">Cancelar</button>` : ""}`;
    return `<tr><td><strong>${esc(order.customer)}</strong><span class="subtext">${esc(order.contact)}</span></td><td>${esc(order.productName)} <span class="subtext">Cantidad: ${esc(order.quantity)}</span></td><td>${dateLabel(order.dueDate)}</td>${isProduction ? "" : `<td>${money(order.total)}</td><td>${money(order.deposit)} <span class="subtext">Seña (50 %)</span></td><td>${money(balance)}</td>`}<td><span class="badge ${statusClass}">${esc(order.status)}</span></td><td><div class="table-actions">${actions}</div></td></tr>`;
  }).join("") : `<tr><td colspan="${isProduction ? 5 : 8}"><div class="empty">No hay pedidos especiales. Registrá encargos y programá la entrega.</div></td></tr>`;
  const columns = isProduction ? "<th>Cliente</th><th>Pedido</th><th>Entrega</th><th>Estado</th><th></th>" : "<th>Cliente</th><th>Pedido</th><th>Entrega</th><th>Total</th><th>Seña</th><th>Saldo</th><th>Estado</th><th></th>";
  return `${pageHeader("Pedidos especiales", "Agendá tortas y encargos. La seña se calcula en el 50 % del total.", isProduction ? "" : button("+ Nuevo pedido", "new-order", true))}
    <section class="card"><div class="toolbar"><input class="input" id="search" placeholder="Buscar por cliente o producto..." value="${esc(filterText)}"><span class="subtext">${state.orders.filter(order => order.status === "Pendiente").length} pedidos pendientes</span></div>
    <div class="table-wrap"><table><thead><tr>${columns}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function currentShiftSales() {
  const closed = state.closures.find(item => item.date === today() && item.shift === state.activeShift);
  if (closed) return [];
  return todaySales().filter(sale => sale.shift === state.activeShift);
}

function cashExpected(sales = currentShiftSales()) {
  return sales.filter(sale => sale.payment === "Efectivo").reduce((sum, sale) => sum + Number(sale.total), 0);
}

function electronicExpected(sales = currentShiftSales()) {
  return sales.filter(sale => sale.payment !== "Efectivo").reduce((sum, sale) => sum + Number(sale.total), 0);
}

function cashView() {
  const shiftSales = currentShiftSales();
  const closure = state.closures.find(item => item.date === today() && item.shift === state.activeShift);
  const shiftSelector = `<select class="select" id="shift-select"><option ${state.activeShift === "Mañana" ? "selected" : ""}>Mañana</option><option ${state.activeShift === "Tarde" ? "selected" : ""}>Tarde</option></select>`;
  return `${pageHeader("Cierre de caja", "Revisá los ingresos por medio de pago y cerrá tu turno.", shiftSelector)}
    <div class="grid dashboard-grid">
      <section class="card"><div class="card-head"><h2>Resumen del turno</h2><span>${dateLabel(today())} · ${esc(state.activeShift)}</span></div><div class="card-body">
        <div class="shift-balance"><span>Ventas registradas</span><strong>${shiftSales.length}</strong></div>
        <div class="shift-balance"><span>Efectivo esperado en el cajón</span><strong>${money(closure ? closure.expectedCash : cashExpected(shiftSales))}</strong></div>
        <div class="shift-balance"><span>Pagos electrónicos</span><strong>${money(closure ? closure.electronic : electronicExpected(shiftSales))}</strong></div>
        <div class="shift-balance"><span>Total del turno</span><strong>${money(closure ? closure.total : totalSales(shiftSales))}</strong></div>
        ${closure ? `<div class="notice" style="margin-top:15px">Turno cerrado. Efectivo contado: ${money(closure.countedCash)} · Diferencia: ${money(closure.difference)} · Registró ${esc(closure.userName)}.</div><div style="margin-top:12px"><button class="button" data-action="print-closure" data-id="${esc(closure.id)}">Imprimir cierre</button></div>` : `<div style="margin-top:16px">${button("Cerrar turno", "close-shift", true)}</div>`}
      </div></section>
      <section class="card"><div class="card-head"><h2>Movimientos del turno</h2><span>${shiftSales.length} ventas</span></div><div class="card-body">${shiftSales.length ? shiftSales.map(sale => `<div class="shift-balance"><div><strong>${dateLabel(sale.date, true)}</strong><span class="subtext">${sale.items.map(item => `${esc(item.name)} × ${item.quantity}`).join(", ")} · ${esc(sale.payment)}</span></div><strong>${money(sale.total)}</strong></div>`).join("") : `<div class="empty">${closure ? "Este turno ya está cerrado." : "Todavía no hay ventas en este turno."}</div>`}</div></section>
    </div>`;
}

function reportView() {
  const now = new Date();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const inPeriod = value => {
    const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
    if (reportPeriod === "day") return value.slice(0, 10) === today();
    if (reportPeriod === "week") return date >= weekStart;
    if (reportPeriod === "month") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    return date.getFullYear() === now.getFullYear();
  };
  const sales = state.sales.filter(sale => inPeriod(sale.date));
  const purchases = state.purchases.filter(purchase => inPeriod(purchase.date));
  const purchaseTotal = purchases.reduce((sum, purchase) => sum + Number(purchase.amount), 0);
  const grouped = {};
  for (const sale of sales) {
    const key = sale.payment;
    grouped[key] = (grouped[key] || 0) + Number(sale.total);
  }
  const products = {};
  for (const sale of sales.filter(item => !item.orderId)) for (const item of sale.items) products[item.name] = (products[item.name] || 0) + Number(item.quantity);
  const best = Object.entries(products).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const periodOptions = [["day", "Hoy"], ["week", "Esta semana"], ["month", "Este mes"], ["year", "Este año"]].map(([value, label]) => `<option value="${value}" ${reportPeriod === value ? "selected" : ""}>${label}</option>`).join("");
  return `${pageHeader("Reportes", "Consultá las ventas registradas en cada período.", `<select class="select" id="report-period">${periodOptions}</select><button class="button" data-action="export-sales">↓ Exportar ventas</button>`)}
    <div class="grid stats"><div class="stat"><div class="stat-top">Ventas del período <span class="stat-icon">↗</span></div><div class="stat-value">${money(totalSales(sales))}</div><div class="stat-foot">${sales.length} operaciones</div></div><div class="stat"><div class="stat-top">Efectivo <span class="stat-icon">●</span></div><div class="stat-value">${money(grouped.Efectivo || 0)}</div><div class="stat-foot">Cobros en efectivo</div></div><div class="stat"><div class="stat-top">Tarjeta <span class="stat-icon">▭</span></div><div class="stat-value">${money(grouped.Tarjeta || 0)}</div><div class="stat-foot">Cobros con tarjeta</div></div><div class="stat"><div class="stat-top">Billetera virtual <span class="stat-icon">▣</span></div><div class="stat-value">${money((grouped["Billetera virtual"] || 0) + (grouped.Transferencia || 0))}</div><div class="stat-foot">Billetera y transferencias</div></div><div class="stat"><div class="stat-top">Compras registradas <span class="stat-icon">↘</span></div><div class="stat-value">${money(purchaseTotal)}</div><div class="stat-foot">${purchases.length} compras</div></div><div class="stat"><div class="stat-top">Ventas menos compras <span class="stat-icon">＝</span></div><div class="stat-value">${money(totalSales(sales) - purchaseTotal)}</div><div class="stat-foot">No incluye otros costos</div></div></div>
    <div class="grid dashboard-grid"><section class="card"><div class="card-head"><h2>Productos vendidos</h2><span>Unidades / cantidades</span></div><div class="card-body">${best.length ? best.map(([name, quantity]) => `<div class="shift-balance"><strong>${esc(name)}</strong><span>${quantity}</span></div>`).join("") : `<div class="empty">Todavía no hay ventas para este período.</div>`}</div></section><section class="card"><div class="card-head"><h2>Últimas ventas</h2><span>Movimientos</span></div><div class="card-body">${sales.length ? sales.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7).map(sale => `<div class="shift-balance"><div><strong>${esc(sale.number)}</strong><span class="subtext">${dateLabel(sale.date, true)} · ${esc(sale.payment)}</span></div><strong>${money(sale.total)}</strong></div>`).join("") : `<div class="empty">No hay ventas registradas.</div>`}</div></section></div>`;
}

function peopleView() {
  const employees = (state.employees || []).map(employee => {
    const hasUser = state.users.some(user => user.employeeId === employee.id && user.role !== "sin-acceso");
    return `<tr><td><strong>${esc(employee.name)}</strong></td><td>${esc(employee.phone || "—")}</td><td>${esc(employee.position)}</td><td>${esc(employee.sector)}</td><td><span class="badge ${hasUser ? "green" : ""}">${hasUser ? "Sí" : "No"}</span></td></tr>`;
  }).join("") || `<tr><td colspan="5"><div class="empty">No hay empleados registrados.</div></td></tr>`;
  const users = state.users.filter(user => user.role !== "sin-acceso").map(user => `<tr><td><strong>${esc(user.name)}</strong><span class="subtext">Usuario: ${esc(user.username)} · ${esc(positionForUser(user))}</span></td><td>${roleNames[user.role]}</td><td><span class="badge ${user.id === state.activeUser ? "green" : ""}">${user.id === state.activeUser ? "Sesión actual" : "Activo"}</span></td><td>${user.id === state.activeUser ? "—" : `<button class="button small danger" data-action="delete-user" data-id="${esc(user.id)}">Eliminar</button>`}</td></tr>`).join("") || `<tr><td colspan="4"><div class="empty">No hay usuarios con acceso.</div></td></tr>`;
  const suppliers = state.suppliers.length ? state.suppliers.map(supplier => `<tr><td><strong>${esc(supplier.name)}</strong></td><td>${esc(supplier.contact || "—")}</td><td><span class="subtext">${esc(supplier.details || "")}</span></td><td><button class="button small danger" data-action="delete-supplier" data-id="${esc(supplier.id)}">Eliminar</button></td></tr>`).join("") : `<tr><td colspan="4"><div class="empty">No hay proveedores registrados.</div></td></tr>`;
  return `${pageHeader("Personal y proveedores", "Gestioná quién accede al sistema y los contactos de proveedores.", `${button("+ Nuevo empleado", "new-employee", true)}${button("+ Crear acceso", "new-user")}${button("+ Nuevo proveedor", "new-supplier")}${button("Restaurar copia", "restore-backup")}<input id="backup-file" type="file" accept="application/json,.json" hidden>`)}
    <section class="card"><div class="card-head"><h2>Empleados</h2><span>${state.employees.length} personas</span></div><div class="table-wrap"><table><thead><tr><th>Empleado</th><th>Teléfono</th><th>Puesto</th><th>Sector</th><th>Acceso</th></tr></thead><tbody>${employees}</tbody></table></div></section>
    <section class="card"><div class="card-head"><h2>Usuarios del sistema</h2><span>${state.users.length} cuentas</span></div><div class="table-wrap"><table><thead><tr><th>Empleado</th><th>Rol de acceso</th><th>Estado</th><th></th></tr></thead><tbody>${users}</tbody></table></div></section>
    <section class="card" style="margin-top:16px"><div class="card-head"><h2>Proveedores</h2><span>${state.suppliers.length} contactos</span></div><div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Teléfono</th><th>Datos de contacto</th><th></th></tr></thead><tbody>${suppliers}</tbody></table></div></section>
    <div class="notice" style="margin-top:16px">Permisos por puesto: vendedores, personal de atención, panaderos y factureros no acceden al sistema; cajeros registran ventas, pedidos y cierres; el encargado de caja accede a ventas y cierres; el encargado de tortas/tartas consulta recetas y pedidos; el encargado de stock registra entradas de insumos; el dueño administra catálogo, personal, proveedores y reportes.</div>`;
}

function recipesView() {
  const recipes = state.recipes || [];
  const isOwner = activeUser().role === "dueño";
  const content = recipes.length ? recipes.map(recipe => `<article class="card" style="margin-bottom:12px"><div class="card-head"><div><h2>${esc(recipe.name)}</h2><span>${recipe.productName ? `Producto: ${esc(recipe.productName)}` : "Receta de producción"}</span></div>${isOwner ? `<button class="button small" data-action="edit-recipe" data-id="${esc(recipe.id)}">Editar</button>` : ""}</div><div class="card-body" style="font-size:12px;line-height:1.7">${esc(recipe.instructions).replaceAll("\n", "<br>")}</div></article>`).join("") : `<section class="card"><div class="empty">Todavía no hay recetas registradas. El dueño puede cargar las instrucciones oficiales de producción.</div></section>`;
  return `${pageHeader("Recetas", "Consultá las instrucciones oficiales de elaboración.", isOwner ? button("+ Nueva receta", "new-recipe", true) : "")}${content}`;
}

function salesView() {
  const products = state.products.filter(item => item.active !== false && Number(item.price) > 0);
  const tiles = products.length ? products.map(item => `<button class="product-tile" data-action="add-cart" data-id="${esc(item.id)}"><span class="badge">${esc(item.type)}</span><strong>${esc(item.name)}</strong><small>${money(item.price)} / ${esc(item.unit || "unidad")}</small></button>`).join("") : `<div class="empty" style="grid-column:1/-1">No hay productos activos con precio cargado. Pedile al dueño que complete el catálogo.</div>`;
  const cartHtml = cart.length ? cart.map(item => `<div class="cart-row"><div><strong>${esc(item.name)}</strong><span class="subtext">${money(item.price)} por ${esc(item.unit || "unidad")}</span></div><div class="qty-control"><button data-action="cart-qty" data-id="${esc(item.id)}" data-delta="-1" aria-label="Quitar cantidad">−</button><span>${item.quantity} ${esc(item.unit || "unidad")}</span><button data-action="cart-qty" data-id="${esc(item.id)}" data-delta="1" aria-label="Agregar cantidad">+</button></div><strong>${money(item.price * item.quantity)}</strong></div>`).join("") : `<div class="empty">Agregá productos a la venta.</div>`;
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return `${pageHeader("Punto de venta", "Seleccioná los productos y registrá el medio de pago.", `<span class="badge green">${esc(state.activeShift)}</span>`)}
    <div class="pos-layout"><section class="card"><div class="toolbar"><input class="input" id="search" placeholder="Buscar producto..." value="${esc(filterText)}"><span class="subtext">${products.length} disponibles</span></div><div class="product-grid">${tiles}</div></section>
    <section class="card"><div class="card-head"><h2>Venta actual</h2><button class="button small ghost" data-action="clear-cart" ${cart.length ? "" : "disabled"}>Vaciar</button></div><div class="card-body">${cartHtml}<div class="cart-total"><span>Total</span><span>${money(total)}</span></div><label class="field"><span style="font-size:11px;font-weight:600">Medio de pago</span><select class="select" id="payment"><option>Efectivo</option><option>Tarjeta</option><option>Billetera virtual</option><option>Transferencia</option></select></label><button class="button primary" style="width:100%;margin-top:15px" data-action="checkout" ${cart.length ? "" : "disabled"}>Confirmar venta · ${money(total)}</button></div></section></div>
    <section class="card" style="margin-top:16px"><div class="card-head"><h2>Ventas recientes</h2><span>${todaySales().length} hoy</span></div>${todaySales().length ? `<div class="table-wrap"><table><thead><tr><th>Hora</th><th>Número</th><th>Productos</th><th>Pago</th><th>Total</th><th></th></tr></thead><tbody>${todaySales().slice().reverse().slice(0,6).map(sale => `<tr><td>${dateLabel(sale.date, true)}</td><td>${esc(sale.number)}</td><td>${sale.items.map(item => `${esc(item.name)} × ${item.quantity} ${esc(item.unit || "")}`).join(", ")}</td><td>${esc(sale.payment)}</td><td>${money(sale.total)}</td><td><div class="table-actions"><button class="button small" data-action="print-ticket" data-id="${esc(sale.id)}">Ticket</button><button class="button small" data-action="${sale.orderId ? "print-order-comanda" : "print-comanda"}" data-id="${esc(sale.orderId || sale.id)}">Comanda</button></div></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Las ventas aparecerán aquí al confirmar una operación.</div>`}</section>`;
}

function render() {
  if (!state.users.length) return renderSetup();
  if (!activeUser()) {
    state.activeUser = null;
    renderLogin();
    return;
  }
  if (authScreen) authScreen.hidden = true;
  app.hidden = false;
  if (!can(currentSection)) currentSection = "inicio";
  const views = {
    inicio: homeView, ventas: salesView, productos: productsView, recetas: recipesView,
    insumos: ingredientsView, pedidos: ordersView, caja: cashView,
    reportes: reportView, personal: peopleView
  };
  app.innerHTML = appFrame(views[currentSection]());
}

function renderSetup() {
  authScreen.hidden = false;
  setupPanel.hidden = false;
  loginPanel.hidden = true;
  app.hidden = true;
  const message = document.getElementById("setup-message");
  const errorNode = document.getElementById("setup-error");
  const clearButton = document.getElementById("clear-data-button");
  const existingLoginButton = document.getElementById("existing-login-button");
  message.textContent = storageProblem ? "No se pudo preparar el acceso inicial." : "Preparando la cuenta Admin…";
  message.hidden = false;
  errorNode.hidden = !storageProblem;
  errorNode.textContent = storageProblem && !state.users.length
    ? `${storageProblem} No se reemplazaron los datos encontrados. Si querés iniciar de nuevo, podés descartarlos explícitamente.`
    : storageProblem;
  clearButton.hidden = !storageProblem || state.users.length > 0;
  existingLoginButton.hidden = !storageProblem || state.users.length === 0;
}

function renderLogin() {
  authScreen.hidden = false;
  setupPanel.hidden = true;
  loginPanel.hidden = false;
  app.hidden = true;
  const errorNode = document.getElementById("login-error");
  errorNode.hidden = true;
  errorNode.textContent = "";
  const notice = document.getElementById("login-notice");
  notice.hidden = !storageProblem;
  notice.textContent = storageProblem;
  const defaultCredentialsNote = document.getElementById("default-admin-credentials-note");
  defaultCredentialsNote.hidden = !state.users.some(user => user.role === "dueño" && user.adminCredentialVersion === ADMIN_CREDENTIAL_VERSION);
}

async function ensureAdminAccount() {
  let user = state.users.find(item => item.role === "dueño");
  let employee = user && state.employees.find(item => item.id === user.employeeId);
  let createdUser = false;
  if (!user) {
    employee = { id: uid("empleado"), name: "Admin", phone: "", position: "Dueño", sector: "Administración" };
    user = {
      id: uid("user"), employeeId: employee.id, username: "Admin", name: employee.name,
      position: employee.position, role: "dueño"
    };
    state.employees.push(employee);
    state.users.push(user);
    createdUser = true;
  } else {
    user.name = "Admin";
    user.username = "Admin";
    user.position = "Dueño";
    if (employee) {
      employee.name = "Admin";
      employee.position = "Dueño";
    } else {
      employee = { id: uid("empleado"), name: "Admin", phone: "", position: "Dueño", sector: "Administración" };
      state.employees.push(employee);
      user.employeeId = employee.id;
    }
  }
  if (user.adminCredentialVersion !== ADMIN_CREDENTIAL_VERSION) {
    const salt = crypto.getRandomValues(new Uint8Array(16)).join("-");
    user.salt = salt;
    user.passwordHash = await hashPassword(ADMIN_DEFAULT_PASSWORD, salt);
    user.passwordAlgorithm = "PBKDF2";
    delete user.mustChangePassword;
    user.adminCredentialVersion = ADMIN_CREDENTIAL_VERSION;
  }
  if (!saveState()) {
    if (createdUser) {
      state.employees = state.employees.filter(item => item.id !== employee.id);
      state.users = state.users.filter(item => item.id !== user.id);
    }
    throw new Error("No se pudo guardar la cuenta Admin en este navegador. Revisá el espacio disponible y volvé a cargar la página.");
  }
  storageProblem = "";
}

function modal(title, body, options = {}) {
  const width = options.wide ? " wide" : "";
  app.insertAdjacentHTML("beforeend", `<div class="modal-backdrop" data-action="dismiss-modal"><section class="modal${width}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="modal-close" data-action="close-modal" aria-label="Cerrar">×</button></div>${body}</section></div>`);
  const backdrop = app.querySelector(".modal-backdrop");
  backdrop?.addEventListener("click", event => {
    if (event.target === backdrop) closeModal();
  });
  backdrop?.querySelector("input,select,textarea")?.focus();
}

function closeModal() {
  app.querySelector(".modal-backdrop")?.remove();
}

function field(label, name, value = "", options = {}) {
  const req = options.required ? "required" : "";
  const type = options.type || "text";
  const min = options.min != null ? `min="${esc(options.min)}"` : "";
  const step = options.step ? `step="${esc(options.step)}"` : "";
  const max = options.max != null ? `max="${esc(options.max)}"` : "";
  const minlength = options.minlength ? `minlength="${esc(options.minlength)}"` : "";
  const maxlength = options.maxlength ? `maxlength="${esc(options.maxlength)}"` : "";
  const input = options.textarea
    ? `<textarea class="textarea" name="${name}" rows="3" ${req} ${maxlength}>${esc(value)}</textarea>`
    : `<input class="input" name="${name}" type="${type}" value="${esc(value)}" ${req} ${min} ${max} ${step} ${minlength} ${maxlength} ${options.autocomplete ? `autocomplete="${options.autocomplete}"` : ""}>`;
  return `<label class="field${options.full ? " full" : ""}"><span>${label}</span>${input}${options.help ? `<small>${options.help}</small>` : ""}</label>`;
}

function selectField(label, name, options, value = "", required = true) {
  return `<label class="field"><span>${label}</span><select class="select" name="${name}" ${required ? "required" : ""}>${options.map(item => `<option value="${esc(item.value)}" ${item.value === value ? "selected" : ""}>${esc(item.label)}</option>`).join("")}</select></label>`;
}

function formModal(title, fields, onSubmit, options = {}) {
  modal(title, `<form class="modal-form" id="modal-form"><div class="form-grid">${fields}</div><div class="modal-foot"><button type="button" class="button" data-action="close-modal">Cancelar</button><button class="button primary" type="submit">${options.submitLabel || "Guardar"}</button></div></form>`, options);
  app.querySelector("#modal-form").addEventListener("submit", async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await onSubmit(values);
    } catch (error) {
      notify(error.message, true);
    }
  });
}

function productForm(product = null) {
  const types = ["Diario", "Variable", "Combo"].map(value => ({ value, label: value }));
  formModal(product ? "Editar producto" : "Nuevo producto", [
    field("Nombre del producto", "name", product?.name || "", { required: true, maxlength: 50 }),
    selectField("Tipo", "type", types, product?.type || "Diario"),
    selectField("Unidad de venta", "unit", [{ value: "unidad", label: "Unidad" }, { value: "kg", label: "Kilogramo (kg)" }], product?.unit || "unidad"),
    field("Precio de venta (ARS)", "price", product?.price ?? "", { required: true, type: "number", min: "0.01", step: "0.01" }),
    field("Stock disponible (opcional)", "stock", product?.stock ?? "", { type: "number", min: "0", step: "0.01", help: "Dejalo vacío si no se controla por unidades." })
  ], values => {
    const price = Number(values.price);
    if (!Number.isFinite(price) || price <= 0) throw new Error("Ingresá un precio mayor a cero.");
    if (values.stock !== "" && Number(values.stock) < 0) throw new Error("El stock no puede ser negativo.");
    if (product) Object.assign(product, { name: values.name.trim(), type: values.type, unit: values.unit, price, stock: values.stock === "" ? null : Number(values.stock) });
    else state.products.push({ id: uid("prod"), name: values.name.trim(), type: values.type, unit: values.unit, price, stock: values.stock === "" ? null : Number(values.stock), active: true });
    if (!saveState(product ? "Producto actualizado." : "Producto creado.")) return;
    closeModal(); render();
  });
}

function recipeForm(recipe = null) {
  const products = [{ value: "", label: "Sin producto asociado" }, ...state.products.map(item => ({ value: item.id, label: item.name }))];
  formModal(recipe ? "Editar receta" : "Nueva receta", [
    field("Nombre de la receta", "name", recipe?.name || "", { required: true, maxlength: 50 }),
    selectField("Producto relacionado", "productId", products, recipe?.productId || "", false),
    field("Instrucciones de preparación", "instructions", recipe?.instructions || "", { required: true, textarea: true, full: true, maxlength: 4000 })
  ], values => {
    const product = state.products.find(item => item.id === values.productId);
    if (recipe) Object.assign(recipe, { name: values.name.trim(), productId: product?.id || "", productName: product?.name || "", instructions: values.instructions.trim() });
    else state.recipes.push({ id: uid("receta"), name: values.name.trim(), productId: product?.id || "", productName: product?.name || "", instructions: values.instructions.trim() });
    if (!saveState(recipe ? "Receta actualizada." : "Receta registrada.")) return;
    closeModal(); render();
  }, { wide: true });
}

function ingredientForm(item = null) {
  formModal(item ? "Editar insumo" : "Nuevo insumo", [
    field("Nombre del insumo", "name", item?.name || "", { required: true, maxlength: 50 }),
    field("Unidad de medida", "unit", item?.unit || "kg", { required: true, maxlength: 12, help: "Por ejemplo, kg o unidades." }),
    field("Stock actual", "stock", item?.stock ?? "0", { required: true, type: "number", min: "0", step: "0.01" }),
    field("Stock mínimo", "minimum", item?.minimum ?? "0", { required: true, type: "number", min: "0", step: "0.01" })
  ], values => {
    const stock = Number(values.stock), minimum = Number(values.minimum);
    if (stock < 0 || minimum < 0) throw new Error("El stock no puede ser negativo.");
    if (item) Object.assign(item, { name: values.name.trim(), unit: values.unit.trim(), stock, minimum });
    else state.ingredients.push({ id: uid("ins"), name: values.name.trim(), unit: values.unit.trim(), stock, minimum });
    if (!saveState(item ? "Insumo actualizado." : "Insumo creado.")) return;
    closeModal(); render();
  });
}

function supplierForm() {
  formModal("Nuevo proveedor", [
    field("Nombre del contacto", "name", "", { required: true, maxlength: 50 }),
    field("Teléfono", "contact", "", { maxlength: 30 }),
    field("Otros datos de contacto", "details", "", { maxlength: 100, textarea: true, full: true })
  ], values => {
    state.suppliers.push({ id: uid("prov"), name: values.name.trim(), contact: values.contact.trim(), details: values.details.trim() });
    if (!saveState("Proveedor registrado.")) return;
    closeModal(); render();
  });
}

function purchaseForm() {
  if (!state.suppliers.length) return notify("Primero registrá un proveedor.", true);
  const suppliers = state.suppliers.map(item => ({ value: item.id, label: item.name }));
  const ingredients = state.ingredients.map(item => `<option value="${esc(item.id)}">${esc(item.name)} (${esc(item.unit)})</option>`).join("");
  formModal("Registrar compra", [
    selectField("Proveedor", "supplierId", suppliers),
    field("Fecha", "date", today(), { required: true, type: "date" }),
    field("Monto (ARS)", "amount", "", { required: true, type: "number", min: "0.01", step: "0.01" }),
    `<label class="field"><span>Insumo recibido (opcional)</span><select class="select" name="ingredientId"><option value="">Sin entrada de stock</option>${ingredients}</select></label>`,
    field("Cantidad ingresada (si seleccionás un insumo)", "quantity", "", { type: "number", min: "0.01", step: "0.01" }),
    field("Detalle", "detail", "", { maxlength: 100 })
  ], values => {
    const amount = Number(values.amount), quantity = Number(values.quantity);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Ingresá un monto válido.");
    if (values.ingredientId && (!Number.isFinite(quantity) || quantity <= 0)) throw new Error("Ingresá la cantidad recibida del insumo.");
    const supplier = state.suppliers.find(item => item.id === values.supplierId);
    const ingredient = state.ingredients.find(item => item.id === values.ingredientId);
    state.purchases.push({ id: uid("compra"), date: values.date, supplierId: supplier.id, supplierName: supplier.name, amount, detail: values.detail.trim() || (ingredient ? `${ingredient.name}: ${quantity} ${ingredient.unit}` : "Compra registrada") });
    if (ingredient) ingredient.stock = Number(ingredient.stock) + quantity;
    if (!saveState("Compra registrada y stock actualizado.")) return;
    closeModal(); render();
  }, { wide: true });
}

function stockEntryForm(item) {
  formModal(`Ingresar stock · ${item.name}`, [
    field(`Cantidad a ingresar (${item.unit})`, "quantity", "", { required: true, type: "number", min: "0.01", step: "0.01" }),
    field("Proveedor (opcional)", "supplier", "", { maxlength: 50 })
  ], values => {
    const quantity = Number(values.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Ingresá una cantidad mayor a cero.");
    const previousStock = Number(item.stock);
    item.stock = Number(item.stock) + quantity;
    const entry = { id: uid("ingreso"), date: today(), ingredientId: item.id, ingredientName: item.name, quantity, unit: item.unit, supplier: values.supplier.trim(), userId: activeUser().id, userName: activeUser().name };
    state.stockEntries.push(entry);
    if (!saveState(`Ingreso registrado: ${item.name}.`)) {
      item.stock = previousStock;
      state.stockEntries = state.stockEntries.filter(row => row.id !== entry.id);
      return;
    }
    closeModal(); render();
  });
}

function orderForm() {
  if (activeUser().role === "producción") return notify("El personal de producción puede consultar pedidos, pero no registrarlos.", true);
  const products = state.products.filter(item => item.active !== false && Number(item.price) > 0);
  if (!products.length) return notify("Cargá al menos un producto con precio para registrar el pedido.", true);
  const opts = products.map(item => ({ value: item.id, label: `${item.name} · ${money(item.price)}` }));
  formModal("Nuevo pedido especial", [
    field("Nombre del cliente", "customer", "", { required: true, maxlength: 50 }),
    field("Teléfono o contacto", "contact", "", { required: true, maxlength: 50 }),
    selectField("Producto", "productId", opts),
    field("Cantidad", "quantity", "1", { required: true, type: "number", min: "1", step: "1" }),
    field("Fecha de entrega", "dueDate", today(), { required: true, type: "date" }),
    field("Seña recibida (ARS)", "deposit", "", { required: true, type: "number", min: "0", step: "0.01", help: "Ingresá 0 si todavía no abonó. Si paga una seña, debe cubrir al menos el 50 %." }),
    selectField("Medio de pago de la seña", "payment", ["Efectivo", "Tarjeta", "Billetera virtual", "Transferencia"].map(value => ({ value, label: value })), "Efectivo")
  ], values => {
    const product = state.products.find(item => item.id === values.productId);
    const quantity = Number(values.quantity);
    const total = Number(product.price) * quantity;
    const deposit = Number(values.deposit);
    if (!product || !Number.isInteger(quantity) || quantity < 1) throw new Error("Revisá el producto y la cantidad.");
    if (deposit !== 0 && deposit < total * .5) throw new Error(`La seña debe cubrir al menos el 50 % (${money(total * .5)}), o ingresá 0 si todavía no abonó.`);
    if (deposit > total) throw new Error("La seña no puede superar el total del pedido.");
    if (values.dueDate < today()) throw new Error("La fecha de entrega no puede ser anterior a hoy.");
    if (deposit > 0 && state.closures.some(item => item.date === today() && item.shift === state.activeShift)) throw new Error("El turno está cerrado. Cambialo antes de registrar el cobro de la seña.");
    const order = { id: uid("pedido"), customer: values.customer.trim(), contact: values.contact.trim(), productId: product.id, productName: product.name, quantity, dueDate: values.dueDate, total, deposit, depositPayment: values.payment, balancePaid: 0, status: "Pendiente", createdAt: today() };
    state.orders.push(order);
    if (deposit > 0) state.sales.push({ id: uid("venta"), number: `V-${String(state.sales.length + 1).padStart(5, "0")}`, date: localTimestamp(), shift: state.activeShift, payment: values.payment, total: deposit, items: [{ name: `Seña de ${product.name}`, quantity: 1, price: deposit, subtotal: deposit }], userId: activeUser().id, userName: activeUser().name, orderId: order.id });
    if (!saveState("Pedido especial registrado con la seña.")) return;
    closeModal(); render();
  }, { wide: true });
}

function balanceForm(order) {
  if (state.closures.some(item => item.date === today() && item.shift === state.activeShift)) return notify("El turno está cerrado. Cambialo antes de cobrar el saldo.", true);
  const balance = Math.max(0, Number(order.total) - Number(order.deposit) - Number(order.balancePaid || 0));
  formModal(`Cobrar saldo · ${order.customer}`, [
    field("Saldo pendiente (ARS)", "balance", balance.toFixed(2), { required: true, type: "number", min: "0.01", step: "0.01" }),
    selectField("Medio de pago", "payment", ["Efectivo", "Tarjeta", "Billetera virtual", "Transferencia"].map(value => ({ value, label: value })), "Efectivo")
  ], values => {
    const paid = Number(values.balance);
    if (!Number.isFinite(paid) || paid < balance) throw new Error(`Para saldar el pedido, registrá al menos ${money(balance)}.`);
    if (paid > balance) throw new Error("El importe no puede superar el saldo pendiente.");
    order.balancePaid = Number(order.balancePaid || 0) + paid;
    order.balancePayment = values.payment;
    state.sales.push({ id: uid("venta"), number: `V-${String(state.sales.length + 1).padStart(5, "0")}`, date: localTimestamp(), shift: state.activeShift, payment: values.payment, total: paid, items: [{ name: `Saldo de ${order.productName}`, quantity: 1, price: paid, subtotal: paid }], userId: activeUser().id, userName: activeUser().name, orderId: order.id });
    if (!saveState("Saldo del pedido cobrado.")) return;
    closeModal(); render();
  });
}

function closeShiftForm() {
  const sales = currentShiftSales();
  const expected = cashExpected(sales);
  formModal("Cerrar turno de caja", [
    `<div class="field full"><div class="notice">Efectivo esperado: <strong>${money(expected)}</strong><br>Pagos electrónicos: <strong>${money(electronicExpected(sales))}</strong><br>Total de ventas: <strong>${money(totalSales(sales))}</strong></div></div>`,
    field("Efectivo contado en el cajón (ARS)", "countedCash", expected.toFixed(2), { required: true, type: "number", min: "0", step: "0.01" })
  ], values => {
    if (state.closures.some(item => item.date === today() && item.shift === state.activeShift)) throw new Error("Este turno ya está cerrado.");
    const counted = Number(values.countedCash);
    if (!Number.isFinite(counted) || counted < 0) throw new Error("Ingresá el efectivo contado.");
    const record = { id: uid("cierre"), date: today(), shift: state.activeShift, expectedCash: expected, countedCash: counted, difference: counted - expected, electronic: electronicExpected(sales), total: totalSales(sales), userId: activeUser().id, userName: activeUser().name };
    state.closures.push(record);
    if (!saveState("Cierre de turno registrado.")) {
      state.closures = state.closures.filter(item => item.id !== record.id);
      return;
    }
    if (record.shift === "Tarde") downloadBackup(true);
    closeModal(); render();
  });
}

function userForm() {
  formModal("Nuevo empleado", [
    field("Nombre y apellido", "name", "", { required: true, maxlength: 50 }),
    field("Teléfono", "phone", "", { maxlength: 20 }),
    positionField("", employeeAccessPositions),
    field("Sector", "sector", "", { required: true, maxlength: 50 }),
    field("Contraseña", "password", "", { required: true, type: "password", minlength: 8, help: "Mínimo 8 caracteres." })
  ], async values => {
    const employeeName = values.name.trim().replace(/\s+/g, " ");
    const username = values.username.trim().replace(/\s+/g, " ");
    if (!username) throw new Error("Ingresá un nombre de usuario.");
    if (state.users.some(user => normalizeIdentity(user.username) === normalizeIdentity(username))) {
      throw new Error("Ese nombre de usuario ya está en uso.");
    }
    const position = values.position.trim().replace(/\s+/g, " ");
    const role = roleForPosition[position];
    if (!role) throw new Error("Este puesto no tiene acceso al sistema. Registralo como empleado sin acceso.");
    if (role === "dueño" && state.users.some(user => user.role === "dueño")) {
      throw new Error("Ya existe una cuenta con puesto Dueño. No se pueden crear más usuarios con ese puesto.");
    }
    const normalizedName = normalizeIdentity(employeeName);
    const normalizedPosition = normalizeIdentity(position);
    if (state.users.some(user => normalizeIdentity(user.name) === normalizedName && normalizeIdentity(positionForUser(user)) === normalizedPosition)) {
      throw new Error("Ya existe un acceso con ese nombre y puesto.");
    }
    const salt = crypto.getRandomValues(new Uint8Array(16)).join("-");
    const passwordHash = await hashPassword(values.password, salt);
    let employee = state.employees.find(item =>
      normalizeIdentity(item.name) === normalizedName &&
      normalizeIdentity(item.position) === normalizedPosition &&
      !state.users.some(user => user.employeeId === item.id)
    );
    if (employee) {
      employee.phone = values.phone.trim() || employee.phone;
      employee.sector = values.sector.trim() || employee.sector;
    } else {
      employee = { id: uid("empleado"), name: employeeName, phone: values.phone.trim(), position, sector: values.sector.trim() };
      state.employees.push(employee);
    }
    state.users.push({ id: uid("user"), employeeId: employee.id, username, name: employee.name, position: employee.position, role, salt, passwordHash, passwordAlgorithm: "PBKDF2" });
    if (!saveState("Empleado agregado.")) return;
    closeModal(); render();
  });
}

function employeeForm() {
  formModal("Registrar empleado sin acceso", [
    field("Nombre y apellido", "name", "", { required: true, maxlength: 50 }),
    field("Teléfono", "phone", "", { maxlength: 20 }),
    positionField("", positions.slice(0, 3)),
    field("Sector", "sector", "", { required: true, maxlength: 50 })
  ], values => {
    state.employees.push({ id: uid("empleado"), name: values.name.trim(), phone: values.phone.trim(), position: values.position.trim(), sector: values.sector.trim() });
    if (!saveState("Empleado sin acceso registrado.")) return;
    closeModal(); render();
  });
}

function setupFormHandler() {
  document.getElementById("existing-login-button")?.addEventListener("click", renderLogin);
  document.getElementById("login-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const username = normalizeIdentity(values.username);
    const position = normalizeIdentity(values.position);
    const matches = state.users.filter(user => {
      const userPosition = positionForUser(user);
      return user.role !== "sin-acceso" &&
        normalizeIdentity(user.username) === username &&
        normalizeIdentity(userPosition) === position &&
        roleForUserPosition(userPosition) === user.role;
    });
    const errorNode = document.getElementById("login-error");
    const showError = () => {
      if (errorNode) {
        errorNode.textContent = "Usuario, puesto o contraseña incorrectos. Revisá los datos e intentá nuevamente.";
        errorNode.hidden = false;
      }
      notify("Usuario, puesto o contraseña incorrectos.", true);
    };
    if (matches.length !== 1) return showError();
    try {
      const user = matches[0];
      const candidate = await hashPassword(values.password, user.salt);
      if (candidate !== user.passwordHash) {
        const legacyCandidate = await legacyPasswordHash(values.password, user.salt);
        if (legacyCandidate !== user.passwordHash) return showError();
        user.passwordHash = candidate;
        user.passwordAlgorithm = "PBKDF2";
      }
      state.activeUser = user.id;
      if (!saveState()) {
        state.activeUser = null;
        return;
      }
      render();
    } catch (error) {
      notify(error.message, true);
    }
  });
  authScreen?.addEventListener("click", event => {
    const target = event.target.closest("[data-action]");
    if (target?.dataset.action === "clear-data") handleAction("clear-data", target);
  });
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printTicket(saleId) {
  const sale = state.sales.find(item => item.id === saleId);
  if (!sale) return notify("No se encontró la venta para imprimir.", true);
  const lines = sale.items.map(item => `<tr><td>${esc(item.name)}<br><small>${item.quantity} ${esc(item.unit || "unidad")} × ${money(item.price)}</small></td><td>${money(item.subtotal)}</td></tr>`).join("");
  printPage(`Ticket ${sale.number}`, `<h1>La Panadería</h1><p>${esc(sale.number)} · ${dateLabel(sale.date, true)}<br>Turno ${esc(sale.shift)} · ${esc(sale.payment)}</p><table>${lines}</table><div class="total"><span>Total</span><span>${money(sale.total)}</span></div><p class="foot">Comprobante de venta</p>`, "ticket");
}

function printComanda(saleId) {
  const sale = state.sales.find(item => item.id === saleId);
  if (!sale) return notify("No se encontró la venta para imprimir la comanda.", true);
  const lines = sale.items.map(item => `<li><strong>${esc(item.name)}</strong><span>${esc(item.quantity)} ${esc(item.unit || "unidad")}</span></li>`).join("");
  printPage(`Comanda ${sale.number}`, `<h1>Comanda de producción</h1><p>${esc(sale.number)} · ${dateLabel(sale.date, true)}<br>Atendió: ${esc(sale.userName)}</p><ul>${lines}</ul>`, "ticket");
}

function printOrderComanda(orderId) {
  const order = state.orders.find(item => item.id === orderId);
  if (!order) return notify("No se encontró el pedido para imprimir la comanda.", true);
  printPage(`Comanda pedido ${order.customer}`, `<h1>Pedido especial</h1><p>Entrega: ${dateLabel(order.dueDate)}<br>Cliente: ${esc(order.customer)}<br>Contacto: ${esc(order.contact)}</p><ul><li><strong>${esc(order.productName)}</strong><span>${esc(order.quantity)} unidades</span></li></ul><p>Estado: ${esc(order.status)}</p>`, "ticket");
}

function printClosure(closureId) {
  const closure = state.closures.find(item => item.id === closureId);
  if (!closure) return notify("No se encontró el cierre de caja.", true);
  const sales = state.sales.filter(item => item.date.slice(0, 10) === closure.date && item.shift === closure.shift);
  const lines = sales.map(sale => `<tr><td>${dateLabel(sale.date, true)} · ${esc(sale.number)}</td><td>${esc(sale.payment)}</td><td>${money(sale.total)}</td></tr>`).join("");
  printPage(`Cierre de caja ${closure.shift}`, `<h1>La Panadería</h1><h2>Reporte de cierre de caja</h2><p>${dateLabel(closure.date)} · Turno ${esc(closure.shift)}<br>Responsable: ${esc(closure.userName)}</p><table><thead><tr><th>Venta</th><th>Pago</th><th>Total</th></tr></thead><tbody>${lines || `<tr><td colspan="3">Sin ventas registradas</td></tr>`}</tbody></table><div class="shift-balance"><span>Efectivo esperado</span><strong>${money(closure.expectedCash)}</strong></div><div class="shift-balance"><span>Pagos electrónicos</span><strong>${money(closure.electronic)}</strong></div><div class="shift-balance"><span>Total de ventas</span><strong>${money(closure.total)}</strong></div><div class="shift-balance"><span>Efectivo contado</span><strong>${money(closure.countedCash)}</strong></div><div class="shift-balance"><span>Diferencia</span><strong>${money(closure.difference)}</strong></div>`, "report");
}

function printPage(title, content, type) {
  const printWindow = window.open("", "_blank", "width=420,height=700");
  if (!printWindow) return notify("Permití las ventanas emergentes para imprimir.", true);
  const width = type === "ticket" ? "290px" : "760px";
  printWindow.addEventListener("load", () => {
    printWindow.focus();
    printWindow.print();
  }, { once: true });
  printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{width:${width};margin:16px auto;font:13px Arial,sans-serif;color:#222}h1,h2{text-align:center}h1{font-size:18px}h2{font-size:15px}p{text-align:center;font-size:11px}table{width:100%;border-collapse:collapse}td,th{padding:8px 4px;border-bottom:1px dashed #aaa;text-align:left;vertical-align:top}td:last-child,th:last-child{text-align:right;white-space:nowrap}.total{display:flex;justify-content:space-between;padding:12px 0;font-size:17px;font-weight:bold}.foot{text-align:center;font-size:10px}ul{list-style:none;padding:0}li,.shift-balance{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px dashed #aaa}.shift-balance{font-size:12px}@media print{body{margin:0 auto}}</style></head><body>${content}</body></html>`);
  printWindow.document.close();
}

function downloadBackup(automatic = false) {
  const backupState = { ...state, users: state.users.map(user => ({ ...user })), activeUser: null };
  const label = automatic ? "copia-automatica" : "respaldo";
  try {
    downloadFile(`panaderia-${label}-${today()}.json`, JSON.stringify(backupState, null, 2), "application/json");
  } catch (error) {
    notify(`No se pudo generar la copia de seguridad: ${error.message}`, true);
    return false;
  }
  notify(automatic
    ? "Se solicitó descargar la copia diaria. Confirmá que el archivo se haya guardado y conserválo fuera de este dispositivo."
    : "Se solicitó descargar la copia de seguridad. Confirmá que el archivo se haya guardado.");
  return true;
}

function backup() {
  downloadBackup();
}

function exportSales() {
  const rows = [["Venta", "Fecha", "Turno", "Medio de pago", "Producto", "Cantidad", "Subtotal", "Total"]];
  for (const sale of state.sales) for (const item of sale.items) rows.push([sale.number, sale.date, sale.shift, sale.payment, item.name, item.quantity, item.subtotal, sale.total]);
  const csv = rows.map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";")).join("\r\n");
  downloadFile(`ventas-panaderia-${today()}.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8");
}

function checkout() {
  if (!cart.length) return notify("Agregá al menos un producto.", true);
  if (state.closures.some(item => item.date === today() && item.shift === state.activeShift)) return notify("El turno está cerrado. Cambiá el turno para continuar.", true);
  const payment = app.querySelector("#payment")?.value || "Efectivo";
  const items = cart.map(item => ({ id: item.id, name: item.name, quantity: item.quantity, unit: item.unit, price: item.price, subtotal: item.quantity * item.price }));
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  for (const item of cart) {
    const product = state.products.find(value => value.id === item.id);
    if (product?.stock != null && item.quantity > Number(product.stock)) return notify(`No hay suficiente stock de ${product.name}.`, true);
  }
  for (const item of cart) {
    const product = state.products.find(value => value.id === item.id);
    if (product?.stock != null) product.stock = Number(product.stock) - item.quantity;
  }
  state.sales.push({ id: uid("venta"), number: `V-${String(state.sales.length + 1).padStart(5, "0")}`, date: localTimestamp(), shift: state.activeShift, payment, total, items, userId: activeUser().id, userName: activeUser().name });
  if (!saveState("Venta registrada.")) return;
  cart = []; filterText = ""; render();
}

function deliverOrder(order) {
  const paid = Number(order.deposit) + Number(order.balancePaid || 0);
  if (paid < Number(order.total)) return notify(`No se puede entregar: resta cobrar ${money(Number(order.total) - paid)}.`, true);
  order.status = "Entregado";
  order.deliveredAt = today();
  if (saveState("Pedido marcado como entregado.")) render();
}

function cancelOrder(order) {
  if (!order || order.status !== "Pendiente") return notify("Solo se pueden cancelar pedidos pendientes.", true);
  if (!confirm("¿Cancelar este pedido? Los pagos registrados permanecerán en el historial de caja.")) return;
  order.status = "Cancelado";
  order.cancelledAt = today();
  order.cancelledBy = activeUser().name;
  if (saveState("Pedido cancelado. Los pagos se conservaron en el historial.")) {
    render();
    return;
  }
  delete order.cancelledAt;
  delete order.cancelledBy;
  order.status = "Pendiente";
}

function restoreBackupFile(file) {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const backupData = JSON.parse(String(reader.result));
      const collections = ["users", "employees", "products", "recipes", "ingredients", "suppliers", "purchases", "orders", "sales", "closures"];
      if (!backupData || typeof backupData !== "object" || collections.some(key => !Array.isArray(backupData[key]))) {
        throw new Error("El archivo no tiene el formato de una copia de seguridad.");
      }
      const restored = { ...blankState(), ...backupData, activeUser: null };
      if (!Array.isArray(restored.stockEntries)) restored.stockEntries = [];
      migrateUserRoles(restored);
      if (!restored.users.some(user => user.role === "dueño")) throw new Error("La copia no contiene una cuenta de dueño para administrar el sistema.");
      if (!confirm("Restaurar la copia reemplazará los datos guardados en este navegador. ¿Querés continuar?")) return;
      const previousState = state;
      state = restored;
      if (!saveState("Copia restaurada. Iniciá sesión nuevamente.")) {
        state = previousState;
        return;
      }
      cart = [];
      currentSection = "inicio";
      render();
    } catch (error) {
      notify(`No se pudo restaurar la copia: ${error.message}`, true);
    }
  }, { once: true });
  reader.addEventListener("error", () => {
    notify(`No se pudo leer el archivo de copia: ${reader.error?.message || "error de lectura"}.`, true);
  }, { once: true });
  reader.readAsText(file);
}

function handleAction(action, target) {
  const id = target.dataset.id;
  const ownerActions = new Set(["backup", "restore-backup", "export-sales", "new-product", "edit-product", "toggle-product", "new-recipe", "edit-recipe", "edit-ingredient", "new-supplier", "new-purchase", "new-user", "new-employee", "delete-user", "delete-supplier"]);
  if (ownerActions.has(action) && activeUser().role !== "dueño") return notify("Esta acción está reservada al dueño.", true);
  if (["add-cart", "checkout", "print-ticket", "print-comanda"].includes(action) && !can("ventas")) return notify("No tenés permiso para acceder a las ventas.", true);
  if (["close-shift", "print-closure"].includes(action) && !can("caja")) return notify("No tenés permiso para acceder al cierre de caja.", true);
  if (action === "stock-entry" && !can("insumos")) return notify("No tenés permiso para actualizar insumos.", true);
  if (["print-order-comanda", "new-order", "pay-balance", "deliver-order", "cancel-order"].includes(action) && !can("pedidos")) return notify("No tenés permiso para acceder a los pedidos.", true);
  if (["new-order", "pay-balance", "deliver-order", "cancel-order"].includes(action) && !["dueño", "cajero"].includes(activeUser().role)) return notify("Solo el dueño o el cajero puede gestionar pedidos y cobros.", true);
  if (action === "new-order" && isProductionRole()) return notify("El personal de producción puede consultar pedidos, pero no registrarlos.", true);
  switch (action) {
    case "menu": app.querySelector("#sidebar")?.classList.toggle("open"); break;
    case "back-home": currentSection = "inicio"; render(); break;
    case "logout": state.activeUser = null; cart = []; saveState(); render(); break;
    case "clear-data": {
      if (!confirm("Esto borrará los datos locales dañados. ¿Querés continuar?")) break;
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(`${STORAGE_KEY}-daily-backup`);
        state = blankState();
        storageProblem = "";
        renderSetup();
        ensureAdminAccount().then(renderLogin).catch(createError => {
          storageProblem = `No se pudo crear la cuenta Admin: ${createError.message}`;
          renderSetup();
        });
      } catch (error) {
        notify(`No se pudieron borrar los datos locales: ${error.message}`, true);
      }
      break;
    }
    case "close-modal": closeModal(); break;
    case "dismiss-modal": break;
    case "backup": backup(); break;
    case "restore-backup": app.querySelector("#backup-file")?.click(); break;
    case "export-sales": exportSales(); break;
    case "print-ticket": printTicket(id); break;
    case "print-comanda": printComanda(id); break;
    case "print-order-comanda": printOrderComanda(id); break;
    case "print-closure": printClosure(id); break;
    case "new-product": productForm(); break;
    case "edit-product": productForm(state.products.find(item => item.id === id)); break;
    case "new-recipe": recipeForm(); break;
    case "edit-recipe": recipeForm(state.recipes.find(item => item.id === id)); break;
    case "toggle-product": {
      const item = state.products.find(value => value.id === id);
      item.active = item.active === false;
      if (saveState(item.active ? "Producto activado." : "Producto desactivado.")) render();
      break;
    }
    case "new-ingredient": ingredientForm(); break;
    case "edit-ingredient": ingredientForm(state.ingredients.find(item => item.id === id)); break;
    case "stock-entry": stockEntryForm(state.ingredients.find(item => item.id === id)); break;
    case "new-supplier": supplierForm(); break;
    case "new-purchase": purchaseForm(); break;
    case "new-order": orderForm(); break;
    case "pay-balance": balanceForm(state.orders.find(item => item.id === id)); break;
    case "deliver-order": deliverOrder(state.orders.find(item => item.id === id)); break;
    case "cancel-order": cancelOrder(state.orders.find(item => item.id === id)); break;
    case "close-shift": closeShiftForm(); break;
    case "new-user": userForm(); break;
    case "new-employee": employeeForm(); break;
    case "delete-user": {
      if (!confirm("¿Eliminar este usuario?")) break;
      state.users = state.users.filter(item => item.id !== id);
      if (saveState("Usuario eliminado.")) render();
      break;
    }
    case "delete-supplier": {
      if (!confirm("¿Eliminar este proveedor?")) break;
      if (state.purchases.some(item => item.supplierId === id)) return notify("No se puede eliminar: el proveedor tiene compras registradas.", true);
      state.suppliers = state.suppliers.filter(item => item.id !== id);
      if (saveState("Proveedor eliminado.")) render();
      break;
    }
    case "add-cart": {
      const product = state.products.find(item => item.id === id);
      if (!product || Number(product.price) <= 0) return notify("El producto no tiene un precio válido.", true);
      const item = cart.find(row => row.id === id);
      const increment = product.unit === "kg" ? 0.25 : 1;
      if (product.stock != null && (item?.quantity || 0) + increment > Number(product.stock)) return notify(`Stock disponible de ${product.name}: ${product.stock}.`, true);
      if (item) item.quantity = Number((item.quantity + increment).toFixed(2));
      else cart.push({ id, name: product.name, unit: product.unit || "unidad", price: Number(product.price), quantity: product.unit === "kg" ? 1 : 1 });
      render(); break;
    }
    case "cart-qty": {
      const item = cart.find(row => row.id === id);
      if (!item) break;
      const product = state.products.find(value => value.id === id);
      const increment = product?.unit === "kg" ? 0.25 : 1;
      const nextQuantity = Number((item.quantity + Number(target.dataset.delta) * increment).toFixed(2));
      if (product?.stock != null && nextQuantity > Number(product.stock)) return notify(`Stock disponible de ${product.name}: ${product.stock}.`, true);
      item.quantity = nextQuantity;
      if (item.quantity <= 0) cart = cart.filter(row => row.id !== id);
      render(); break;
    }
    case "clear-cart": cart = []; render(); break;
    case "checkout": checkout(); break;
  }
}

app.addEventListener("click", event => {
  const sectionButton = event.target.closest("[data-section]");
  if (sectionButton) {
    currentSection = sectionButton.dataset.section;
    filterText = "";
    render();
    return;
  }
  const target = event.target.closest("[data-action]");
  if (target) handleAction(target.dataset.action, target);
});

app.addEventListener("input", event => {
  if (event.target.id !== "search") return;
  filterText = event.target.value;
  const rows = app.querySelector("#product-rows");
  if (rows) {
    const filter = app.querySelector("#product-filter")?.value || "all";
    rows.innerHTML = state.products.filter(item => item.name.toLowerCase().includes(filterText.toLowerCase()) && (filter === "all" || item.type === filter)).map(item => `<tr><td><strong>${esc(item.name)}</strong></td><td>${esc(item.type)}</td><td>${money(item.price)}</td><td>${item.stock == null ? "—" : esc(item.stock)}</td><td><span class="badge ${item.active === false ? "red" : "green"}">${item.active === false ? "Inactivo" : "Activo"}</span></td><td><div class="table-actions"><button class="button small" data-action="edit-product" data-id="${esc(item.id)}">Editar</button><button class="button small" data-action="toggle-product" data-id="${esc(item.id)}">${item.active === false ? "Activar" : "Desactivar"}</button></div></td></tr>`).join("") || `<tr><td colspan="6"><div class="empty">No se encontraron coincidencias.</div></td></tr>`;
    return;
  }
  if (currentSection === "ventas") {
    const tiles = app.querySelector(".product-grid");
    if (tiles) {
      const products = state.products.filter(item => item.active !== false && Number(item.price) > 0 && item.name.toLowerCase().includes(filterText.toLowerCase()));
      tiles.innerHTML = products.length ? products.map(item => `<button class="product-tile" data-action="add-cart" data-id="${esc(item.id)}"><span class="badge">${esc(item.type)}</span><strong>${esc(item.name)}</strong><small>${money(item.price)} / ${esc(item.unit || "unidad")}</small></button>`).join("") : `<div class="empty" style="grid-column:1/-1">No hay coincidencias.</div>`;
    }
  } else {
    const body = app.querySelector("tbody");
    if (body && (currentSection === "insumos" || currentSection === "pedidos")) {
      const value = event.target.value;
      const caret = event.target.selectionStart;
      render();
      const replacement = app.querySelector("#search");
      replacement?.focus();
      replacement?.setSelectionRange(caret, caret);
    }
  }
});

app.addEventListener("change", event => {
  if (event.target.id === "backup-file") {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      if (activeUser()?.role !== "dueño") return notify("Solo el dueño puede restaurar una copia.", true);
      restoreBackupFile(file);
    }
    return;
  }
  if (event.target.id === "shift-select") {
    state.activeShift = event.target.value;
    saveState();
    render();
  }
  if (event.target.id === "report-period") {
    reportPeriod = event.target.value;
    render();
  }
  if (event.target.id === "product-filter") {
    const filter = event.target.value;
    const search = app.querySelector("#search")?.value.toLowerCase() || "";
    const rows = app.querySelector("#product-rows");
    if (rows) {
      const list = state.products.filter(item => item.name.toLowerCase().includes(search) && (filter === "all" || item.type === filter));
      rows.innerHTML = list.map(item => `<tr><td><strong>${esc(item.name)}</strong></td><td>${esc(item.type)}</td><td>${money(item.price)}</td><td>${item.stock == null ? "—" : esc(item.stock)}</td><td><span class="badge ${item.active === false ? "red" : "green"}">${item.active === false ? "Inactivo" : "Activo"}</span></td><td><div class="table-actions"><button class="button small" data-action="edit-product" data-id="${esc(item.id)}">Editar</button><button class="button small" data-action="toggle-product" data-id="${esc(item.id)}">${item.active === false ? "Activar" : "Desactivar"}</button></div></td></tr>`).join("") || `<tr><td colspan="6"><div class="empty">No se encontraron coincidencias.</div></td></tr>`;
    }
  }
});

state = loadState();
if (migrateUserRoles(state)) saveState();
setupFormHandler();
if (!storageProblem) {
  if (!hasAdminAccount(state)) renderSetup();
  ensureAdminAccount().then(renderLogin).catch(error => {
    storageProblem = `No se pudo preparar la cuenta Admin: ${error.message}`;
    renderSetup();
  });
} else {
  render();
}