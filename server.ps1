# PowerShell Simple HTTP Server for Operations Portal
# Hosts index.html, style.css, app.js locally on http://localhost:8000/

$port = 8000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

Write-Host "============================================="
Write-Host "  กำลังเริ่มเซิร์ฟเวอร์จำลองฝ่ายยุทธการ..."
Write-Host "  ลิงก์เข้าใช้งาน: http://localhost:$port/"
Write-Host "  (กด Ctrl + C ในเทอร์มินัลเพื่อปิดเซิร์ฟเวอร์)"
Write-Host "============================================="

try {
    $listener.Start()
    Write-Host "เซิร์ฟเวอร์เปิดใช้งานเรียบร้อยที่ http://localhost:$port/"
    
    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
            $request = $context.Request
            $response = $context.Response
            
            $urlPath = $request.Url.LocalPath
            if ($urlPath -eq "/") {
                $urlPath = "/index.html"
            }
            
            # Decode URL spaces and characters
            $urlPath = [System.Web.HttpUtility]::UrlDecode($urlPath)
            
            # Combine paths and keep within workspace
            $currentDir = Get-Location
            $filePath = [System.IO.Path]::Combine($currentDir, $urlPath.TrimStart('/'))
            
            if (Test-Path $filePath -PathType Leaf) {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                
                # Check extension for Content-Type
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                $contentType = "text/html; charset=utf-8"
                if ($ext -eq ".css") { $contentType = "text/css; charset=utf-8" }
                elseif ($ext -eq ".js") { $contentType = "application/javascript; charset=utf-8" }
                elseif ($ext -eq ".png") { $contentType = "image/png" }
                elseif ($ext -eq ".jpg" -or $ext -eq ".jpeg") { $contentType = "image/jpeg" }
                elseif ($ext -eq ".pdf") { $contentType = "application/pdf" }
                
                $response.ContentType = $contentType
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                # Return 404
                $response.StatusCode = 404
                $html404 = "<html><body><h1>404 Not Found</h1><p>ไม่พบไฟล์ที่ร้องขอในเครื่องของคุณ</p></body></html>"
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes($html404)
                $response.ContentType = "text/html; charset=utf-8"
                $response.ContentLength64 = $errBytes.Length
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            }
            $response.OutputStream.Close()
        } catch {
            Write-Warning "เกิดข้อผิดพลาดในการประมวลผลคำขอ: $_"
        }
    }
} catch {
    Write-Error "ไม่สามารถเปิดเซิร์ฟเวอร์ได้: $_"
} finally {
    if ($listener -ne $null) {
        $listener.Stop()
        $listener.Close()
        Write-Host "เซิร์ฟเวอร์ถูกปิดเรียบร้อย"
    }
}
