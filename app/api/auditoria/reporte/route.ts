import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from("perfiles")
    .select("rol, activo")
    .eq("id", userId)
    .single();

  return data?.rol === "ADMIN" && data.activo === true;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!(await isAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const fechaInicio = searchParams.get("fechaInicio") ?? new Date().toISOString().slice(0, 10);
  const fechaFin = searchParams.get("fechaFin") ?? fechaInicio;
  const usuarioId = searchParams.get("usuarioId");
  const accion = searchParams.get("accion");

  let query = supabase
    .from("auditoria_acciones")
    .select("id, usuario_id, accion, descripcion, data, severidad, fecha, revisada, perfiles(nombre_completo, rol)")
    .gte("fecha", `${fechaInicio}T00:00:00.000Z`)
    .lte("fecha", `${fechaFin}T23:59:59.999Z`)
    .order("fecha", { ascending: false })
    .limit(300);

  if (usuarioId) {
    query = query.eq("usuario_id", usuarioId);
  }

  if (accion) {
    query = query.eq("accion", accion);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
