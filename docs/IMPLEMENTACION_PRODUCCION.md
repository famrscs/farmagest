# FarmaGest - Correcciones de produccion

Este proyecto local es una maqueta estatica. Las reglas criticas de farmacia deben vivir en Supabase/Postgres y en Server Actions de Next.js, no en JavaScript del navegador.

## 1. Base de datos

Aplicar `supabase/production_schema.sql` en Supabase. Ese archivo corrige:

- RLS en tablas expuestas.
- Grants explicitos para `authenticated`.
- Perfiles vinculados a `auth.users`, sin `password_hash` propio.
- Indices para busqueda, joins, ventas, lotes y arqueos.
- `buscar_productos_venta` filtrando productos activos, stock disponible y lotes no vencidos.
- `crear_venta` atomica con `FOR UPDATE` sobre lotes.
- Agrupacion de items por lote para evitar sobreventa cuando el carrito trae el mismo lote repetido.
- `anular_venta` con devolucion de stock.
- `abrir_arqueo` y `cerrar_arqueo`, sin contar tarjeta como efectivo.
- `obtener_ticket` para reimpresion/auditoria desde datos persistidos.

## 2. Server Action para venta

La UI debe llamar a una Server Action que invoque la RPC `crear_venta`. El cliente no debe insertar directo en `ventas`, `detalle_ventas` ni actualizar `lotes`.

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type SaleItem = {
  lote_id: string
  cantidad: number
}

export async function crearVentaAction(input: {
  items: SaleItem[]
  formaPago: 'EFECTIVO' | 'TARJETA' | 'CREDITO'
  clienteNombre?: string
  clienteTelefono?: string
  descuento?: number
}) {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('crear_venta', {
    p_items: input.items,
    p_forma_pago: input.formaPago,
    p_cliente_nombre: input.clienteNombre ?? null,
    p_cliente_telefono: input.clienteTelefono ?? null,
    p_descuento: input.descuento ?? 0,
  })

  if (error) {
    return { ok: false, message: error.message }
  }

  revalidatePath('/')
  revalidatePath('/ventas')
  revalidatePath('/inventario')

  return { ok: true, venta: data?.[0] }
}
```

## 3. Middleware/Auth

En Next.js con Supabase SSR, proteger rutas con validacion server-side. No usar el objeto de usuario de `getSession()` para autorizacion. Para autorizacion fuerte, consultar perfil/RLS desde servidor o usar `getUser()` cuando haga falta validacion fresca.

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const isLogin = request.nextUrl.pathname.startsWith('/login')

  if (!user && !isLogin) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isLogin) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
```

## 4. Carrito

Zustand puede persistir el carrito solo como borrador temporal. Antes de cobrar:

- Reconsultar lotes.
- Validar vencimiento.
- Validar stock.
- Llamar a `crear_venta`.
- Vaciar carrito solo si la RPC retorna exito.
- Agrupar visualmente productos repetidos, aunque la RPC tambien se protege contra lotes duplicados.

## 5. Tickets

No depender de `window.print()` como unico registro. El ticket se reconstruye con `obtener_ticket(venta_id)` desde `ventas + detalle_ventas` usando `numero_ticket`. La impresion puede fallar, pero la venta queda auditable.

## 6. Pruebas minimas

- Dos ventas simultaneas sobre el mismo lote no deben producir stock negativo.
- Una venta con el mismo `lote_id` repetido en el JSON debe sumar cantidades y fallar si supera stock.
- Un lote vencido debe fallar aunque el cliente intente enviarlo directo a RPC.
- Una anulacion debe marcar `ventas.estado = ANULADA` y devolver stock.
- El arqueo debe excluir ventas anuladas y no sumar tarjeta al efectivo esperado.
- RLS debe impedir que un cajero vea ventas de otro cajero si no es admin.
