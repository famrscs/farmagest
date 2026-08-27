"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearVentaAction } from "@/app/actions/sales";

type SaleProduct = {
  id: string;
  loteId: string | null;
  nombre: string;
  detalle: string;
  precio: number;
  costo: number;
  cantidad: number;
  unidad: string;
  unidadesPorCaja: number;
  availableUnits?: number;
};

type DailySale = {
  day: string;
  total: number;
  count: number;
  profit: number;
};

type SaleMode = "UNIDAD" | "CAJA";

type CartItem = SaleProduct & {
  cartId: string;
  cantidadVenta: number;
  modo: SaleMode;
  nombreModo: string;
  precioCobro: number;
  costoCobro: number;
  maximo: number;
};

type PaymentType = "EFECTIVO" | "QR";

const moneyFormatter = new Intl.NumberFormat("es-BO", {
  style: "currency",
  currency: "BOB",
  maximumFractionDigits: 2,
});

const dayFormatter = new Intl.DateTimeFormat("es-BO", {
  day: "2-digit",
  month: "short",
});

function money(value: number) {
  return moneyFormatter.format(value).replace("BOB", "Bs");
}

function todayLabel() {
  return dayFormatter.format(new Date()).replace(".", "");
}

function boxFactor(product: SaleProduct) {
  return Math.max(product.unidadesPorCaja || 1, 1);
}

function productUnits(product: SaleProduct) {
  return product.availableUnits ?? product.cantidad;
}

function saleOption(product: SaleProduct, modo: SaleMode) {
  const factor = boxFactor(product);
  const availableUnits = productUnits(product);
  const isBox = modo === "CAJA" && factor > 1;

  return {
    cartId: `${product.id}-${modo}`,
    modo,
    nombreModo: isBox ? `Caja x ${factor}` : "Unidad",
    precioCobro: isBox ? product.precio : product.precio / factor,
    costoCobro: isBox ? product.costo : product.costo / factor,
    maximo: isBox ? Math.floor(availableUnits / factor) : availableUnits,
  };
}

function unitsRequested(item: CartItem) {
  return item.modo === "CAJA" ? item.cantidadVenta * boxFactor(item) : item.cantidadVenta;
}

function addSaleToHistory(days: DailySale[], total: number, profit: number) {
  const day = todayLabel();
  const current = days.find((item) => item.day === day);

  if (current) {
    return days.map((item) =>
      item.day === day
        ? { ...item, total: item.total + total, count: item.count + 1, profit: item.profit + profit }
        : item
    );
  }

  return [{ day, total, count: 1, profit }, ...days].slice(0, 7);
}

