# ============================================================================
# FINTEC - Verificacion de endpoints de la API desplegada (Windows)
# ============================================================================
# Uso:
#   .\verificar.ps1 -BaseUrl https://fintec-api.onrender.com
#   .\verificar.ps1 -BaseUrl https://fintec-api.onrender.com -Usuario demo@fintec.com -Password Demo1234
#   .\verificar.ps1 -BaseUrl http://localhost:10000
#
# Si se pasan -Usuario y -Password, hace login real, guarda el token JWT y lo
# usa en los endpoints protegidos. Sin credenciales, un 401 en los endpoints
# protegidos es la respuesta CORRECTA.
#
# Si PowerShell bloquea el script:
#   powershell -ExecutionPolicy Bypass -File .\verificar.ps1 -BaseUrl <url>
#
# Usa curl.exe, que viene incluido en Windows 10/11.
# ============================================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$BaseUrl,

    [Parameter(Position = 1)]
    [string]$Usuario = "",

    [Parameter(Position = 2)]
    [string]$Password = ""
)

$ErrorActionPreference = "Continue"

# Quita la barra final para no generar URLs con //
$BaseUrl = $BaseUrl.TrimEnd('/')

# Timeout generoso: un servicio gratuito suspendido tarda ~1 minuto en
# despertar y la primera peticion espera todo ese tiempo.
$Timeout = 75

$curl = (Get-Command curl.exe -ErrorAction SilentlyContinue)
if (-not $curl) {
    Write-Host "ERROR: no se encontro curl.exe. En Windows 10/11 viene incluido." -ForegroundColor Red
    Write-Host "Alternativa: usar verificar.sh desde Git Bash o WSL."
    exit 2
}
$curlPath = $curl.Source

$script:OK      = 0
$script:Fallos  = 0
$script:Avisos  = 0
$script:Token   = ""

Write-Host ""
Write-Host "=====================================================" -ForegroundColor White
Write-Host " FINTEC - verificacion de la API" -ForegroundColor White
Write-Host "=====================================================" -ForegroundColor White
Write-Host " URL base : " -NoNewline; Write-Host $BaseUrl -ForegroundColor Cyan
if ($Usuario) {
    Write-Host " Login    : " -NoNewline; Write-Host $Usuario -ForegroundColor Cyan -NoNewline
    Write-Host " (se usara el token en los demas endpoints)"
} else {
    Write-Host " Login    : " -NoNewline; Write-Host "sin credenciales" -ForegroundColor Yellow -NoNewline
    Write-Host " (se espera 401 en endpoints protegidos)"
}
Write-Host " Timeout  : $Timeout s por peticion"
Write-Host ""
Write-Host "Nota: si el servicio estaba suspendido por inactividad, la primera" -ForegroundColor Yellow
Write-Host "peticion puede tardar cerca de un minuto. Es normal." -ForegroundColor Yellow
Write-Host ""

# ---------------------------------------------------------------------------
# Invoke-Curl: devuelve @{ Code; Time; Body }  (Code = "000" si no respondio)
# ---------------------------------------------------------------------------
function Invoke-Curl {
    param(
        [string]$Metodo,
        [string]$Url,
        [string]$Cuerpo = "",
        [switch]$ConToken,
        [switch]$IncluirBody
    )

    $curlArgs = @('-s', '-S', '--max-time', "$Timeout", '-X', $Metodo, $Url)

    if ($Cuerpo) {
        $curlArgs += @('-H', 'Content-Type: application/json', '--data', $Cuerpo)
    }
    if ($ConToken -and $script:Token) {
        $curlArgs += @('-H', "Authorization: Bearer $($script:Token)")
    }

    if ($IncluirBody) {
        # El cuerpo viene primero y la ultima linea es "codigo tiempo".
        $curlArgs += @('-w', "`n%{http_code} %{time_total}")
    } else {
        $curlArgs += @('-o', 'NUL', '-w', '%{http_code} %{time_total}')
    }

    $salida = & $curlPath @curlArgs 2>$null
    if ($null -eq $salida) { return @{ Code = "000"; Time = "0"; Body = "" } }

    $lineas = @($salida -split "`r?`n")
    $ultima = $lineas[-1]
    $body   = if ($lineas.Count -gt 1) { ($lineas[0..($lineas.Count - 2)] -join "`n") } else { "" }

    $partes = $ultima.Trim() -split '\s+'
    $codigo = if ($partes.Count -ge 1 -and $partes[0]) { $partes[0] } else { "000" }
    $tiempo = if ($partes.Count -ge 2) { $partes[1] } else { "0" }

    return @{ Code = $codigo; Time = $tiempo; Body = $body }
}

