-- Incremental update for existing FarmaGest Supabase databases.
-- Run this once if the database was created before cantidad_por_envase existed.

alter table public.productos
add column if not exists cantidad_por_envase integer not null default 1 check (cantidad_por_envase > 0);

create or replace function public.buscar_productos_venta(search_term text)
returns table (
  id uuid,
  codigo_interno text,
  nombre_comercial text,
  principio_activo text,
  presentacion text,
  cantidad_por_envase integer,
  costo_unitario numeric,
  precio_venta numeric,
  margen_unitario numeric,
  margen_porcentaje numeric,
  stock_total bigint,
  lotes jsonb
)
language sql
stable
security invoker
as $$
  select
    p.id,
    p.codigo_interno,
    p.nombre_comercial,
    p.principio_activo,
    p.presentacion,
    p.cantidad_por_envase,
    p.costo_unitario,
    p.precio_venta,
    (p.precio_venta - p.costo_unitario) as margen_unitario,
    case
      when p.precio_venta > 0 then round(((p.precio_venta - p.costo_unitario) / p.precio_venta) * 100, 2)
      else 0
    end as margen_porcentaje,
    coalesce(sum(l.cantidad_disponible), 0)::bigint as stock_total,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'numeroLote', l.numero_lote,
          'fechaVencimiento', l.fecha_vencimiento,
          'cantidadDisponible', l.cantidad_disponible
        )
        order by l.fecha_vencimiento asc
      ) filter (where l.id is not null),
      '[]'::jsonb
    ) as lotes
  from public.productos p
  join public.lotes l on l.producto_id = p.id
  where p.activo = true
    and l.cantidad_disponible > 0
    and l.fecha_vencimiento > current_date
    and (
      public.farmagest_unaccent(lower(p.nombre_comercial)) like '%' || public.farmagest_unaccent(lower(search_term)) || '%'
      or public.farmagest_unaccent(lower(coalesce(p.principio_activo, ''))) like '%' || public.farmagest_unaccent(lower(search_term)) || '%'
      or lower(p.codigo_interno) like '%' || lower(search_term) || '%'
    )
  group by p.id, p.codigo_interno, p.nombre_comercial, p.principio_activo, p.presentacion, p.cantidad_por_envase, p.costo_unitario, p.precio_venta
  order by p.nombre_comercial
  limit 25;
$$;

revoke all on function public.buscar_productos_venta(text) from public, anon;
grant execute on function public.buscar_productos_venta(text) to authenticated;
-- Allow QR payments in existing databases.
alter type public.forma_pago add value if not exists 'QR';

-- Convert existing stock to internal units only once.
create schema if not exists private;
create table if not exists private.migration_flags (
  name text primary key,
  applied_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from private.migration_flags where name = 'stock_saved_as_units_v1') then
    update public.lotes l
    set cantidad_disponible = l.cantidad_disponible * greatest(coalesce(p.cantidad_por_envase, 1), 1)
    from public.productos p
    where p.id = l.producto_id
      and p.unidad_medida = 'ENVASE';

    update public.productos
    set stock_minimo = stock_minimo * greatest(coalesce(cantidad_por_envase, 1), 1)
    where unidad_medida = 'ENVASE';

    insert into private.migration_flags(name) values ('stock_saved_as_units_v1');
  end if;
end;
$$;

