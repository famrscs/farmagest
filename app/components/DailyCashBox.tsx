"use client";

import { useEffect, useMemo, useState } from "react";

type CashDay = {
  day: string;
  efectivo: number;
  qr: number;
  total: number;
};

type SaleClosedEvent = {
  total: number;
  paymentType: "EFECTIVO" | "QR";
  day: string;
};

const moneyFormatter = new Intl.NumberFormat("es-BO", {
  style: "currency",
  currency: "BOB",
  maximumFractionDigits: 2,
});

function money(value: number) {
  return moneyFormatter.format(value).replace("BOB", "Bs");
}

function applySale(days: CashDay[], sale: SaleClosedEvent) {
  const current = days.find((day) => day.day === sale.day);

  if (current) {
    return days.map((day) =>
      day.day === sale.day
        ? {
            ...day,
            efectivo: sale.paymentType === "EFECTIVO" ? day.efectivo + sale.total : day.efectivo,
            qr: sale.paymentType === "QR" ? day.qr + sale.total : day.qr,
            total: day.total + sale.total,
          }
        : day
    );
  }

  return [
    {
      day: sale.day,
      efectivo: sale.paymentType === "EFECTIVO" ? sale.total : 0,
      qr: sale.paymentType === "QR" ? sale.total : 0,
      total: sale.total,
    },
    ...days,
  ].slice(0, 7);
}

export function DailyCashBox({ days }: { days: CashDay[] }) {
  const [cashDays, setCashDays] = useState(days);
  const today = cashDays[0] ?? { day: "Hoy", efectivo: 0, qr: 0, total: 0 };
  const [startCash, setStartCash] = useState(300);
  const [expenses, setExpenses] = useState(0);
  const [withdrawals, setWithdrawals] = useState(0);
  const [countedCash, setCountedCash] = useState(today.efectivo + 300);
  const [cashWasEdited, setCashWasEdited] = useState(false);

  useEffect(() => {
    setCashDays(days);
  }, [days]);

  useEffect(() => {
    function handleSale(event: Event) {
      const detail = (event as CustomEvent<SaleClosedEvent>).detail;
      if (!detail || typeof detail.total !== "number") {
        return;
      }

      setCashDays((current) => applySale(current, detail));
      if (!cashWasEdited && detail.paymentType === "EFECTIVO") {
        setCountedCash((current) => current + detail.total);
      }
    }

    window.addEventListener("farmagest:sale-closed", handleSale);
    return () => window.removeEventListener("farmagest:sale-closed", handleSale);
  }, [cashWasEdited]);

  const expectedCash = useMemo(
    () => startCash + today.efectivo - expenses - withdrawals,
    [startCash, today.efectivo, expenses, withdrawals]
  );

  const difference = countedCash - expectedCash;

  return (
    <div className="cash-grid">
      <section className="cash-summary">
        <div className="panel-head compact-head">
          <div>
            <h3>Caja de hoy</h3>
            <p className="muted">Resumen del dinero del dia.</p>
          </div>
          <strong>{today.day}</strong>
        </div>

        <div className="cash-cards">
          <article><span>Ventas en efectivo</span><strong>{money(today.efectivo)}</strong></article>
          <article><span>Ventas con QR</span><strong>{money(today.qr)}</strong></article>
          <article><span>Total vendido</span><strong>{money(today.total)}</strong></article>
          <article><span>Efectivo esperado</span><strong>{money(expectedCash)}</strong></article>
        </div>
      </section>

      <section className="cash-form-box">
        <div className="panel-head compact-head">
          <div>
            <h3>Arqueo</h3>
            <p className="muted">Cuenta el efectivo y compara con el sistema.</p>
          </div>
        </div>

        <div className="form-stack">
          <label>Fondo inicial<input type="number" min="0" step="0.5" value={startCash} onChange={(event) => setStartCash(Number(event.target.value))} /></label>
          <label>Gastos del dia<input type="number" min="0" step="0.5" value={expenses} onChange={(event) => setExpenses(Number(event.target.value))} /></label>
          <label>Retiros de caja<input type="number" min="0" step="0.5" value={withdrawals} onChange={(event) => setWithdrawals(Number(event.target.value))} /></label>
          <label>Efectivo contado<input type="number" min="0" step="0.5" value={countedCash} onChange={(event) => { setCashWasEdited(true); setCountedCash(Number(event.target.value)); }} /></label>
        </div>

        <div className={Math.abs(difference) <= 0.01 ? "cash-difference ok" : "cash-difference danger"}>
          <span>Diferencia</span>
          <strong>{money(difference)}</strong>
        </div>
      </section>

      <section className="cash-history">
        <div className="panel-head compact-head">
          <div>
            <h3>Caja por dia</h3>
            <p className="muted">Efectivo y QR separados.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th>Efectivo</th>
                <th>QR</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {cashDays.map((day) => (
                <tr key={day.day}>
                  <td>{day.day}</td>
                  <td>{money(day.efectivo)}</td>
                  <td>{money(day.qr)}</td>
                  <td>{money(day.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
