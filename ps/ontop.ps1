param([string]$Title = 'PCpedia Overlay')
Add-Type @'
using System; using System.Runtime.InteropServices;
public class W { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f); }
'@
$deadline = (Get-Date).AddSeconds(15)
while ((Get-Date) -lt $deadline) {
    $p = Get-Process msedge, chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like "$Title*" } | Select-Object -First 1
    if ($p) {
        # HWND_TOPMOST = -1, flags: NOSIZE|NOMOVE|SHOWWINDOW
        [W]::SetWindowPos($p.MainWindowHandle, [IntPtr](-1), 0, 0, 0, 0, 0x0043) | Out-Null
        break
    }
    Start-Sleep -Milliseconds 400
}
