"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function abrirArqueoAction(input: unknown) {
  const parsed = z.object({
    fondoInicial: z.number().min(0),
  }).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Fondo inicial invalido." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("abrir_arqueo", {
    p_fondo_inicial: parsed.data.fondoInicial,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/");
  return { ok: true, arqueoId: data };
}

export async function cerrarArqueoAction(input: unknown) {
  const parsed = z.object({
    efectivoContado: z.number().min(0),
    gastosDia: z.number().min(0).default(0),
    retirosCaja: z.number().min(0).default(0),
    justificacion: z.string().trim().max(400).optional(),
    autorizadoPor: z.string().uuid().optional(),
  }).safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Datos invalidos para arqueo." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cerrar_arqueo", {
    p_efectivo_contado: parsed.data.efectivoContado,
    p_gastos_dia: parsed.data.gastosDia,
    p_retiros_caja: parsed.data.retirosCaja,
    p_justificacion: parsed.data.justificacion ?? null,
    p_autorizado_por: parsed.data.autorizadoPor ?? null,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/");
  revalidatePath("/arqueo");
  return { ok: true, arqueoId: data };
}