export function SalesRegister({
  products,
  isDemoMode,
  initialDailySales,
}: {
  products: SaleProduct[];
  isDemoMode: boolean;
  initialDailySales: DailySale[];
}) {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [dailySales, setDailySales] = useState(initialDailySales);
  const [availableUnitsById, setAvailableUnitsById] = useState<Record<string, number>>(() =>
    Object.fromEntries(products.map((product) => [product.id, product.cantidad]))
  );
  const [paymentType, setPaymentType] = useState<PaymentType>("EFECTIVO");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setDailySales(initialDailySales);
  }, [initialDailySales]);

  useEffect(() => {
    setAvailableUnitsById(Object.fromEntries(products.map((product) => [product.id, product.cantidad])));
  }, [products]);

  const visibleProducts = useMemo(
    () => products.map((product) => ({ ...product, availableUnits: availableUnitsById[product.id] ?? product.cantidad })),
    [products, availableUnitsById]
  );

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.precioCobro * item.cantidadVenta, 0),
    [cart]
  );

  const profit = useMemo(
    () => cart.reduce((sum, item) => sum + (item.precioCobro - item.costoCobro) * item.cantidadVenta, 0),
    [cart]
  );

  function addToCart(product: SaleProduct, modo: SaleMode) {
    setMessage(null);
    const option = saleOption(product, modo);

    if (option.maximo <= 0) {
      setMessage("Este medicamento no tiene cantidad disponible.");
      return;
    }

    setCart((current) => {
      const existing = current.find((item) => item.cartId === option.cartId);
      if (existing) {
        return current.map((item) =>
          item.cartId === option.cartId
            ? { ...item, cantidadVenta: Math.min(item.cantidadVenta + 1, item.maximo) }
            : item
        );
      }
      return [...current, { ...product, ...option, cantidadVenta: 1 }];
    });
  }

  function changeQuantity(cartId: string, value: number) {
    setCart((current) =>
      current.map((item) =>
        item.cartId === cartId
          ? { ...item, cantidadVenta: Math.max(1, Math.min(value || 1, item.maximo)) }
          : item
      )
    );
  }

  function removeFromCart(cartId: string) {
    setCart((current) => current.filter((item) => item.cartId !== cartId));
  }

  function validateStock() {
    const requestedByProduct = cart.reduce<Record<string, number>>((acc, item) => {
      acc[item.id] = (acc[item.id] ?? 0) + unitsRequested(item);
      return acc;
    }, {});

    const exceeded = Object.entries(requestedByProduct).find(([productId, requested]) => {
      const available = availableUnitsById[productId] ?? 0;
      return requested > available;
    });

    if (!exceeded) {
      return true;
    }

    const product = products.find((item) => item.id === exceeded[0]);
    setMessage(`No hay suficiente cantidad de ${product?.nombre ?? "ese medicamento"}. Revisa el carrito.`);
    return false;
  }

  function discountSoldUnits() {
    setAvailableUnitsById((current) => {
      const next = { ...current };
      for (const item of cart) {
        const currentUnits = next[item.id] ?? item.cantidad;
        next[item.id] = Math.max(0, currentUnits - unitsRequested(item));
      }
      return next;
    });
  }

  function publishSale(totalSale: number, profitSale: number) {
    setDailySales((current) => addSaleToHistory(current, totalSale, profitSale));

    window.dispatchEvent(
      new CustomEvent("farmagest:sale-closed", {
        detail: {
          total: totalSale,
          profit: profitSale,
          paymentType,
          day: todayLabel(),
        },
      })
    );
  }

  function closeSale() {
    setMessage(null);

    if (cart.length === 0) {
      setMessage("Agrega al menos un medicamento al carrito.");
      return;
    }

    if (!validateStock()) {
      return;
    }

    const totalSale = total;
    const profitSale = profit;

    if (isDemoMode) {
      publishSale(totalSale, profitSale);
      discountSoldUnits();
      setCart([]);
      setMessage(`Venta de prueba cerrada con pago en ${paymentType === "QR" ? "QR" : "efectivo"}. Total ${money(totalSale)}.`);
      return;
    }


    const items = cart
      .filter((item) => item.loteId)
      .map((item) => ({ lote_id: item.loteId as string, cantidad: item.cantidadVenta, modo_venta: item.modo }));

    if (items.length !== cart.length) {
      setMessage("Hay medicamentos sin cantidad disponible. No se puede cerrar la venta.");
      return;
    }

    startTransition(async () => {
      const result = await crearVentaAction({
        items,
        formaPago: paymentType,
        descuento: 0,
      });

      if (!result.ok) {
        setMessage(result.message ?? "No se pudo guardar la venta.");
        return;
      }

      publishSale(totalSale, profitSale);
      discountSoldUnits();
      setCart([]);
      setMessage(`Venta guardada. Pago: ${paymentType === "QR" ? "QR" : "efectivo"}. Total ${money(totalSale)}.`);
      router.refresh();
    });
  }

  return (
    <div className="sales-stack">
      <div className="sales-grid">
        <section className="sale-products">
          <div className="panel-head compact-head">
            <div>
              <h3>Elegir medicamento</h3>
              <p className="muted">Vende por unidad o por caja, segun como atiendas al cliente.</p>
            </div>
          </div>
          <div className="product-sale-list">
            {visibleProducts.map((product) => {
              const unit = saleOption(product, "UNIDAD");
              const box = saleOption(product, "CAJA");
              const hasBox = product.unidadesPorCaja > 1;
              const availableUnits = productUnits(product);

              return (
                <article className="sale-product" key={product.id}>
                  <div>
                    <strong>{product.nombre}</strong>
                    <span>{product.detalle}</span>
                    <small>{box.maximo} cajas disponibles - {availableUnits} unidades sueltas</small>
                  </div>
                  <div className="sale-options">
                    <button className="sale-option-button" type="button" onClick={() => addToCart(product, "UNIDAD")} disabled={unit.maximo <= 0}>
                      <span>Unidad</span>
                      <strong>{money(unit.precioCobro)}</strong>
                    </button>
                    {hasBox ? (
                      <button className="sale-option-button" type="button" onClick={() => addToCart(product, "CAJA")} disabled={box.maximo <= 0}>
                        <span>Caja</span>
                        <strong>{money(box.precioCobro)}</strong>
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="cart-box">
          <div className="panel-head compact-head">
            <div>
              <h3>Carrito</h3>
              <p className="muted">Revisa la venta antes de cobrar.</p>
            </div>
          </div>

          <div className="cart-list">
            {cart.length ? cart.map((item) => (
              <div className="cart-row" key={item.cartId}>
                <div>
                  <strong>{item.nombre}</strong>
                  <span>{item.nombreModo} - {money(item.precioCobro)} c/u</span>
                </div>
                <input
                  aria-label={`Cantidad de ${item.nombre}`}
                  min="1"
                  max={item.maximo}
                  type="number"
                  value={item.cantidadVenta}
                  onChange={(event) => changeQuantity(item.cartId, Number(event.target.value))}
                />
                <button className="secondary-button icon-button" type="button" onClick={() => removeFromCart(item.cartId)}>
                  Quitar
                </button>
              </div>
            )) : <p className="muted">Todavia no hay medicamentos en el carrito.</p>}
          </div>

          <div className="payment-box">
            <span>Forma de pago</span>
            <div className="payment-options">
              <button className={paymentType === "EFECTIVO" ? "payment-option active" : "payment-option"} type="button" onClick={() => setPaymentType("EFECTIVO")}>
                Efectivo
              </button>
              <button className={paymentType === "QR" ? "payment-option active" : "payment-option"} type="button" onClick={() => setPaymentType("QR")}>
                QR
              </button>
            </div>
          </div>

          <div className="cart-total">
            <span>Total a cobrar</span>
            <strong>{money(total)}</strong>
            <small>Ganancia aproximada {money(profit)}</small>
          </div>

          <button className="primary-button wide-button" type="button" onClick={closeSale} disabled={isPending}>
            {isPending ? "Guardando venta..." : "Cobrar y guardar venta"}
          </button>

          {message ? <p className="sale-message">{message}</p> : null}
        </aside>
      </div>

      <section className="sales-history">
        <div className="panel-head compact-head">
          <div>
            <h3>Ventas por dia</h3>
            <p className="muted">Cada cobro aparece aqui al instante.</p>
          </div>
        </div>
        <div className="daily-list">
          {dailySales.length ? dailySales.map((item) => (
            <div className="daily-row" key={item.day}>
              <span>{item.day}</span>
              <strong>{money(item.total)}</strong>
              <small>{item.count} ventas - ganancia {money(item.profit)}</small>
            </div>
          )) : <p className="muted">Todavia no hay ventas registradas.</p>}
        </div>
      </section>
    </div>
  );
}


