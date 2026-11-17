$root = "C:\KaiFa\OpsMusic\.birdview"
$port = 18765
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$port/")
$listener.Start()
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart("/"))
    if (-not $rel) { $rel = "opsMusic.html" }
    $file = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $rel))
    if (-not $file.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -or -not [System.IO.File]::Exists($file)) {
      $ctx.Response.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes("Not found")
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      $ctx.Response.Close()
      continue
    }
    $bytes = [System.IO.File]::ReadAllBytes($file)
    if ($file.EndsWith(".html")) { $ctx.Response.ContentType = "text/html; charset=utf-8" }
    elseif ($file.EndsWith(".json")) { $ctx.Response.ContentType = "application/json; charset=utf-8" }
    else { $ctx.Response.ContentType = "application/octet-stream" }
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $ctx.Response.Close()
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
