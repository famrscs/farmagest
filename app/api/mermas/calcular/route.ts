import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const mermaSchema = z.object({
  productoId: z.string().uuid(),
  stockFisico: z.number().int().min(0),
  observaciones: z.string().trim().max(300).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("perfiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single();

  if (profile?.rol !== "ADMIN" || profile.activo !== true) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const parsed = mermaSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("registrar_conteo_merma", {
    p_producto_id: parsed.data.productoId,
    p_stock_fisico: parsed.data.stockFisico,
    p_observaciones: parsed.data.observaciones ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, mermaId: data });
}
