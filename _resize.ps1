Add-Type -AssemblyName System.Drawing
$png = Get-ChildItem "c:\Users\LENOVO\Desktop\adel\_pdf_imgs\*.png" | Select-Object -First 1
$img = [System.Drawing.Image]::FromFile($png.FullName)
$w = 1280
$h = [int]($img.Height * $w / $img.Width)
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($img, 0, 0, $w, $h)
$bmp.Save("c:\Users\LENOVO\Desktop\adel\_preview_small.png")
$g.Dispose(); $img.Dispose()
Write-Output "ok"
