Add-Type -AssemblyName System.IO.Compression.FileSystem
$src = 'C:\Users\USUARIO\Desktop\Nueva carpeta (2)'
$files = @(
  'FINTEC_-_Especificacion_de_Requisitos_CORREGIDO.docx',
  'Actividad - Plan de calidad y pruebas del producto_100896542.docx'
)
foreach ($f in $files) {
  $p   = Join-Path $src $f
  $out = Join-Path $src ($f -replace '\.docx$','_unzipped')
  if (Test-Path $out) { Remove-Item -Recurse -Force $out }
  [System.IO.Compression.ZipFile]::ExtractToDirectory($p, $out)

  $xmlPath = Join-Path $out 'word\document.xml'
  if (-not (Test-Path $xmlPath)) { Write-Host "No XML en $f"; continue }

  [xml]$doc = Get-Content -LiteralPath $xmlPath -Encoding UTF8
  $ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
  $ns.AddNamespace('w','http://schemas.openxmlformats.org/wordprocessingml/2006/main')

  $sb = New-Object System.Text.StringBuilder
  foreach ($para in $doc.SelectNodes('//w:p', $ns)) {
    $line = ''
    foreach ($t in $para.SelectNodes('.//w:t', $ns)) { $line += $t.InnerText }
    foreach ($br in $para.SelectNodes('.//w:br', $ns)) { $line += "`n" }
    [void]$sb.AppendLine($line)
  }
  # Mesas
  $tblIndex = 0
  foreach ($tbl in $doc.SelectNodes('//w:tbl', $ns)) {
    $tblIndex++
    [void]$sb.AppendLine("`n[TABLA $tblIndex]")
    foreach ($row in $tbl.SelectNodes('.//w:tr', $ns)) {
      $cells = @()
      foreach ($cell in $row.SelectNodes('.//w:tc', $ns)) {
        $txt = ''
        foreach ($t in $cell.SelectNodes('.//w:t', $ns)) { $txt += $t.InnerText }
        $cells += $txt.Trim()
      }
      [void]$sb.AppendLine(($cells -join ' | '))
    }
  }

  $outTxt = Join-Path $src (($f -replace '\.docx$','') + '.txt')
  [System.IO.File]::WriteAllText($outTxt, $sb.ToString(), [System.Text.Encoding]::UTF8)
  Write-Host "OK: $outTxt"
}
