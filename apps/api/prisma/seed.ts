/**
 * Seed del ERP Auto Master Colón — idempotente (upserts).
 * Siembra: tenant, 2 sucursales (D-019), catálogo de permisos (09 §3.2 + BL-020),
 * 8 roles con la matriz 09 §3.3, usuarios demo, unidades, categorías con atributos EAV,
 * marcas, productos de ferretería y autopartes con códigos internos (D-028),
 * stock inicial (movimiento ENTRADA_INICIAL + stock, RN-005/006), clientes (incl.
 * consumidor final y precio especial D-024), proveedores, secuencias y configuración.
 */
import { PrismaClient, TipoProducto, AtributoTipo, CodigoTipo, ClienteTipo, MovTipo, RefTipo, DocTipo, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

// Credenciales temporales (BUILD-LOG §2) — debeCambiarClave=true
const USUARIOS = [
  { usuario: 'admin', nombre: 'Administrador General', password: 'AutoMaster#2026', roles: ['admin_general'], sucursales: ['0001', '0002'] },
  { usuario: 'gerente', nombre: 'Gerente Demo', password: 'Gerente#2026', roles: ['gerente'], sucursales: ['0001', '0002'] },
  { usuario: 'vendedor', nombre: 'Vendedor Demo', password: 'Vendedor#2026', roles: ['vendedor'], sucursales: ['0001'] },
  { usuario: 'caja', nombre: 'Cajera Demo', password: 'Caja#2026', roles: ['caja'], sucursales: ['0001'] },
];

// Catálogo de permisos (09 §3.2, extendido BL-020)
const PERMISOS: Array<[string, string]> = [
  ['productos:ver', 'Ver productos y catálogo'],
  ['productos:crear', 'Crear productos'],
  ['productos:editar', 'Editar productos'],
  ['productos:descontinuar', 'Descontinuar productos (RN-023)'],
  ['inventario:ver', 'Ver stock y kardex'],
  ['inventario:ajustar', 'Registrar ajustes de inventario'],
  ['inventario:transferir', 'Transferir entre sucursales (Fase 2)'],
  ['inventario:contar', 'Conteos físicos'],
  ['ventas:ver', 'Ver ventas'],
  ['ventas:crear', 'Crear ventas (armar en ventanilla)'],
  ['ventas:anular_solicitar', 'Solicitar anulación de venta'],
  ['descuentos:aplicar_normal', 'Aplicar descuento dentro del umbral'],
  ['descuentos:aplicar_extra', 'Autorizar descuento fuera del umbral (RN-160)'],
  ['caja:operar', 'Abrir caja, cobrar ventas, registrar movimientos'],
  ['caja:cerrar', 'Cerrar caja con cuadre'],
  ['caja:ver_todas', 'Ver sesiones de caja de todos'],
  ['facturacion:emitir', 'Emitir factura (FEP/contingencia)'],
  ['facturacion:anular', 'Anular factura / nota de crédito'],
  ['facturacion:ver', 'Ver facturas'],
  ['compras:solicitar', 'Solicitar compras (Fase 2)'],
  ['compras:aprobar', 'Aprobar compras (Fase 2)'],
  ['compras:crear', 'Crear compras (Fase 2)'],
  ['compras:recibir', 'Recibir mercancía (Fase 2)'],
  ['compras:pagar', 'Registrar pagos de compras (Fase 2)'],
  ['devoluciones:crear', 'Crear devoluciones (Fase 2)'],
  ['devoluciones:autorizar', 'Autorizar devoluciones (Fase 2)'],
  ['reportes:ver', 'Ver reportes y dashboard'],
  ['reportes:fiscal', 'Reportes fiscales (ITBMS)'],
  ['reportes:exportar', 'Exportar reportes'],
  ['clientes:ver', 'Ver clientes'],
  ['clientes:gestionar', 'Crear/editar clientes y precios especiales'],
  ['proveedores:ver', 'Ver proveedores'],
  ['proveedores:gestionar', 'Crear/editar proveedores'],
  ['admin:usuarios', 'Administrar usuarios'],
  ['admin:roles', 'Administrar roles y permisos'],
  ['admin:config', 'Administrar configuración'],
  ['auditoria:ver', 'Consultar auditoría'],
];

// Matriz rol → permisos (09 §3.3 aprobada + afinado BL-020)
const ROLES: Array<{ codigo: string; nombre: string; permisos: string[] | 'ALL' }> = [
  { codigo: 'admin_general', nombre: 'Administrador General', permisos: 'ALL' },
  {
    codigo: 'gerente', nombre: 'Gerente',
    permisos: ['productos:ver', 'productos:crear', 'productos:editar', 'productos:descontinuar', 'inventario:ver', 'inventario:ajustar', 'inventario:contar', 'ventas:ver', 'descuentos:aplicar_normal', 'descuentos:aplicar_extra', 'caja:ver_todas', 'facturacion:ver', 'compras:aprobar', 'devoluciones:autorizar', 'reportes:ver', 'reportes:fiscal', 'reportes:exportar', 'clientes:ver', 'clientes:gestionar', 'proveedores:ver', 'proveedores:gestionar', 'auditoria:ver'],
  },
  {
    codigo: 'supervisor', nombre: 'Supervisor',
    permisos: ['productos:ver', 'inventario:ver', 'inventario:ajustar', 'ventas:ver', 'descuentos:aplicar_extra', 'devoluciones:autorizar', 'caja:ver_todas', 'reportes:ver', 'clientes:ver', 'auditoria:ver'],
  },
  {
    codigo: 'caja', nombre: 'Caja',
    permisos: ['productos:ver', 'inventario:ver', 'ventas:ver', 'ventas:crear', 'descuentos:aplicar_normal', 'caja:operar', 'caja:cerrar', 'facturacion:emitir', 'facturacion:ver', 'devoluciones:crear', 'clientes:ver', 'clientes:gestionar'],
  },
  {
    codigo: 'vendedor', nombre: 'Vendedor',
    permisos: ['productos:ver', 'inventario:ver', 'ventas:ver', 'ventas:crear', 'descuentos:aplicar_normal', 'clientes:ver', 'clientes:gestionar'],
  },
  {
    codigo: 'compras', nombre: 'Compras',
    permisos: ['productos:ver', 'inventario:ver', 'proveedores:ver', 'proveedores:gestionar', 'compras:solicitar', 'compras:crear', 'compras:recibir', 'compras:pagar', 'reportes:ver'],
  },
  {
    codigo: 'bodega', nombre: 'Bodega',
    permisos: ['productos:ver', 'inventario:ver', 'inventario:ajustar', 'inventario:transferir', 'inventario:contar', 'compras:recibir'],
  },
  {
    codigo: 'contabilidad', nombre: 'Contabilidad',
    permisos: ['productos:ver', 'inventario:ver', 'ventas:ver', 'facturacion:ver', 'reportes:ver', 'reportes:fiscal', 'reportes:exportar', 'clientes:ver', 'proveedores:ver', 'auditoria:ver'],
  },
];

const UNIDADES: Array<[string, string, boolean]> = [
  ['UND', 'Unidad', false],
  ['M', 'Metro', true],
  ['L', 'Litro', true],
  ['KG', 'Kilogramo', true],
  ['GAL', 'Galón', false],
  ['PAR', 'Par', false],
  ['JGO', 'Juego', false],
  ['CAJA', 'Caja', false],
];

const MARCAS = ['Truper', 'Stanley', 'DeWalt', 'Sylvania', 'Bosch', 'NGK', 'Fram', 'Castrol', 'ACDelco', '3M', 'Genérica'];

async function main() {
  console.log('— Seed Auto Master Colón —');

  // 1. Tenant (empresa) — datos fiscales placeholder hasta recibir los reales
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      nombre: 'Auto Master Colón',
      razonSocial: 'Auto Master Colón, S.A.',
      ruc: '155000000-2-2026', dv: '00',
      direccion: 'Colón, Panamá',
      telefono: '+507 400-0000',
    },
  });

  // 2. Sucursales (D-019: dos sucursales)
  const sucursales: Record<string, { id: string }> = {};
  for (const s of [
    { codigo: '0001', nombre: 'Sucursal Centro', direccion: 'Calle Central, Colón' },
    { codigo: '0002', nombre: 'Sucursal Sabanitas', direccion: 'Sabanitas, Colón' },
  ]) {
    sucursales[s.codigo] = await prisma.sucursal.upsert({
      where: { tenantId_codigo: { tenantId: TENANT_ID, codigo: s.codigo } },
      update: { nombre: s.nombre },
      create: { tenantId: TENANT_ID, ...s },
    });
  }

  // 3. Permisos
  for (const [codigo, descripcion] of PERMISOS) {
    await prisma.permiso.upsert({ where: { codigo }, update: { descripcion }, create: { codigo, descripcion } });
  }
  const todosPermisos = await prisma.permiso.findMany();
  const permisoId = (codigo: string) => {
    const p = todosPermisos.find((x) => x.codigo === codigo);
    if (!p) throw new Error(`Permiso no sembrado: ${codigo}`);
    return p.id;
  };

  // 4. Roles + rol_permiso (matriz 09 §3.3)
  for (const r of ROLES) {
    const rol = await prisma.rol.upsert({
      where: { tenantId_codigo: { tenantId: TENANT_ID, codigo: r.codigo } },
      update: { nombre: r.nombre },
      create: { tenantId: TENANT_ID, codigo: r.codigo, nombre: r.nombre, esSistema: true },
    });
    const codigos = r.permisos === 'ALL' ? PERMISOS.map(([c]) => c) : r.permisos;
    await prisma.rolPermiso.deleteMany({ where: { rolId: rol.id } });
    await prisma.rolPermiso.createMany({ data: codigos.map((c) => ({ rolId: rol.id, permisoId: permisoId(c) })) });
  }
  const roles = await prisma.rol.findMany({ where: { tenantId: TENANT_ID } });
  const rolId = (codigo: string) => roles.find((r) => r.codigo === codigo)!.id;

  // 5. Usuarios demo
  for (const u of USUARIOS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const usuario = await prisma.usuario.upsert({
      where: { tenantId_usuario: { tenantId: TENANT_ID, usuario: u.usuario } },
      update: { nombre: u.nombre },
      create: { tenantId: TENANT_ID, usuario: u.usuario, nombre: u.nombre, passwordHash, debeCambiarClave: true },
    });
    await prisma.usuarioRol.deleteMany({ where: { usuarioId: usuario.id } });
    await prisma.usuarioRol.createMany({ data: u.roles.map((r) => ({ usuarioId: usuario.id, rolId: rolId(r) })) });
    await prisma.usuarioSucursal.deleteMany({ where: { usuarioId: usuario.id } });
    await prisma.usuarioSucursal.createMany({ data: u.sucursales.map((s) => ({ usuarioId: usuario.id, sucursalId: sucursales[s].id })) });
  }

  // 6. Unidades de medida
  const unidades: Record<string, string> = {};
  for (const [codigo, nombre, permiteDecimales] of UNIDADES) {
    const u = await prisma.unidadMedida.upsert({
      where: { tenantId_codigo: { tenantId: TENANT_ID, codigo } },
      update: {},
      create: { tenantId: TENANT_ID, codigo, nombre, permiteDecimales },
    });
    unidades[codigo] = u.id;
  }

  // 7. Marcas
  const marcas: Record<string, string> = {};
  for (const nombre of MARCAS) {
    const m = await prisma.marca.upsert({
      where: { tenantId_nombre: { tenantId: TENANT_ID, nombre } },
      update: {},
      create: { tenantId: TENANT_ID, nombre },
    });
    marcas[nombre] = m.id;
  }

  // 8. Categorías (árbol) — RN-020: tipo define esquema de atributos
  async function categoria(nombre: string, tipo: TipoProducto, padreId?: string) {
    const existente = await prisma.categoria.findFirst({ where: { tenantId: TENANT_ID, nombre, padreId: padreId ?? null } });
    if (existente) return existente;
    return prisma.categoria.create({ data: { tenantId: TENANT_ID, nombre, tipo, padreId } });
  }
  const catFerreteria = await categoria('Ferretería', TipoProducto.FERRETERIA);
  const catAutopartes = await categoria('Autopartes', TipoProducto.AUTOPARTE);
  const cats: Record<string, { id: string }> = {
    Herramientas: await categoria('Herramientas', TipoProducto.FERRETERIA, catFerreteria.id),
    Electrico: await categoria('Eléctrico', TipoProducto.FERRETERIA, catFerreteria.id),
    Plomeria: await categoria('Plomería', TipoProducto.FERRETERIA, catFerreteria.id),
    Pinturas: await categoria('Pinturas', TipoProducto.FERRETERIA, catFerreteria.id),
    Fijaciones: await categoria('Fijaciones', TipoProducto.FERRETERIA, catFerreteria.id),
    Filtros: await categoria('Filtros', TipoProducto.AUTOPARTE, catAutopartes.id),
    Frenos: await categoria('Frenos', TipoProducto.AUTOPARTE, catAutopartes.id),
    Baterias: await categoria('Baterías', TipoProducto.AUTOPARTE, catAutopartes.id),
    Lubricantes: await categoria('Lubricantes', TipoProducto.AUTOPARTE, catAutopartes.id),
    Bujias: await categoria('Encendido', TipoProducto.AUTOPARTE, catAutopartes.id),
    Consumo: await categoria('Consumo', TipoProducto.GENERAL, catFerreteria.id),
  };

  // 9. Definiciones de atributos por categoría (ADR-DB-001 opción D)
  async function atributo(catId: string, clave: string, nombre: string, tipo: AtributoTipo, extra: Partial<{ unidad: string; opciones: string[]; requerido: boolean; orden: number }> = {}) {
    return prisma.atributoDef.upsert({
      where: { categoriaId_clave: { categoriaId: catId, clave } },
      update: {},
      create: { tenantId: TENANT_ID, categoriaId: catId, clave, nombre, tipo, ...extra },
    });
  }
  const attrs: Record<string, { id: string }> = {};
  attrs['herr.material'] = await atributo(cats.Herramientas.id, 'material', 'Material', AtributoTipo.TEXTO, { orden: 1 });
  attrs['elec.voltaje'] = await atributo(cats.Electrico.id, 'voltaje', 'Voltaje', AtributoTipo.NUMERO, { unidad: 'V', orden: 1 });
  attrs['elec.calibre'] = await atributo(cats.Electrico.id, 'calibre', 'Calibre', AtributoTipo.TEXTO, { orden: 2 });
  attrs['plom.medida'] = await atributo(cats.Plomeria.id, 'medida', 'Medida', AtributoTipo.TEXTO, { unidad: 'pulg', orden: 1 });
  attrs['pint.color'] = await atributo(cats.Pinturas.id, 'color', 'Color', AtributoTipo.TEXTO, { orden: 1 });
  attrs['pint.present'] = await atributo(cats.Pinturas.id, 'presentacion', 'Presentación', AtributoTipo.LISTA, { opciones: ['1/4 galón', '1 galón', '5 galones'], orden: 2 });
  attrs['filt.tipo'] = await atributo(cats.Filtros.id, 'tipo_filtro', 'Tipo de filtro', AtributoTipo.LISTA, { opciones: ['Aceite', 'Aire', 'Combustible', 'Cabina'], requerido: true, orden: 1 });
  attrs['fren.posicion'] = await atributo(cats.Frenos.id, 'posicion', 'Posición', AtributoTipo.LISTA, { opciones: ['Delantera', 'Trasera'], orden: 1 });
  attrs['bat.voltaje'] = await atributo(cats.Baterias.id, 'voltaje', 'Voltaje', AtributoTipo.NUMERO, { unidad: 'V', orden: 1 });
  attrs['bat.amperaje'] = await atributo(cats.Baterias.id, 'amperaje', 'Amperaje (CCA)', AtributoTipo.NUMERO, { unidad: 'A', orden: 2 });
  attrs['lub.viscosidad'] = await atributo(cats.Lubricantes.id, 'viscosidad', 'Viscosidad', AtributoTipo.TEXTO, { orden: 1 });

  // 10. Productos con código interno (D-028), códigos múltiples (RN-021), EAV, stock inicial
  type ProdSeed = {
    sku: string; nombre: string; descripcion?: string; tipo: TipoProducto; cat: keyof typeof cats | null;
    marca?: string; unidad: string; precio: string; tasa?: string; fraccionada?: boolean; stockMin?: string;
    codigos?: Array<[CodigoTipo, string]>;
    atributos?: Array<[string, string | number | boolean]>;
    compat?: Array<{ marca: string; modelo: string; anioDesde?: number; anioHasta?: number }>;
    stock: Array<[string, string, string]>; // [sucursal, cantidad, costoUnitario]
  };
  const productos: ProdSeed[] = [
    { sku: 'FER-0001', nombre: 'Martillo de uña 16 oz', tipo: TipoProducto.FERRETERIA, cat: 'Herramientas', marca: 'Truper', unidad: 'UND', precio: '7.50', stockMin: '5', atributos: [['herr.material', 'Acero / mango fibra de vidrio']], codigos: [[CodigoTipo.BARRA, '7501206611234']], stock: [['0001', '25', '4.10'], ['0002', '10', '4.10']] },
    { sku: 'FER-0002', nombre: 'Taladro percutor 1/2" 650W', tipo: TipoProducto.FERRETERIA, cat: 'Herramientas', marca: 'DeWalt', unidad: 'UND', precio: '89.99', stockMin: '2', codigos: [[CodigoTipo.BARRA, '885911471234']], stock: [['0001', '8', '52.00']] },
    { sku: 'FER-0003', nombre: 'Cable eléctrico THHN #12 (por metro)', tipo: TipoProducto.FERRETERIA, cat: 'Electrico', marca: 'Genérica', unidad: 'M', precio: '0.85', fraccionada: true, stockMin: '50', atributos: [['elec.calibre', '#12'], ['elec.voltaje', 600]], stock: [['0001', '305.5', '0.44'], ['0002', '120', '0.44']] },
    { sku: 'FER-0004', nombre: 'Bombillo LED 9W E27 luz blanca', tipo: TipoProducto.FERRETERIA, cat: 'Electrico', marca: 'Sylvania', unidad: 'UND', precio: '2.25', stockMin: '20', atributos: [['elec.voltaje', 110]], codigos: [[CodigoTipo.BARRA, '7501031412345']], stock: [['0001', '60', '1.15'], ['0002', '48', '1.15']] },
    { sku: 'FER-0005', nombre: 'Tubo PVC 1/2" x 6 m', tipo: TipoProducto.FERRETERIA, cat: 'Plomeria', marca: 'Genérica', unidad: 'UND', precio: '3.10', stockMin: '10', atributos: [['plom.medida', '1/2']], stock: [['0001', '40', '1.80']] },
    { sku: 'FER-0006', nombre: 'Pintura acrílica blanca 1 galón', tipo: TipoProducto.FERRETERIA, cat: 'Pinturas', marca: '3M', unidad: 'GAL', precio: '18.75', stockMin: '6', atributos: [['pint.color', 'Blanco'], ['pint.present', '1 galón']], stock: [['0001', '15', '11.20'], ['0002', '9', '11.20']] },
    { sku: 'FER-0007', nombre: 'Tornillo drywall 6x1" (caja 100)', tipo: TipoProducto.FERRETERIA, cat: 'Fijaciones', marca: 'Stanley', unidad: 'CAJA', precio: '4.50', stockMin: '10', stock: [['0001', '30', '2.35'], ['0002', '22', '2.35']] },
    { sku: 'FER-0008', nombre: 'Agua embotellada 500 ml', descripcion: 'Venta de mostrador — ejemplo de producto exento de ITBMS (RN-042)', tipo: TipoProducto.GENERAL, cat: 'Consumo', unidad: 'UND', precio: '0.75', tasa: '0', stockMin: '24', stock: [['0001', '48', '0.30']] },
    { sku: 'AUT-0001', nombre: 'Filtro de aceite PH3593A', tipo: TipoProducto.AUTOPARTE, cat: 'Filtros', marca: 'Fram', unidad: 'UND', precio: '6.95', stockMin: '8', atributos: [['filt.tipo', 'Aceite']], codigos: [[CodigoTipo.OEM, '15400-PLM-A02'], [CodigoTipo.BARRA, '009100031234']], compat: [{ marca: 'Honda', modelo: 'Civic', anioDesde: 2001, anioHasta: 2015 }], stock: [['0001', '20', '3.60'], ['0002', '14', '3.60']] },
    { sku: 'AUT-0002', nombre: 'Filtro de aire Corolla 09-19', tipo: TipoProducto.AUTOPARTE, cat: 'Filtros', marca: 'Fram', unidad: 'UND', precio: '12.50', stockMin: '5', atributos: [['filt.tipo', 'Aire']], codigos: [[CodigoTipo.OEM, '17801-21050']], compat: [{ marca: 'Toyota', modelo: 'Corolla', anioDesde: 2009, anioHasta: 2019 }], stock: [['0001', '12', '6.80']] },
    { sku: 'AUT-0003', nombre: 'Pastillas de freno delanteras Hilux', tipo: TipoProducto.AUTOPARTE, cat: 'Frenos', marca: 'ACDelco', unidad: 'JGO', precio: '24.90', stockMin: '4', atributos: [['fren.posicion', 'Delantera']], codigos: [[CodigoTipo.OEM, '04465-0K240']], compat: [{ marca: 'Toyota', modelo: 'Hilux', anioDesde: 2005, anioHasta: 2015 }], stock: [['0001', '8', '13.50'], ['0002', '6', '13.50']] },
    { sku: 'AUT-0004', nombre: 'Batería 12V 600 CCA S4', tipo: TipoProducto.AUTOPARTE, cat: 'Baterias', marca: 'Bosch', unidad: 'UND', precio: '129.00', stockMin: '2', atributos: [['bat.voltaje', 12], ['bat.amperaje', 600]], stock: [['0001', '6', '78.00']] },
    { sku: 'AUT-0005', nombre: 'Aceite motor 15W-40 GTX 1 galón', tipo: TipoProducto.AUTOPARTE, cat: 'Lubricantes', marca: 'Castrol', unidad: 'GAL', precio: '21.50', stockMin: '6', atributos: [['lub.viscosidad', '15W-40']], codigos: [[CodigoTipo.BARRA, '079191001234']], stock: [['0001', '18', '12.40'], ['0002', '10', '12.40']] },
    { sku: 'AUT-0006', nombre: 'Bujía BKR6E', tipo: TipoProducto.AUTOPARTE, cat: 'Bujias', marca: 'NGK', unidad: 'UND', precio: '3.25', stockMin: '16', codigos: [[CodigoTipo.OEM, 'BKR6E'], [CodigoTipo.PARTE, '6962']], stock: [['0001', '40', '1.55'], ['0002', '0', '1.55']] },
  ];

  const adminUser = await prisma.usuario.findUniqueOrThrow({ where: { tenantId_usuario: { tenantId: TENANT_ID, usuario: 'admin' } } });

  for (const p of productos) {
    const prod = await prisma.producto.upsert({
      where: { tenantId_sku: { tenantId: TENANT_ID, sku: p.sku } },
      update: { nombre: p.nombre, precioBase: p.precio },
      create: {
        tenantId: TENANT_ID, sku: p.sku, nombre: p.nombre, descripcion: p.descripcion, tipo: p.tipo,
        categoriaId: p.cat ? cats[p.cat].id : null, marcaId: p.marca ? marcas[p.marca] : null,
        unidadMedidaId: unidades[p.unidad], precioBase: p.precio, tasaItbms: p.tasa ?? '0.07',
        ventaFraccionada: !!p.fraccionada, stockMinimo: p.stockMin ?? '0',
      },
    });
    // Código interno = SKU (D-028: conservar y priorizar el código interno)
    const codigos: Array<[CodigoTipo, string]> = [[CodigoTipo.INTERNO, p.sku], ...(p.codigos ?? [])];
    for (const [tipo, valor] of codigos) {
      await prisma.productoCodigo.upsert({
        where: { tenantId_tipo_valor: { tenantId: TENANT_ID, tipo, valor } },
        update: {},
        create: { tenantId: TENANT_ID, productoId: prod.id, tipo, valor, principal: tipo === CodigoTipo.INTERNO },
      });
    }
    for (const [attrKey, valor] of p.atributos ?? []) {
      const def = attrs[attrKey];
      const data: Prisma.ProductoAtributoUncheckedCreateInput = {
        productoId: prod.id, atributoDefId: def.id,
        valorTexto: typeof valor === 'string' ? valor : null,
        valorNumero: typeof valor === 'number' ? valor : null,
        valorBool: typeof valor === 'boolean' ? valor : null,
      };
      await prisma.productoAtributo.upsert({
        where: { productoId_atributoDefId: { productoId: prod.id, atributoDefId: def.id } },
        update: { valorTexto: data.valorTexto, valorNumero: data.valorNumero, valorBool: data.valorBool },
        create: data,
      });
    }
    for (const c of p.compat ?? []) {
      const existe = await prisma.compatVehiculo.findFirst({ where: { productoId: prod.id, marca: c.marca, modelo: c.modelo } });
      if (!existe) await prisma.compatVehiculo.create({ data: { productoId: prod.id, ...c } });
    }
    // Stock inicial: movimiento ENTRADA_INICIAL + stock materializado en la misma transacción (RN-005/006)
    for (const [suc, cantidad, costo] of p.stock) {
      const sucId = sucursales[suc].id;
      const yaSembrado = await prisma.movimientoInv.findFirst({ where: { productoId: prod.id, sucursalId: sucId, tipo: MovTipo.ENTRADA_INICIAL } });
      if (yaSembrado) continue;
      await prisma.$transaction(async (tx) => {
        await tx.stock.upsert({
          where: { productoId_sucursalId: { productoId: prod.id, sucursalId: sucId } },
          update: { cantidad, costoPromedio: costo },
          create: { tenantId: TENANT_ID, productoId: prod.id, sucursalId: sucId, cantidad, costoPromedio: costo },
        });
        await tx.movimientoInv.create({
          data: {
            tenantId: TENANT_ID, productoId: prod.id, sucursalId: sucId, tipo: MovTipo.ENTRADA_INICIAL,
            cantidad, costoUnitario: costo, saldoResultante: cantidad,
            refTipo: RefTipo.SEED, motivo: 'Inventario inicial (seed)', usuarioId: adminUser.id,
          },
        });
      });
    }
  }

  // 11. Clientes: consumidor final (default POS) + clientes con datos
  let consumidorFinal = await prisma.cliente.findFirst({ where: { tenantId: TENANT_ID, tipo: ClienteTipo.CONSUMIDOR_FINAL } });
  if (!consumidorFinal) {
    consumidorFinal = await prisma.cliente.create({ data: { tenantId: TENANT_ID, tipo: ClienteTipo.CONSUMIDOR_FINAL, nombre: 'Consumidor Final' } });
  }
  async function cliente(nombre: string, data: Partial<Parameters<typeof prisma.cliente.create>[0]['data']> = {}) {
    const existe = await prisma.cliente.findFirst({ where: { tenantId: TENANT_ID, nombre } });
    return existe ?? prisma.cliente.create({ data: { tenantId: TENANT_ID, nombre, tipo: ClienteTipo.JURIDICO, ...data } as any });
  }
  const taller = await cliente('Taller Hermanos Pérez', { rucOCedula: '8-765-4321', telefono: '+507 6000-0001', direccion: 'Calle 5, Colón' });
  await cliente('Constructora Colón, S.A.', { rucOCedula: '155612345-2-2019', dv: '25', telefono: '+507 430-1122' });

  // Precio especial (D-024): el taller compra el filtro AUT-0001 a mejor precio
  const filtro = await prisma.producto.findUniqueOrThrow({ where: { tenantId_sku: { tenantId: TENANT_ID, sku: 'AUT-0001' } } });
  await prisma.precioEspecial.upsert({
    where: { clienteId_productoId: { clienteId: taller.id, productoId: filtro.id } },
    update: { precio: '5.95' },
    create: { tenantId: TENANT_ID, clienteId: taller.id, productoId: filtro.id, precio: '5.95' },
  });

  // 12. Proveedores
  for (const pr of [
    { nombre: 'Distribuidora Ferretera Panamá, S.A.', ruc: '155698765-2-2018', telefono: '+507 261-5500' },
    { nombre: 'Auto Partes del Istmo, S.A.', ruc: '155611223-2-2020', telefono: '+507 441-8899' },
  ]) {
    const existe = await prisma.proveedor.findFirst({ where: { tenantId: TENANT_ID, nombre: pr.nombre } });
    if (!existe) await prisma.proveedor.create({ data: { tenantId: TENANT_ID, ...pr } });
  }

  // 13. Secuencias de documentos por punto de emisión (Q-022/BL-016)
  for (const suc of Object.values(sucursales)) {
    for (const tipo of [DocTipo.VENTA, DocTipo.FACTURA, DocTipo.NOTA_CREDITO]) {
      await prisma.secuenciaDocumento.upsert({
        where: { tenantId_sucursalId_tipo: { tenantId: TENANT_ID, sucursalId: suc.id, tipo } },
        update: {},
        create: { tenantId: TENANT_ID, sucursalId: suc.id, tipo },
      });
    }
  }

  // 14. Configuración
  const CONFIG: Array<[string, unknown]> = [
    ['descuento_max_pct_sin_autorizacion', 5],
    ['itbms_tasa_default', 0.07],
    ['moneda', 'PAB'],
    ['moneda_simbolo', 'B/.'],
    ['factura_papel', 'CARTA'],
    ['zona_horaria', 'America/Panama'],
  ];
  for (const [clave, valor] of CONFIG) {
    await prisma.configuracion.upsert({
      where: { tenantId_clave: { tenantId: TENANT_ID, clave } },
      update: {},
      create: { tenantId: TENANT_ID, clave, valor: valor as Prisma.InputJsonValue },
    });
  }

  const counts = {
    permisos: await prisma.permiso.count(),
    roles: await prisma.rol.count(),
    usuarios: await prisma.usuario.count(),
    productos: await prisma.producto.count(),
    stocks: await prisma.stock.count(),
    movimientos: await prisma.movimientoInv.count(),
    clientes: await prisma.cliente.count(),
  };
  console.log('Seed OK:', JSON.stringify(counts));
  console.log('Usuarios demo:', USUARIOS.map((u) => u.usuario).join(', '), '(contraseñas temporales en BUILD-LOG.md §2)');
}

main()
  .catch((e) => {
    console.error('Seed FALLÓ:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
