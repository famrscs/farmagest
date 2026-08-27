"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const productFormSchema = z.object({
  codigoInterno: z.string().trim().min(2).max(40),
  nombreComercial: z.string().trim().min(2).max(140),
  principioActivo: z.string().trim().max(140).optional(),
  laboratorio: z.string().trim().max(100).optional(),
  presentacion: z.string().trim().min(2).max(140),
  unidadMedida: z.enum(["UNIDAD", "ENVASE"]),
  cantidadPorEnvase: z.coerce.number().int().positive(),
  costoAdquisicion: z.coerce.number().min(0),
  precioVenta: z.coerce.number().min(0),
  stockMinimo: z.coerce.number().int().min(0),
  numeroLote: z.string().trim().min(1).max(60),
  fechaVencimiento: z.string().trim().min(1),
  cantidadDisponible: z.coerce.number().int().positive(),
  proveedor: z.string().trim().max(120).optional(),
});

export async function registrarProductoAction(formData: FormData) {
  const parsed = productFormSchema.safeParse({
    codigoInterno: formData.get("codigoInterno"),
    nombreComercial: formData.get("nombreComercial"),
    principioActivo: formData.get("principioActivo"),
    laboratorio: formData.get("laboratorio"),
    presentacion: formData.get("presentacion"),
    unidadMedida: formData.get("unidadMedida"),
    cantidadPorEnvase: formData.get("cantidadPorEnvase"),
    costoAdquisicion: formData.get("costoAdquisicion"),
    precioVenta: formData.get("precioVenta"),
    stockMinimo: formData.get("stockMinimo"),
    numeroLote: formData.get("numeroLote"),
    fechaVencimiento: formData.get("fechaVencimiento"),
    cantidadDisponible: formData.get("cantidadDisponible"),
    proveedor: formData.get("proveedor"),
  });

  if (!parsed.success) {
    return;
  }

  const supabase = await createClient();
  const laboratorioNombre = parsed.data.laboratorio || "Sin laboratorio";
  const factor = parsed.data.unidadMedida === "ENVASE" ? parsed.data.cantidadPorEnvase : 1;
  const stockMinimoEnUnidades = parsed.data.stockMinimo * factor;
  const cantidadEnUnidades = parsed.data.cantidadDisponible * factor;

  const { data: laboratorioExistente } = await supabase
    .from("laboratorios")
    .select("id")
    .ilike("nombre", laboratorioNombre)
    .maybeSingle();

  const laboratorioId = laboratorioExistente?.id ?? (await supabase
    .from("laboratorios")
    .insert({ nombre: laboratorioNombre })
    .select("id")
    .single()).data?.id;

  const { data: producto } = await supabase
    .from("productos")
    .insert({
      codigo_interno: parsed.data.codigoInterno,
      nombre_comercial: parsed.data.nombreComercial,
      principio_activo: parsed.data.principioActivo || null,
      laboratorio_id: laboratorioId ?? null,
      presentacion: parsed.data.presentacion,
      unidad_medida: parsed.data.unidadMedida,
      cantidad_por_envase: factor,
      costo_unitario: parsed.data.costoAdquisicion,
      precio_venta: parsed.data.precioVenta,
      stock_minimo: stockMinimoEnUnidades,
    })
    .select("id")
    .single();

  if (!producto?.id) {
    return;
  }

  await supabase.from("lotes").insert({
    producto_id: producto.id,
    numero_lote: parsed.data.numeroLote,
    fecha_vencimiento: parsed.data.fechaVencimiento,
    cantidad_disponible: cantidadEnUnidades,
    costo_compra: parsed.data.costoAdquisicion,
    proveedor: parsed.data.proveedor || null,
  });

  revalidatePath("/");
  revalidatePath("/inventario");
}
