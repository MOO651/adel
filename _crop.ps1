Add-Type -AssemblyName System.Drawing
$src = Get-ChildItem "c:\Users\LENOVO\Desktop\adel\_pdf_imgs\*.png" | Select-Object -First 1
$img = [System.Drawing.Image]::FromFile($src.FullName)
# central medallion crop (proportions from 1280x772 preview scaled to actual size)
$sx = [int]($img.Width * 460/1280); $sy = [int]($img.Height * 55/772)
$sw = [int]($img.Width * 360/1280); $sh = [int]($img.Height * 400/772)
$crop = New-Object System.Drawing.Bitmap($sw,$sh)
$g = [System.Drawing.Graphics]::FromImage($crop)
$g.DrawImage($img, (New-Object System.Drawing.Rectangle(0,0,$sw,$sh)), (New-Object System.Drawing.Rectangle($sx,$sy,$sw,$sh)), [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
# resized small logo
$small = New-Object System.Drawing.Bitmap(220,244)
$g2 = [System.Drawing.Graphics]::FromImage($small)
$g2.InterpolationMode = 'HighQualityBicubic'
$g2.DrawImage($crop, 0, 0, 220, 244)
$g2.Dispose()
$ms = New-Object System.IO.MemoryStream
$small.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
[System.IO.File]::WriteAllBytes("c:\Users\LENOVO\Desktop\adel\_logo.png", $ms.ToArray())
$b64 = [Convert]::ToBase64String($ms.ToArray())
[System.IO.File]::WriteAllText("c:\Users\LENOVO\Desktop\adel\_logo_b64.txt", $b64)
Write-Output ("len=" + $b64.Length)
$img.Dispose(); $crop.Dispose(); $small.Dispose(); $ms.Dispose()
