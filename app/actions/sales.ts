"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const saleSchema = z.object({
  items: z.array(
    z.object({
      lote_id: z.string().uuid(),
      cantidad: z.number().int().positive(),
      modo_venta: z.enum(["UNIDAD", "CAJA"]).default("UNIDAD"),
    })
  ).min(1),
  formaPago: z.enum(["EFECTIVO", "QR", "TARJETA", "CREDITO"]),
  clienteNombre: z.string().trim().max(120).optional(),
  clienteTelefono: z.string().trim().max(40).optional(),
  descuento: z.number().min(0).default(0),
  justificacionDescuento: z.string().trim().max(300).optional(),
});

export async function crearVentaAction(input: unknown) {
  const parsed = saleSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Datos invalidos para la venta." };
  }

  const supabase = await createClient();
  const ventaArgs: Record<string, unknown> = {
    p_items: parsed.data.items,
    p_forma_pago: parsed.data.formaPago,
    p_cliente_nombre: parsed.data.clienteNombre ?? null,
    p_cliente_telefono: parsed.data.clienteTelefono ?? null,
    p_descuento: parsed.data.descuento,
  };

  if (parsed.data.justificacionDescuento) {
    ventaArgs.p_justificacion_descuento = parsed.data.justificacionDescuento;
  }

  const { data, error } = await supabase.rpc("crear_venta", ventaArgs);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/");
  revalidatePath("/ventas");
  revalidatePath("/inventario");

  return { ok: true, venta: data?.[0] ?? null };
}

export async function anularVentaAction(input: unknown) {
  const parsed = z.object({
    ventaId: z.string().uuid(),
    motivo: z.string().trim().min(4).max(300),
  }).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Datos invalidos para anulacion." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("anular_venta", {
    p_venta_id: parsed.data.ventaId,
    p_motivo: parsed.data.motivo,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/");
  revalidatePath("/ventas");
  revalidatePath("/inventario");

  return { ok: true };
}

export async function obtenerTicketAction(input: unknown) {
  const parsed = z.object({
    ventaId: z.string().uuid(),
  }).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Venta invalida." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("obtener_ticket", {
    p_venta_id: parsed.data.ventaId,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true, ticket: data };
}



