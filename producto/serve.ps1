$prefix = 'http://localhost:8765/'
# Sirve la carpeta donde vive este script, sea cual sea su ubicacion
$root = $PSScriptRoot
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Serving $root on $prefix"
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $relPath = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ([string]::IsNullOrEmpty($relPath)) { $relPath = 'Fintec.html' }
    $rootFull = [System.IO.Path]::GetFullPath($root).TrimEnd('') + ''
    try { $full = [System.IO.Path]::GetFullPath((Join-Path $root $relPath)) } catch { $full = $null }
    # Solo se sirve lo que quede dentro de la carpeta raiz (bloquea ../ y %2e%2e%2f)
    if ($full -and -not $full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
      $ctx.Response.StatusCode = 403
      $msg = [Text.Encoding]::UTF8.GetBytes('Forbidden')
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
      $ctx.Response.Close()
      continue
    }
    if ($full -and (Test-Path -LiteralPath $full -PathType Leaf)) {
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $ctype = switch ($ext) {
        '.html' { 'text/html; charset=utf-8' }
        '.js'   { 'text/javascript; charset=utf-8' }
        '.css'  { 'text/css; charset=utf-8' }
        '.json' { 'application/json; charset=utf-8' }
        default { 'application/octet-stream' }
      }
      $ctx.Response.ContentType = $ctype
      $ctx.Response.StatusCode = 200
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $msg = [Text.Encoding]::UTF8.GetBytes('Not found: ' + $relPath)
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $ctx.Response.Close()
  }
} finally {
  $listener.Stop()
}
