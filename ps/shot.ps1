param([string]$Out)
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System; using System.Runtime.InteropServices;
public class S { [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rt, B; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }
'@
[S]::SetProcessDPIAware() | Out-Null
$p = Get-Process WhatsMyPC, msedge, chrome -ErrorAction SilentlyContinue | Where-Object { ($_.MainWindowTitle -like 'WhatsMyPC*' -or $_.MainWindowTitle -like 'PCpedia*') -and $_.MainWindowTitle -notlike '*Overlay*' } | Select-Object -First 1
$r = New-Object S+R
if ($p -and [S]::GetWindowRect($p.MainWindowHandle, [ref]$r)) {
    $x = $r.L; $y = $r.T; $w = $r.Rt - $r.L; $h = $r.B - $r.T
} else {
    Add-Type -AssemblyName System.Windows.Forms
    $b = [Windows.Forms.Screen]::PrimaryScreen.Bounds; $x = $b.X; $y = $b.Y; $w = $b.Width; $h = $b.Height
}
$bmp = New-Object Drawing.Bitmap $w, $h
$g = [Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($x, $y, 0, 0, $bmp.Size)
$bmp.Save($Out, [Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
