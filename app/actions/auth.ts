"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { ok: false, message: "Email y clave son obligatorios." };
  }

  if (!hasSupabaseEnv()) {
    redirect("/");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { ok: false, message: "Credenciales invalidas." };
  }

  redirect("/");
}

export async function signOutAction() {
  if (!hasSupabaseEnv()) {
    redirect("/login");
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const userFormSchema = z.object({
  nombreCompleto: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(180).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(72),
  rol: z.enum(["ADMIN", "CAJERO"]),
});

export async function registrarUsuarioAction(formData: FormData) {
  if (!hasSupabaseEnv()) {
    return;
  }

  const parsed = userFormSchema.safeParse({
    nombreCompleto: formData.get("nombreCompleto"),
    email: formData.get("email"),
    password: formData.get("password"),
    rol: formData.get("rol"),
  });

  if (!parsed.success) {
    return;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return;
  }

  const { data: currentProfile } = await supabase
    .from("perfiles")
    .select("rol, activo")
    .eq("id", user.id)
    .single();

  if (currentProfile?.rol !== "ADMIN" || currentProfile.activo !== true) {
    return;
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    return;
  }

  const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    app_metadata: {
      role: parsed.data.rol,
    },
    user_metadata: {
      nombre_completo: parsed.data.nombreCompleto,
    },
  });

  if (createError || !createdUser.user?.id) {
    return;
  }

  const { error: profileError } = await admin.from("perfiles").insert({
    id: createdUser.user.id,
    nombre_completo: parsed.data.nombreCompleto,
    rol: parsed.data.rol,
    activo: true,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(createdUser.user.id);
    return;
  }

  revalidatePath("/");
  return;
}

