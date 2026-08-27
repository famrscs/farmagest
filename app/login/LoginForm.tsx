"use client";

import { useFormState, useFormStatus } from "react-dom";
import { signInAction, type AuthActionState } from "@/app/actions/auth";

const initialState: AuthActionState = {
  ok: false,
  message: "",
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="primary-button" type="submit" disabled={pending}>
      {pending ? "Entrando..." : "Entrar"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useFormState(signInAction, initialState);

  return (
    <form action={formAction} className="form-stack">
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Clave
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.message ? <p className="form-message error">{state.message}</p> : null}
      <SubmitButton />
    </form>
  );
}