# ---------------------------------------------------------------------------
# Probar: ejecuta y clasifica el resultado
# ---------------------------------------------------------------------------
function Probar {
    param(
        [string]$Metodo,
        [string]$Ruta,
        [string]$Desc,
        [int[]]$Esperados,
        [string]$Cuerpo = "",
        [switch]$ConToken
    )

    $etiqueta = "{0,-7} {1,-26} " -f $Metodo, $Ruta
    Write-Host " $etiqueta" -NoNewline

    $r = Invoke-Curl -Metodo $Metodo -Url "$BaseUrl$Ruta" -Cuerpo $Cuerpo -ConToken:$ConToken

    if ($r.Code -eq "000") {
        Write-Host "SIN RESPUESTA" -ForegroundColor Red -NoNewline
        Write-Host "  (timeout, DNS o servicio caido)"
        $script:Fallos++
        return
    }

    $codigoNum = 0
    [void][int]::TryParse($r.Code, [ref]$codigoNum)

    if ($Esperados -contains $codigoNum) {
        Write-Host "HTTP $($r.Code)" -ForegroundColor Green -NoNewline
        Write-Host "  $($r.Time)s   $Desc"
        $script:OK++
    }
    elseif ($codigoNum -ge 500) {
        Write-Host "HTTP $($r.Code)" -ForegroundColor Red -NoNewline
        Write-Host "  $($r.Time)s   $Desc -> ERROR DEL SERVIDOR, revisa los Logs en Render"
        $script:Fallos++
    }
    elseif ($codigoNum -eq 404) {
        Write-Host "HTTP 404" -ForegroundColor Red -NoNewline
        Write-Host "  $($r.Time)s   $Desc -> la ruta no existe (ojo al prefijo /api)"
        $script:Fallos++
    }
    else {
        Write-Host "HTTP $($r.Code)" -ForegroundColor Yellow -NoNewline
        Write-Host "  $($r.Time)s   $Desc -> responde, pero no era el codigo esperado ($($Esperados -join '/'))"
        $script:Avisos++
    }
}

# ---------------------------------------------------------------------------
# 0) Disponibilidad
# ---------------------------------------------------------------------------
Write-Host "--- Disponibilidad ---------------------------------" -ForegroundColor White
Probar -Metodo GET -Ruta "/"            -Desc "raiz del servicio" -Esperados 200,301,302,404
Probar -Metodo GET -Ruta "/api/health"  -Desc "health check"      -Esperados 200,404
Write-Host ""

# ---------------------------------------------------------------------------
# 1) Autenticacion
# ---------------------------------------------------------------------------
Write-Host "--- Autenticacion ----------------------------------" -ForegroundColor White

if ($Usuario -and $Password) {
    Write-Host (" {0,-7} {1,-26} " -f "POST", "/api/auth/login") -NoNewline

    $json = @{ email = $Usuario; password = $Password } | ConvertTo-Json -Compress
    $r = Invoke-Curl -Metodo POST -Url "$BaseUrl/api/auth/login" -Cuerpo $json -IncluirBody

    if ($r.Code -eq "000") {
        Write-Host "SIN RESPUESTA" -ForegroundColor Red -NoNewline
        Write-Host "  (timeout o servicio caido)"
        $script:Fallos++
    }
    elseif ($r.Code -eq "200" -or $r.Code -eq "201") {
        # Intenta parsear el JSON; si no es JSON valido, busca el token por regex.
        $tok = $null
        try {
            $obj = $r.Body | ConvertFrom-Json
            foreach ($campo in @('token', 'accessToken', 'jwt')) {
                if ($obj.PSObject.Properties.Name -contains $campo -and $obj.$campo) {
                    $tok = $obj.$campo; break
                }
            }
            # Algunas APIs lo anidan: { data: { token: ... } }
            if (-not $tok -and $obj.PSObject.Properties.Name -contains 'data') {
                foreach ($campo in @('token', 'accessToken', 'jwt')) {
                    if ($obj.data.PSObject.Properties.Name -contains $campo -and $obj.data.$campo) {
                        $tok = $obj.data.$campo; break
                    }
                }
            }
        } catch {
            $m = [regex]::Match($r.Body, '"(?:token|accessToken|jwt)"\s*:\s*"([^"]+)"')
            if ($m.Success) { $tok = $m.Groups[1].Value }
        }

        if ($tok) {
            $script:Token = $tok
            Write-Host "HTTP $($r.Code)" -ForegroundColor Green -NoNewline
            Write-Host "       login correcto, token obtenido"
        } else {
            Write-Host "HTTP $($r.Code)" -ForegroundColor Yellow -NoNewline
            Write-Host "       login 200 pero NO se encontro token en el JSON"
            $corte = [Math]::Min(200, $r.Body.Length)
            Write-Host "           respuesta: $($r.Body.Substring(0, $corte))"
            $script:Avisos++
        }
        $script:OK++
    }
    elseif ($r.Code -eq "401" -or $r.Code -eq "400") {
        Write-Host "HTTP $($r.Code)" -ForegroundColor Red -NoNewline
        Write-Host "       credenciales rechazadas -> ¿corrio el seed? ¿usuario/clave correctos?"
        $script:Fallos++
    }
    else {
        Write-Host "HTTP $($r.Code)" -ForegroundColor Red -NoNewline
        Write-Host "       respuesta inesperada en el login"
        $script:Fallos++
    }

    Probar -Metodo POST -Ruta "/api/auth/login" `
           -Desc "credenciales invalidas deben dar 400/401" -Esperados 400,401,422 `
           -Cuerpo '{"email":"noexiste@fintec.test","password":"clave-incorrecta"}'
}
else {
    Probar -Metodo POST -Ruta "/api/auth/login" `
           -Desc "la ruta existe y valida (400/401 esperado)" -Esperados 400,401,422 `
           -Cuerpo '{"email":"noexiste@fintec.test","password":"clave-incorrecta"}'
}
Write-Host ""