-- Replace sale function so boxes and loose units discount stock correctly.
create or replace function public.crear_venta(
  p_items jsonb,
  p_forma_pago public.forma_pago,
  p_cliente_nombre text default null,
  p_cliente_telefono text default null,
  p_descuento numeric default 0
)
returns table (venta_id uuid, numero_ticket bigint, total numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_venta_id uuid;
  v_subtotal numeric(10,2) := 0;
  v_total numeric(10,2);
  v_ticket bigint;
  v_item record;
  v_lote record;
  v_factor integer;
  v_cantidad_unidades integer;
  v_precio_cobro numeric(10,2);
  v_costo_cobro numeric(10,2);
begin
  if v_user_id is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  if not exists (select 1 from public.perfiles where id = v_user_id and activo = true) then
    raise exception 'Usuario inactivo o no registrado' using errcode = '28000';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene items';
  end if;

  if p_descuento < 0 then
    raise exception 'Descuento invalido';
  end if;

  for v_item in
    select lote_id, modo_venta, sum(cantidad)::integer as cantidad
    from (
      select
        nullif(value->>'lote_id', '')::uuid as lote_id,
        coalesce(nullif(value->>'modo_venta', ''), 'UNIDAD') as modo_venta,
        nullif(value->>'cantidad', '')::integer as cantidad
      from jsonb_array_elements(p_items)
    ) parsed_items
    group by lote_id, modo_venta
  loop
    if v_item.lote_id is null or v_item.cantidad is null or v_item.cantidad <= 0 then
      raise exception 'Cantidad invalida';
    end if;

    if v_item.modo_venta not in ('UNIDAD', 'CAJA') then
      raise exception 'Forma de venta invalida';
    end if;

    select
      l.id as lote_id,
      l.cantidad_disponible,
      l.fecha_vencimiento,
      l.costo_compra,
      p.id as producto_id,
      p.precio_venta,
      p.cantidad_por_envase,
      p.activo
    into v_lote
    from public.lotes l
    join public.productos p on p.id = l.producto_id
    where l.id = v_item.lote_id
    for update of l;

    if not found then
      raise exception 'Lote no encontrado';
    end if;

    if v_lote.activo is false then
      raise exception 'Producto inactivo';
    end if;

    if v_lote.fecha_vencimiento <= current_date then
      raise exception 'No se puede vender un lote vencido';
    end if;

    v_factor := greatest(coalesce(v_lote.cantidad_por_envase, 1), 1);

    if v_item.modo_venta = 'CAJA' then
      v_cantidad_unidades := v_item.cantidad * v_factor;
      v_precio_cobro := v_lote.precio_venta;
      v_costo_cobro := v_lote.costo_compra;
    else
      v_cantidad_unidades := v_item.cantidad;
      v_precio_cobro := round(v_lote.precio_venta / v_factor, 2);
      v_costo_cobro := round(v_lote.costo_compra / v_factor, 2);
    end if;

    if v_lote.cantidad_disponible < v_cantidad_unidades then
      raise exception 'Stock insuficiente';
    end if;

    v_subtotal := v_subtotal + (v_precio_cobro * v_item.cantidad);
  end loop;

  if p_descuento > v_subtotal then
    raise exception 'El descuento supera el subtotal';
  end if;

  v_total := v_subtotal - p_descuento;

  insert into public.ventas (
    usuario_id, subtotal, descuento, iva, total, forma_pago, cliente_nombre, cliente_telefono
  )
  values (
    v_user_id, v_subtotal, p_descuento, 0, v_total, p_forma_pago, p_cliente_nombre, p_cliente_telefono
  )
  returning id, numero_ticket into v_venta_id, v_ticket;

  for v_item in
    select lote_id, modo_venta, sum(cantidad)::integer as cantidad
    from (
      select
        nullif(value->>'lote_id', '')::uuid as lote_id,
        coalesce(nullif(value->>'modo_venta', ''), 'UNIDAD') as modo_venta,
        nullif(value->>'cantidad', '')::integer as cantidad
      from jsonb_array_elements(p_items)
    ) parsed_items
    group by lote_id, modo_venta
  loop
    select
      l.id as lote_id,
      l.cantidad_disponible,
      l.fecha_vencimiento,
      l.costo_compra,
      p.id as producto_id,
      p.precio_venta,
      p.cantidad_por_envase
    into v_lote
    from public.lotes l
    join public.productos p on p.id = l.producto_id
    where l.id = v_item.lote_id
    for update of l;

    if not found then
      raise exception 'Lote no encontrado';
    end if;

    v_factor := greatest(coalesce(v_lote.cantidad_por_envase, 1), 1);

    if v_item.modo_venta = 'CAJA' then
      v_cantidad_unidades := v_item.cantidad * v_factor;
      v_precio_cobro := v_lote.precio_venta;
      v_costo_cobro := v_lote.costo_compra;
    else
      v_cantidad_unidades := v_item.cantidad;
      v_precio_cobro := round(v_lote.precio_venta / v_factor, 2);
      v_costo_cobro := round(v_lote.costo_compra / v_factor, 2);
    end if;

    insert into public.detalle_ventas (
      venta_id, lote_id, producto_id, cantidad, precio_unitario, costo_unitario, subtotal
    )
    values (
      v_venta_id,
      v_lote.lote_id,
      v_lote.producto_id,
      v_item.cantidad,
      v_precio_cobro,
      v_costo_cobro,
      v_precio_cobro * v_item.cantidad
    );

    update public.lotes
    set cantidad_disponible = cantidad_disponible - v_cantidad_unidades
    where id = v_lote.lote_id;
  end loop;

  return query select v_venta_id, v_ticket, v_total;
end;
$$;

revoke all on function public.crear_venta(jsonb, public.forma_pago, text, text, numeric) from public, anon;
grant execute on function public.crear_venta(jsonb, public.forma_pago, text, text, numeric) to authenticated;
