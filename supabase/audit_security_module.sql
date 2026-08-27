-- FarmaGest: modulo de seguridad, auditoria y control anti-robo.
-- Ejecutar en Supabase SQL Editor despues de production_schema.sql.

create table if not exists public.alertas_config (
  id uuid primary key default gen_random_uuid(),
  clave text unique not null,
  valor integer not null check (valor >= 0),
  descripcion text,
  fecha_actualizacion timestamptz not null default now()
);

insert into public.alertas_config (clave, valor, descripcion)
values
  ('DESCUENTO_MAXIMO_SIN_JUSTIFICACION', 10, 'Porcentaje de descuento que exige justificacion'),
  ('ANULACIONES_MAX_DIA', 3, 'Anulaciones maximas por cajero y dia'),
  ('UMBRAL_MERMA_PORCENTAJE', 5, 'Porcentaje de diferencia de inventario que genera alerta'),
  ('DESCUENTO_MAXIMO_TOTAL', 15, 'Descuento maximo permitido para cajeros'),
  ('HORA_CIERRE_OPERACION', 22, 'Hora local desde la que una venta se considera fuera de horario')
on conflict (clave) do update
set valor = excluded.valor,
    descripcion = excluded.descripcion,
    fecha_actualizacion = now();

create table if not exists public.auditoria_acciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id) on delete restrict,
  accion text not null check (accion in ('ANULACION', 'DESCUENTO', 'DEVOLUCION', 'CAMBIO_PRECIO', 'AJUSTE_STOCK', 'MERMA', 'ALERTA')),
  descripcion text not null,
  data jsonb not null default '{}'::jsonb,
  severidad text not null default 'MEDIA' check (severidad in ('BAJA', 'MEDIA', 'ALTA', 'CRITICA')),
  fecha timestamptz not null default now(),
  ip text,
  user_agent text,
  revisada boolean not null default false,
  revisada_por uuid references public.perfiles(id),
  fecha_revisada timestamptz,
  constraint auditoria_revision_consistente check (
    (revisada = false and revisada_por is null and fecha_revisada is null)
    or (revisada = true and revisada_por is not null and fecha_revisada is not null)
  )
);

create table if not exists public.devoluciones (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid references public.ventas(id) on delete set null,
  producto_id uuid not null references public.productos(id),
  lote_id uuid references public.lotes(id),
  usuario_id uuid not null references public.perfiles(id),
  cantidad integer not null check (cantidad > 0),
  motivo text not null,
  fecha timestamptz not null default now()
);

create table if not exists public.mermas (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  fecha_conteo date not null default current_date,
  stock_teorico integer not null check (stock_teorico >= 0),
  stock_fisico integer not null check (stock_fisico >= 0),
  diferencia integer not null,
  porcentaje_diferencia numeric(8,2) not null default 0,
  supera_umbral boolean not null default false,
  observaciones text,
  usuario_id uuid not null references public.perfiles(id),
  revisada boolean not null default false,
  fecha_creacion timestamptz not null default now(),
  unique (producto_id, fecha_conteo)
);

create index if not exists auditoria_usuario_fecha_idx on public.auditoria_acciones (usuario_id, fecha desc);
create index if not exists auditoria_accion_fecha_idx on public.auditoria_acciones (accion, fecha desc);
create index if not exists auditoria_revisada_fecha_idx on public.auditoria_acciones (revisada, fecha desc);
create index if not exists auditoria_data_gin_idx on public.auditoria_acciones using gin (data);
create index if not exists devoluciones_producto_fecha_idx on public.devoluciones (producto_id, fecha desc);
create index if not exists devoluciones_usuario_fecha_idx on public.devoluciones (usuario_id, fecha desc);
create index if not exists mermas_producto_fecha_idx on public.mermas (producto_id, fecha_conteo desc);
create index if not exists mermas_alertas_idx on public.mermas (supera_umbral, revisada, fecha_conteo desc);

alter table public.alertas_config enable row level security;
alter table public.auditoria_acciones enable row level security;
alter table public.devoluciones enable row level security;
alter table public.mermas enable row level security;

