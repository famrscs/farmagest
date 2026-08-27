import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const auditSchema = z.object({
  accion: z.enum(["ANULACION", "DESCUENTO", "DEVOLUCION", "CAMBIO_PRECIO", "AJUSTE_STOCK", "MERMA", "ALERTA"]),
  descripcion: z.string().trim().min(4).max(300),
  data: z.record(z.unknown()).default({}),
  severidad: z.enum(["BAJA", "MEDIA", "ALTA", "CRITICA"]).default("MEDIA"),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const parsed = auditSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const { error } = await supabase.from("auditoria_acciones").insert({
    usuario_id: user.id,
    accion: parsed.data.accion,
    descripcion: parsed.data.descripcion,
    data: parsed.data.data,
    severidad: parsed.data.severidad,
    ip: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
    user_agent: request.headers.get("user-agent"),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
