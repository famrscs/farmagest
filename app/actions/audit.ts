"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const mermaSchema = z.object({
  productoId: z.string().uuid(),
  stockFisico: z.coerce.number().int().min(0),
  observaciones: z.string().trim().max(300).optional(),
});

const reviewSchema = z.object({
  auditoriaId: z.string().uuid(),
});

const configSchema = z.object({
  clave: z.enum([
    "DESCUENTO_MAXIMO_SIN_JUSTIFICACION",
    "ANULACIONES_MAX_DIA",
    "UMBRAL_MERMA_PORCENTAJE",
    "DESCUENTO_MAXIMO_TOTAL",
    "HORA_CIERRE_OPERACION",
  ]),
  valor: z.coerce.number().int().min(0).max(100),
});

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, userId: null, isAdmin: false };
  }

  const { data: profile } = await supabase
    .from("perfiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single();

  return {
    supabase,
    userId: user.id,
    isAdmin: profile?.rol === "ADMIN" && profile.activo === true,
  };
}

export async function registrarMermaAction(formData: FormData) {
  const parsed = mermaSchema.safeParse({
    productoId: formData.get("productoId"),
    stockFisico: formData.get("stockFisico"),
    observaciones: formData.get("observaciones"),
  });

  if (!parsed.success) {
    return;
  }

  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return;
  }

  await supabase.rpc("registrar_conteo_merma", {
    p_producto_id: parsed.data.productoId,
    p_stock_fisico: parsed.data.stockFisico,
    p_observaciones: parsed.data.observaciones || null,
  });

  revalidatePath("/");
}

export async function marcarAuditoriaRevisadaAction(formData: FormData) {
  const parsed = reviewSchema.safeParse({
    auditoriaId: formData.get("auditoriaId"),
  });

  if (!parsed.success) {
    return;
  }

  const { supabase, userId, isAdmin } = await requireAdmin();
  if (!isAdmin || !userId) {
    return;
  }

  await supabase
    .from("auditoria_acciones")
    .update({
      revisada: true,
      revisada_por: userId,
      fecha_revisada: new Date().toISOString(),
    })
    .eq("id", parsed.data.auditoriaId);

  revalidatePath("/");
}

export async function actualizarUmbralAction(formData: FormData) {
  const parsed = configSchema.safeParse({
    clave: formData.get("clave"),
    valor: formData.get("valor"),
  });

  if (!parsed.success) {
    return;
  }

  const { supabase, isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return;
  }

  await supabase
    .from("alertas_config")
    .update({ valor: parsed.data.valor, fecha_actualizacion: new Date().toISOString() })
    .eq("clave", parsed.data.clave);

  revalidatePath("/");
}