grant select on public.alertas_config to authenticated;
grant update on public.alertas_config to authenticated;
grant select, insert, update on public.auditoria_acciones to authenticated;
grant select, insert on public.devoluciones to authenticated;
grant select, insert, update on public.mermas to authenticated;

drop policy if exists alertas_config_select_auth on public.alertas_config;
create policy alertas_config_select_auth on public.alertas_config
for select to authenticated
using (true);

drop policy if exists alertas_config_update_admin on public.alertas_config;
create policy alertas_config_update_admin on public.alertas_config
for update to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists auditoria_select_own_or_admin on public.auditoria_acciones;
create policy auditoria_select_own_or_admin on public.auditoria_acciones
for select to authenticated
using (usuario_id = (select auth.uid()) or private.is_admin());

drop policy if exists auditoria_insert_own on public.auditoria_acciones;
create policy auditoria_insert_own on public.auditoria_acciones
for insert to authenticated
with check (usuario_id = (select auth.uid()));

drop policy if exists auditoria_update_admin on public.auditoria_acciones;
create policy auditoria_update_admin on public.auditoria_acciones
for update to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists devoluciones_select_own_or_admin on public.devoluciones;
create policy devoluciones_select_own_or_admin on public.devoluciones
for select to authenticated
using (usuario_id = (select auth.uid()) or private.is_admin());

drop policy if exists devoluciones_insert_own on public.devoluciones;
create policy devoluciones_insert_own on public.devoluciones
for insert to authenticated
with check (usuario_id = (select auth.uid()));

drop policy if exists mermas_select_admin on public.mermas;
create policy mermas_select_admin on public.mermas
for select to authenticated
using (private.is_admin());

drop policy if exists mermas_insert_admin on public.mermas;
create policy mermas_insert_admin on public.mermas
for insert to authenticated
with check (private.is_admin());

drop policy if exists mermas_update_admin on public.mermas;
create policy mermas_update_admin on public.mermas
for update to authenticated
using (private.is_admin())
with check (private.is_admin());

create or replace function private.alerta_config_int(p_clave text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select ac.valor from public.alertas_config ac where ac.clave = p_clave), p_default);
$$;

revoke all on function private.alerta_config_int(text, integer) from public, anon;
grant execute on function private.alerta_config_int(text, integer) to authenticated;

create or replace function public.calcular_stock_teorico(p_producto_id uuid)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(l.cantidad_disponible), 0)::integer
  from public.lotes l
  where l.producto_id = p_producto_id;
$$;

revoke all on function public.calcular_stock_teorico(uuid) from public, anon;
grant execute on function public.calcular_stock_teorico(uuid) to authenticated;

create or replace function public.excedio_anulaciones(p_usuario_id uuid, p_fecha date default current_date)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*) >= private.alerta_config_int('ANULACIONES_MAX_DIA', 3)
  from public.auditoria_acciones aa
  where aa.usuario_id = p_usuario_id
    and aa.accion = 'ANULACION'
    and (aa.fecha at time zone 'America/La_Paz')::date = p_fecha;
$$;

revoke all on function public.excedio_anulaciones(uuid, date) from public, anon;
grant execute on function public.excedio_anulaciones(uuid, date) to authenticated;

