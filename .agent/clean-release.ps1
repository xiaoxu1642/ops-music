$ErrorActionPreference = "Stop"
Set-Location "C:\KaiFa\OpsMusic"
$root = (Resolve-Path -LiteralPath ".").Path
$dist = Join-Path $root "dist"
if (-not $dist.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) { throw "dist path outside repo" }
if (Test-Path -LiteralPath $dist) { Get-ChildItem -LiteralPath $dist -Force | Remove-Item -Recurse -Force }
$tags = git tag --list | Where-Object { $_ -ne "v1.2.6" }
foreach ($tag in $tags) { git tag -d $tag | Out-Null }
"remaining_tags=$((git tag --list) -join ',')"
"dist_exists=$(Test-Path -LiteralPath $dist)"
