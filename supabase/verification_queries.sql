-- Queries manuales de verificacion despues de aplicar production_schema.sql.
-- Ejecutar con usuarios de prueba reales de Supabase Auth.

-- 1. No debe existir ninguna tabla publica critica sin RLS.
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'perfiles', 'laboratorios', 'productos', 'lotes',
    'ventas', 'detalle_ventas', 'arqueos_caja'
  )
order by tablename;

-- 2. Revisar indices creados para joins y filtros calientes.
select tablename, indexname
from pg_indexes
where schemaname = 'public'
  and tablename in ('productos', 'lotes', 'ventas', 'detalle_ventas', 'arqueos_caja')
order by tablename, indexname;

-- 3. La busqueda no debe devolver lotes vencidos ni sin stock.
select *
from public.buscar_productos_venta('amo');

-- 4. La venta debe hacerse por RPC, no por inserts manuales desde cliente.
-- Ejemplo:
-- select * from public.crear_venta(
--   '[{"lote_id":"00000000-0000-0000-0000-000000000000","cantidad":1}]'::jsonb,
--   'EFECTIVO',
--   null,
--   null,
--   0
-- );
-- Repetir el mismo lote dos veces debe ser tratado como una sola demanda agregada.
-- Si el stock total no alcanza, debe fallar sin crear venta ni detalle.
-- select * from public.crear_venta(
--   '[
--     {"lote_id":"00000000-0000-0000-0000-000000000000","cantidad":3},
--     {"lote_id":"00000000-0000-0000-0000-000000000000","cantidad":3}
--   ]'::jsonb,
--   'EFECTIVO',
--   null,
--   null,
--   0
-- );

-- 4b. Ticket auditable.
-- select public.obtener_ticket('00000000-0000-0000-0000-000000000000'::uuid);

-- 5. El arqueo esperado debe sumar solo efectivo.
select id, fondo_inicial, ventas_efectivo, ventas_tarjeta, efectivo_esperado, diferencia
from public.arqueos_caja
order by fecha desc
limit 20;

-- 6. Venta por unidad y por caja con stock interno en unidades.
-- Para un producto con cantidad_por_envase = 20 y lote con 160 unidades:
-- - Vender 1 UNIDAD debe descontar 1 unidad y cobrar precio_venta / 20.
-- - Vender 1 CAJA debe descontar 20 unidades y cobrar precio_venta completo.
-- select * from public.crear_venta(
--   '[{"lote_id":"00000000-0000-0000-0000-000000000000","cantidad":1,"modo_venta":"UNIDAD"}]'::jsonb,
--   'EFECTIVO',
--   null,
--   null,
--   0
-- );
-- select cantidad_disponible from public.lotes where id = '00000000-0000-0000-0000-000000000000';
-- select * from public.crear_venta(
--   '[{"lote_id":"00000000-0000-0000-0000-000000000000","cantidad":1,"modo_venta":"CAJA"}]'::jsonb,
--   'QR',
--   null,
--   null,
--   0
-- );
-- select cantidad_disponible from public.lotes where id = '00000000-0000-0000-0000-000000000000';