# ---------------------------------------------------------------------------
# 2) Endpoints protegidos
# ---------------------------------------------------------------------------
Write-Host "--- Endpoints protegidos ---------------------------" -ForegroundColor White

if ($script:Token) {
    Probar -Metodo GET -Ruta "/api/cuenta/me"        -Desc "datos de la cuenta"   -Esperados 200 -ConToken
    Probar -Metodo GET -Ruta "/api/movimientos"      -Desc "lista de movimientos" -Esperados 200 -ConToken
    Probar -Metodo GET -Ruta "/api/contable/resumen" -Desc "resumen contable"     -Esperados 200 -ConToken

    Write-Host ""
    Write-Host "--- Control de acceso (sin token) ------------------" -ForegroundColor White
    $guardado = $script:Token
    $script:Token = ""
    Probar -Metodo GET -Ruta "/api/cuenta/me"        -Desc "sin token debe dar 401" -Esperados 401,403
    Probar -Metodo GET -Ruta "/api/movimientos"      -Desc "sin token debe dar 401" -Esperados 401,403
    Probar -Metodo GET -Ruta "/api/contable/resumen" -Desc "sin token debe dar 401" -Esperados 401,403
    $script:Token = $guardado
}
else {
    Write-Host " Sin token: se espera 401. Un 200 aqui seria un FALLO DE SEGURIDAD." -ForegroundColor Yellow
    Probar -Metodo GET -Ruta "/api/cuenta/me"        -Desc "sin token debe dar 401" -Esperados 401,403
    Probar -Metodo GET -Ruta "/api/movimientos"      -Desc "sin token debe dar 401" -Esperados 401,403
    Probar -Metodo GET -Ruta "/api/contable/resumen" -Desc "sin token debe dar 401" -Esperados 401,403
    Write-Host ""
    Write-Host " Para probar las respuestas 200, vuelve a ejecutar con credenciales:" -ForegroundColor Yellow
    Write-Host "   .\verificar.ps1 -BaseUrl $BaseUrl -Usuario <usuario> -Password <password>"
}

# ---------------------------------------------------------------------------
# Resumen
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "=====================================================" -ForegroundColor White
Write-Host " Correctos: " -NoNewline; Write-Host $script:OK -ForegroundColor Green -NoNewline
Write-Host "   Avisos: " -NoNewline;  Write-Host $script:Avisos -ForegroundColor Yellow -NoNewline
Write-Host "   Fallos: " -NoNewline;  Write-Host $script:Fallos -ForegroundColor Red
Write-Host "=====================================================" -ForegroundColor White

if ($script:Fallos -gt 0) {
    Write-Host ""
    Write-Host " Que revisar:"
    Write-Host "  - Render > servicio fintec-api > pestana Logs (errores en ejecucion)"
    Write-Host "  - Render > servicio fintec-api > pestana Events (errores de build)"
    Write-Host "  - 'relation ... does not exist'  -> faltan las migraciones (paso 7)"
    Write-Host "  - 'ECONNREFUSED' / 'ENOTFOUND'   -> DATABASE_URL o regiones distintas"
    Write-Host "  - 404 en todo                    -> revisa el prefijo de rutas (/api)"
    Write-Host "  - SIN RESPUESTA en todo          -> servicio suspendido, caido o URL mal"
    Write-Host ""
    exit 1
}

if ($script:Avisos -gt 0) {
    Write-Host ""
    Write-Host " Sin fallos, pero hay avisos: comprueba a mano los codigos marcados."
    Write-Host ""
    exit 0
}

Write-Host ""
Write-Host " Todo responde como se esperaba." -ForegroundColor Green
Write-Host ""
exit 0
