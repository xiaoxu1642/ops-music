$ErrorActionPreference = "Stop"
$root = (Resolve-Path -LiteralPath "C:\KaiFa\OpsMusic").Path
$runtime = Join-Path $root "runtime"
$src = Join-Path $root "dist\win-unpacked"
if (-not $runtime.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) { throw "runtime path outside repo" }
if (-not (Test-Path -LiteralPath $src)) { throw "win-unpacked missing" }
$ops = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "OpsMusic.exe" -or ($_.Name -eq "electron.exe" -and $_.CommandLine -match "KaiFa\\OpsMusic") }
if ($ops) { throw "OpsMusic still running: $($ops.ProcessId -join ',')" }
if (-not (Test-Path -LiteralPath $runtime)) { New-Item -ItemType Directory -Path $runtime | Out-Null }
Get-ChildItem -LiteralPath $src -Force | Copy-Item -Destination $runtime -Recurse -Force
$exe = Join-Path $runtime "OpsMusic.exe"
if (-not (Test-Path -LiteralPath $exe)) { throw "runtime exe missing" }
"version=$((Get-Item -LiteralPath $exe).VersionInfo.ProductVersion)"
"files=$((Get-ChildItem -LiteralPath $runtime -Recurse -File).Count)"
