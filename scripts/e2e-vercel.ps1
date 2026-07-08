# Smoke E2E sobre el despliegue de Vercel (BL-017): flujo completo de la Definición de Terminado.
# login → RBAC → producto → venta 2 pasos → cobro (método+vuelto) → factura contingencia → inventario/auditoría → dashboard.
# Uso: powershell -File scripts/e2e-vercel.ps1 [-Base https://auto-master-erp-web.vercel.app]
param([string]$Base = 'https://auto-master-erp-web.vercel.app')

$ErrorActionPreference = 'Stop'
$tmp = Join-Path $env:TEMP "am-e2e-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $tmp | Out-Null
$fallos = 0

function Check([string]$nombre, [bool]$ok, [string]$detalle = '') {
  if ($ok) { Write-Host "[OK]   $nombre $detalle" } else { Write-Host "[FALLO] $nombre $detalle"; $script:fallos++ }
}

function Llamar([string]$jar, [string]$metodo, [string]$ruta, $cuerpo = $null, [hashtable]$headers = @{}) {
  $args = @('-s', '-X', $metodo, "$Base$ruta", '-b', $jar, '-c', $jar, '-H', 'Content-Type: application/json')
  foreach ($k in $headers.Keys) { $args += @('-H', "${k}: $($headers[$k])") }
  if ($null -ne $cuerpo) {
    $f = Join-Path $tmp ([guid]::NewGuid().ToString('N') + '.json')
    [IO.File]::WriteAllText($f, ($cuerpo | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
    $args += @('-d', "@$f")
  }
  $raw = & curl.exe @args
  if ($raw) { return $raw | ConvertFrom-Json } else { return $null }
}

Write-Host "== Smoke E2E contra $Base =="

# 0. Web viva
$html = & curl.exe -s -o "$tmp\home.html" -w '%{http_code}' "$Base/login"
Check 'Web /login responde 200' ($html -eq '200')

# 1. Salud del API a través del proxy del web (cookie primera parte, BL-006)
$salud = Llamar "$tmp\anon.txt" GET '/api/v1/health'
Check 'API health via proxy (BD ok)' ($salud.estado -eq 'ok' -and $salud.db -eq 'ok')

# 2. Logins
$jarV = "$tmp\vendedor.txt"; $jarC = "$tmp\caja.txt"; $jarA = "$tmp\admin.txt"
$null = Llamar $jarV POST '/api/v1/auth/login' @{ usuario = 'vendedor'; password = 'Vendedor#2026' }
$meV = Llamar $jarV GET '/api/v1/auth/me'
Check 'Login vendedor + cookie por proxy' ($meV.usuario.usuario -eq 'vendedor')
$null = Llamar $jarC POST '/api/v1/auth/login' @{ usuario = 'caja'; password = 'Caja#2026' }
$null = Llamar $jarA POST '/api/v1/auth/login' @{ usuario = 'admin'; password = 'AutoMaster#2026' }
$suc = $meV.sucursales | Where-Object { $_.codigo -eq '0001' } | Select-Object -First 1
$H = @{ 'X-Sucursal-Id' = $suc.id }

# 3. RBAC: vendedor NO puede abrir caja (SIN_PERMISO)
$rbac = Llamar $jarV POST '/api/v1/caja/sesiones' @{ montoInicial = '1.00' } $H
Check 'RBAC: vendedor no abre caja (SIN_PERMISO)' ($rbac.error.codigo -eq 'SIN_PERMISO')

# 4. Producto seed localizable por código interno (D-021/D-028)
$busq = Llamar $jarV GET '/api/v1/productos/buscar?q=FER-0001' $null $H
$prod = $busq.datos | Select-Object -First 1
Check 'Búsqueda por código interno FER-0001' ($prod.sku -eq 'FER-0001')

# 5. Paso 1: vendedor arma la venta (2 uds → ITBMS 7%)
$venta = Llamar $jarV POST '/api/v1/ventas' @{ lineas = @(@{ productoId = $prod.id; cantidad = '2' }); idempotencyKey = [guid]::NewGuid().ToString() } $H
Check 'Venta creada en PREPARACION' ($venta.venta.estado -eq 'PREPARACION') "total=$($venta.venta.total)"
$totalVenta = [decimal]$venta.venta.total

# 6. Caja: abrir si hace falta y cobrar (paso 2, atómico)
$estadoCaja = Llamar $jarC GET '/api/v1/caja/estado' $null $H
if (-not $estadoCaja.abierta) { $null = Llamar $jarC POST '/api/v1/caja/sesiones' @{ montoInicial = '100.00' } $H; $estadoCaja = Llamar $jarC GET '/api/v1/caja/estado' $null $H }
Check 'Caja abierta' ($estadoCaja.abierta -eq $true)
$efectivoAntes = [decimal]$estadoCaja.esperado.EFECTIVO

$cobro = Llamar $jarC POST "/api/v1/ventas/$($venta.venta.id)/cobrar" @{
  pagos = @(@{ metodo = 'EFECTIVO'; monto = $totalVenta.ToString('0.00', [Globalization.CultureInfo]::InvariantCulture) })
  efectivoRecibido = ($totalVenta + 10).ToString('0.00', [Globalization.CultureInfo]::InvariantCulture)
  idempotencyKey = [guid]::NewGuid().ToString()
} $H
Check 'Cobro COBRADA con número' ($cobro.estado -eq 'COBRADA' -and $cobro.numero -match '^V-0001-\d{8}$') $cobro.numero
Check 'Vuelto = 10.00' ([decimal]$cobro.vuelto -eq 10)
Check 'Factura en contingencia con CUFE simulado' ($cobro.factura.estado -eq 'PENDIENTE_TRANSMISION' -and $cobro.factura.cufe -like 'FE-SIM-*') $cobro.factura.numero

# 7. Efectos atómicos: caja suma el cobro; kardex tiene la salida ligada a la venta
$estadoCaja2 = Llamar $jarC GET '/api/v1/caja/estado' $null $H
Check 'Caja registró el pago por método' (([decimal]$estadoCaja2.esperado.EFECTIVO) -eq ($efectivoAntes + $totalVenta))
$kardex = Llamar $jarA GET "/api/v1/inventario/productos/$($prod.id)/kardex?limit=5" $null $H
$salida = $kardex.datos | Where-Object { $_.tipo -eq 'SALIDA_VENTA' -and $_.refId -eq $venta.venta.id }
Check 'Movimiento inmutable SALIDA_VENTA (RN-005/006)' ($null -ne $salida)
$aud = Llamar $jarA GET "/api/v1/auditoria?entidad=venta&entidadId=$($venta.venta.id)" $null $H
$cobros = @(@($aud.datos) | Where-Object { $_.accion -eq 'venta.cobrar' })
Check 'Auditoría venta.cobrar (RN-182)' ($cobros.Count -ge 1)

# 8. Factura imprimible (datos carta) + dashboard
$imp = Llamar $jarA GET "/api/v1/facturas/$($cobro.factura.id)/impresion" $null $H
Check 'Snapshot de impresión (carta) completo' ($imp.snapshot.lineas.Count -ge 1 -and $imp.snapshot.totales.total -eq $cobro.total)
$dash = Llamar $jarA GET '/api/v1/dashboard' $null $H
Check 'Dashboard con ventas de hoy' ($dash.hoy.ventas -ge 1)

Remove-Item -Recurse -Force $tmp
Write-Host "== Resultado: $(if ($fallos -eq 0) { 'TODO OK ✔' } else { "$fallos fallo(s)" }) =="
exit $fallos
