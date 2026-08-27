# Modulo de seguridad y auditoria anti-robo

## Activacion

1. Abre Supabase SQL Editor.
2. Ejecuta `supabase/audit_security_module.sql` despues de `supabase/production_schema.sql`.
3. En Vercel o `.env.local`, conserva estas variables existentes:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` para crear usuarios desde Admin.

## Panel del dueno

Entra con un usuario cuyo perfil en `perfiles` tenga `rol = 'ADMIN'` y `activo = true`.
En el menu lateral veras:

- `Seguridad`: auditoria, conteos de merma, alertas y umbrales.
- `Admin`: creacion de usuarios y asignacion de roles.

Los cajeros no ven la pestana Seguridad ni Admin. Por RLS, solo pueden ver sus propias acciones de auditoria si se consultan por API.

## Umbrales configurables

La migracion crea `alertas_config` con estos valores iniciales:

- `DESCUENTO_MAXIMO_SIN_JUSTIFICACION`: 10
- `ANULACIONES_MAX_DIA`: 3
- `UMBRAL_MERMA_PORCENTAJE`: 5
- `DESCUENTO_MAXIMO_TOTAL`: 15
- `HORA_CIERRE_OPERACION`: 22

El dueno puede cambiarlos desde Seguridad > Umbrales.

## Alertas registradas

El sistema registra auditoria para:

- Anulaciones de ventas.
- Descuentos aplicados.
- Devoluciones mediante `registrar_devolucion`.
- Cambios de costo o precio de productos.
- Ajustes manuales de stock en lotes.
- Conteos de merma.
- Ventas por debajo del costo y ventas fuera de horario.

## Restricciones preventivas

- Si un cajero llega al limite diario de anulaciones, nuevas anulaciones se bloquean hasta que un ADMIN actue.
- Descuentos mayores al umbral de cajero solo los puede aplicar ADMIN.
- Descuentos mayores al umbral de justificacion exigen `p_justificacion_descuento` en `crear_venta`.

## Correo

La base deja las alertas registradas en `auditoria_acciones`. Para enviar correo agrega un proveedor como Resend y variables como:

- `RESEND_API_KEY`
- `AUDIT_ALERT_EMAIL`
- `AUDIT_ALERT_FROM`

Luego conecta el envio desde una Route Handler o Edge Function cuando se cree una accion con severidad `ALTA` o `CRITICA`.