create or replace function public.registrar_conteo_merma(
  p_producto_id uuid,
  p_stock_fisico integer,
  p_observaciones text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_stock_teorico integer;
  v_diferencia integer;
  v_porcentaje numeric(8,2);
  v_umbral integer := private.alerta_config_int('UMBRAL_MERMA_PORCENTAJE', 5);
  v_merma_id uuid;
  v_producto text;
begin
  if v_user_id is null or not private.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_stock_fisico < 0 then
    raise exception 'Stock fisico invalido';
  end if;

  select public.calcular_stock_teorico(p_producto_id) into v_stock_teorico;
  v_diferencia := p_stock_fisico - v_stock_teorico;
  v_porcentaje := case when v_stock_teorico > 0 then round((abs(v_diferencia)::numeric / v_stock_teorico::numeric) * 100, 2) else 0 end;

  select p.nombre_comercial into v_producto
  from public.productos p
  where p.id = p_producto_id;

  if v_producto is null then
    raise exception 'Producto no encontrado';
  end if;

  insert into public.mermas (
    producto_id, fecha_conteo, stock_teorico, stock_fisico, diferencia,
    porcentaje_diferencia, supera_umbral, observaciones, usuario_id
  )
  values (
    p_producto_id, current_date, v_stock_teorico, p_stock_fisico, v_diferencia,
    v_porcentaje, v_porcentaje > v_umbral, nullif(trim(coalesce(p_observaciones, '')), ''), v_user_id
  )
  on conflict (producto_id, fecha_conteo) do update
  set stock_teorico = excluded.stock_teorico,
      stock_fisico = excluded.stock_fisico,
      diferencia = excluded.diferencia,
      porcentaje_diferencia = excluded.porcentaje_diferencia,
      supera_umbral = excluded.supera_umbral,
      observaciones = excluded.observaciones,
      usuario_id = excluded.usuario_id,
      fecha_creacion = now()
  returning id into v_merma_id;

  insert into public.auditoria_acciones (usuario_id, accion, descripcion, data, severidad)
  values (
    v_user_id,
    'MERMA',
    'Conteo fisico de ' || v_producto || ': diferencia ' || v_diferencia || ' unidades',
    jsonb_build_object(
      'producto_id', p_producto_id,
      'producto', v_producto,
      'stock_teorico', v_stock_teorico,
      'stock_fisico', p_stock_fisico,
      'diferencia', v_diferencia,
      'porcentaje', v_porcentaje,
      'umbral', v_umbral
    ),
    case when v_porcentaje > v_umbral then 'ALTA' else 'BAJA' end
  );

  return v_merma_id;
end;
$$;

revoke all on function public.registrar_conteo_merma(uuid, integer, text) from public, anon;
grant execute on function public.registrar_conteo_merma(uuid, integer, text) to authenticated;

create or replace function public.registrar_devolucion(
  p_venta_id uuid,
  p_producto_id uuid,
  p_lote_id uuid,
  p_cantidad integer,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_devolucion_id uuid;
  v_producto text;
begin
  if v_user_id is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  if p_cantidad <= 0 or nullif(trim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Datos de devolucion invalidos';
  end if;

  select nombre_comercial into v_producto from public.productos where id = p_producto_id;
  if v_producto is null then
    raise exception 'Producto no encontrado';
  end if;

  insert into public.devoluciones (venta_id, producto_id, lote_id, usuario_id, cantidad, motivo)
  values (p_venta_id, p_producto_id, p_lote_id, v_user_id, p_cantidad, trim(p_motivo))
  returning id into v_devolucion_id;

  if p_lote_id is not null then
    update public.lotes
    set cantidad_disponible = cantidad_disponible + p_cantidad
    where id = p_lote_id;
  end if;

  insert into public.auditoria_acciones (usuario_id, accion, descripcion, data, severidad)
  values (
    v_user_id,
    'DEVOLUCION',
    'Devolucion de ' || p_cantidad || ' unidades de ' || v_producto,
    jsonb_build_object('venta_id', p_venta_id, 'producto_id', p_producto_id, 'lote_id', p_lote_id, 'cantidad', p_cantidad, 'motivo', trim(p_motivo)),
    'MEDIA'
  );

  return v_devolucion_id;
end;
$$;

revoke all on function public.registrar_devolucion(uuid, uuid, uuid, integer, text) from public, anon;
grant execute on function public.registrar_devolucion(uuid, uuid, uuid, integer, text) to authenticated;

create or replace function public.auditar_anulacion_venta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anulaciones integer;
  v_max integer := private.alerta_config_int('ANULACIONES_MAX_DIA', 3);
begin
  insert into public.auditoria_acciones (usuario_id, accion, descripcion, data, severidad)
  values (
    new.usuario_id,
    'ANULACION',
    'Venta #' || new.numero_ticket || ' anulada por ' || coalesce(new.motivo_anulacion, 'sin motivo'),
    jsonb_build_object('venta_id', new.id, 'ticket', new.numero_ticket, 'total', new.total, 'motivo', new.motivo_anulacion),
    'ALTA'
  );

  select count(*) into v_anulaciones
  from public.auditoria_acciones aa
  where aa.usuario_id = new.usuario_id
    and aa.accion = 'ANULACION'
    and (aa.fecha at time zone 'America/La_Paz')::date = (now() at time zone 'America/La_Paz')::date;

  if v_anulaciones > v_max then
    insert into public.auditoria_acciones (usuario_id, accion, descripcion, data, severidad)
    values (
      new.usuario_id,
      'ALERTA',
      'Cajero supero el limite diario de anulaciones',
      jsonb_build_object('anulaciones_dia', v_anulaciones, 'limite', v_max, 'venta_id', new.id),
      'CRITICA'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_auditoria_anulacion on public.ventas;
create trigger trigger_auditoria_anulacion
after update of estado on public.ventas
for each row
when (new.estado = 'ANULADA' and old.estado <> 'ANULADA')
execute function public.auditar_anulacion_venta();

create or replace function public.auditar_cambio_precio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    return new;
  end if;

  if old.precio_venta is distinct from new.precio_venta or old.costo_unitario is distinct from new.costo_unitario then
    insert into public.auditoria_acciones (usuario_id, accion, descripcion, data, severidad)
    values (
      v_user_id,
      'CAMBIO_PRECIO',
      'Cambio de precio en ' || new.nombre_comercial,
      jsonb_build_object(
        'producto_id', new.id,
        'producto', new.nombre_comercial,
        'precio_anterior', old.precio_venta,
        'precio_nuevo', new.precio_venta,
        'costo_anterior', old.costo_unitario,
        'costo_nuevo', new.costo_unitario
      ),
      'MEDIA'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_auditoria_cambio_precio on public.productos;
create trigger trigger_auditoria_cambio_precio
after update of precio_venta, costo_unitario on public.productos
for each row
execute function public.auditar_cambio_precio();

create or replace function public.auditar_ajuste_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_producto text;
begin
  if v_user_id is null or old.cantidad_disponible = new.cantidad_disponible then
    return new;
  end if;

  if exists (
    select 1
    from public.detalle_ventas dv
    join public.ventas v on v.id = dv.venta_id
    where dv.lote_id = new.id
      and v.usuario_id = v_user_id
      and v.fecha > now() - interval '3 seconds'
  ) then
    return new;
  end if;

  select p.nombre_comercial into v_producto
  from public.productos p
  where p.id = new.producto_id;

  insert into public.auditoria_acciones (usuario_id, accion, descripcion, data, severidad)
  values (
    v_user_id,
    'AJUSTE_STOCK',
    'Ajuste manual de stock en ' || coalesce(v_producto, 'producto'),
    jsonb_build_object('producto_id', new.producto_id, 'lote_id', new.id, 'stock_anterior', old.cantidad_disponible, 'stock_nuevo', new.cantidad_disponible, 'diferencia', new.cantidad_disponible - old.cantidad_disponible),
    case when new.cantidad_disponible < old.cantidad_disponible then 'ALTA' else 'MEDIA' end
  );

  return new;
end;
$$;

drop trigger if exists trigger_auditoria_ajuste_stock on public.lotes;
create trigger trigger_auditoria_ajuste_stock
after update of cantidad_disponible on public.lotes
for each row
execute function public.auditar_ajuste_stock();

create or replace function public.anular_venta(
  p_venta_id uuid,
  p_motivo text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_venta record;
  v_detalle record;
begin
  if v_user_id is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  if nullif(trim(coalesce(p_motivo, '')), '') is null then
    raise exception 'Motivo de anulacion obligatorio';
  end if;

  if not private.is_admin() and public.excedio_anulaciones(v_user_id, current_date) then
    raise exception 'Limite diario de anulaciones superado. Requiere autorizacion ADMIN.' using errcode = '42501';
  end if;

  select *
  into v_venta
  from public.ventas
  where id = p_venta_id
  for update;

  if not found then
    raise exception 'Venta no encontrada';
  end if;

  if v_venta.usuario_id <> v_user_id and not private.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if v_venta.estado = 'ANULADA' then
    raise exception 'La venta ya fue anulada';
  end if;

  for v_detalle in
    select lote_id, cantidad
    from public.detalle_ventas
    where venta_id = p_venta_id
    for update
  loop
    update public.lotes
    set cantidad_disponible = cantidad_disponible + v_detalle.cantidad
    where id = v_detalle.lote_id;
  end loop;

  update public.ventas
  set estado = 'ANULADA',
      fecha_anulacion = now(),
      motivo_anulacion = trim(p_motivo)
  where id = p_venta_id;

  return true;
end;
$$;

drop function if exists public.crear_venta(jsonb, public.forma_pago, text, text, numeric);

create or replace function public.crear_venta(
  p_items jsonb,
  p_forma_pago public.forma_pago,
  p_cliente_nombre text default null,
  p_cliente_telefono text default null,
  p_descuento numeric default 0,
  p_justificacion_descuento text default null
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
  v_descuento_pct numeric(8,2);
  v_max_sin_justificacion integer := private.alerta_config_int('DESCUENTO_MAXIMO_SIN_JUSTIFICACION', 10);
  v_max_cajero integer := private.alerta_config_int('DESCUENTO_MAXIMO_TOTAL', 15);
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
      p.nombre_comercial,
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

    if v_precio_cobro < v_costo_cobro then
      insert into public.auditoria_acciones (usuario_id, accion, descripcion, data, severidad)
      values (
        v_user_id,
        'ALERTA',
        'Producto vendido por debajo del costo: ' || v_lote.nombre_comercial,
        jsonb_build_object('producto_id', v_lote.producto_id, 'lote_id', v_lote.lote_id, 'precio', v_precio_cobro, 'costo', v_costo_cobro),
        'CRITICA'
      );
    end if;

    v_subtotal := v_subtotal + (v_precio_cobro * v_item.cantidad);
  end loop;

  if p_descuento > v_subtotal then
    raise exception 'El descuento supera el subtotal';
  end if;

  v_descuento_pct := case when v_subtotal > 0 then round((p_descuento / v_subtotal) * 100, 2) else 0 end;

  if v_descuento_pct > v_max_cajero and not private.is_admin() then
    raise exception 'Descuentos mayores a % solo pueden ser aplicados por ADMIN', v_max_cajero using errcode = '42501';
  end if;

  if v_descuento_pct > v_max_sin_justificacion and nullif(trim(coalesce(p_justificacion_descuento, '')), '') is null then
    raise exception 'Descuento alto requiere justificacion';
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

  if p_descuento > 0 then
    insert into public.auditoria_acciones (usuario_id, accion, descripcion, data, severidad)
    values (
      v_user_id,
      'DESCUENTO',
      'Descuento de ' || p_descuento || ' Bs en venta #' || v_ticket,
      jsonb_build_object('venta_id', v_venta_id, 'ticket', v_ticket, 'subtotal', v_subtotal, 'descuento', p_descuento, 'porcentaje', v_descuento_pct, 'justificacion', nullif(trim(coalesce(p_justificacion_descuento, '')), '')),
      case when v_descuento_pct > v_max_sin_justificacion then 'ALTA' else 'MEDIA' end
    );
  end if;

  if extract(hour from now() at time zone 'America/La_Paz') >= private.alerta_config_int('HORA_CIERRE_OPERACION', 22) then
    insert into public.auditoria_acciones (usuario_id, accion, descripcion, data, severidad)
    values (
      v_user_id,
      'ALERTA',
      'Venta fuera de horario habitual #' || v_ticket,
      jsonb_build_object('venta_id', v_venta_id, 'ticket', v_ticket, 'hora_local', now() at time zone 'America/La_Paz'),
      'MEDIA'
    );
  end if;

  return query select v_venta_id, v_ticket, v_total;
end;
$$;

revoke all on function public.crear_venta(jsonb, public.forma_pago, text, text, numeric, text) from public, anon;
grant execute on function public.crear_venta(jsonb, public.forma_pago, text, text, numeric, text) to authenticated;
revoke all on function public.auditar_anulacion_venta() from public, anon, authenticated;
revoke all on function public.auditar_cambio_precio() from public, anon, authenticated;
revoke all on function public.auditar_ajuste_stock() from public, anon, authenticated;
revoke all on function public.anular_venta(uuid, text) from public, anon;
grant execute on function public.anular_venta(uuid, text) to authenticated;
