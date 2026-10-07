param([int]$Port = 47321)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$base = "http://127.0.0.1:$Port"
$wc = New-Object Net.WebClient
$wc.Encoding = [Text.Encoding]::UTF8
$wc.Headers.Add('X-PCpedia', '1')

function Post($p) { try { $wc.UploadString("$base$p", 'POST', '') | Out-Null } catch {} }

# Icon drawn at runtime (no binary assets)
$bmp = New-Object Drawing.Bitmap 32, 32
$g = [Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.FillEllipse((New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(56, 139, 253))), 1, 1, 30, 30)
$f = New-Object Drawing.Font 'Segoe UI', 15, ([Drawing.FontStyle]::Bold), ([Drawing.GraphicsUnit]::Pixel)
$g.DrawString('P', $f, [Drawing.Brushes]::White, 8, 4)
$icon = [Drawing.Icon]::FromHandle($bmp.GetHicon())

$ni = New-Object Windows.Forms.NotifyIcon
$ni.Icon = $icon; $ni.Text = 'PCpedia'; $ni.Visible = $true

# Mini popup
$form = New-Object Windows.Forms.Form
$form.FormBorderStyle = 'None'; $form.ShowInTaskbar = $false; $form.TopMost = $true
$form.Size = New-Object Drawing.Size 250, 190; $form.StartPosition = 'Manual'
$form.BackColor = [Drawing.Color]::FromArgb(24, 27, 33)
$lbl = New-Object Windows.Forms.Label
$lbl.Dock = 'Fill'; $lbl.ForeColor = [Drawing.Color]::White; $lbl.Padding = New-Object Windows.Forms.Padding 14
$lbl.Font = New-Object Drawing.Font 'Consolas', 10.5
$form.Controls.Add($lbl)
$form.Add_Deactivate({ $form.Hide() })

function Fetch() { try { return ($wc.DownloadString("$base/api/summary") | ConvertFrom-Json) } catch { return $null } }

function Fmt($b) { if ($b -ge 1MB) { '{0:N1} MB/s' -f ($b / 1MB) } else { '{0:N0} KB/s' -f ($b / 1KB) } }

function Update-Popup($s) {
    if (-not $s) { return }
    $gpu = if ($s.gpu -ne $null) { "$([int]$s.gpu)%" } else { 'n/a' }
    $ct = if ($s.cpuT -ne $null) { "  $([int]$s.cpuT) C" } else { '' }
    $lbl.Text = "PCpedia  -  $($s.health.level) ($($s.health.score))`r`n`r`nCPU   $([int]$s.cpu)%$ct`r`nRAM   $([int]$s.ram)%`r`nGPU   $gpu`r`nDisk  $([int]$s.disk)% busy`r`nDown  $(Fmt $s.rx)`r`nUp    $(Fmt $s.tx)"
}

$fails = 0
$timer = New-Object Windows.Forms.Timer
$timer.Interval = 2000
$timer.Add_Tick({
    $s = Fetch
    if (-not $s) { $script:fails++; if ($script:fails -ge 4) { $ni.Visible = $false; [Windows.Forms.Application]::Exit() }; return }
    $script:fails = 0
    $ni.Text = ("PCpedia  CPU {0}%  RAM {1}%" -f [int]$s.cpu, [int]$s.ram)
    if ($form.Visible) { Update-Popup $s }
    foreach ($a in @($s.pending)) { if ($a) { $ni.ShowBalloonTip(6000, $a.title, $a.text, 'Warning') } }
})
$timer.Start()

function Open-Dash() { Post '/api/open' }
$ni.Add_MouseClick({
    if ($_.Button -eq 'Left') {
        Update-Popup (Fetch)
        $wa = [Windows.Forms.Screen]::PrimaryScreen.WorkingArea
        $form.Location = New-Object Drawing.Point ($wa.Right - $form.Width - 8), ($wa.Bottom - $form.Height - 8)
        $form.Show(); $form.Activate()
    }
})
$ni.Add_DoubleClick({ Open-Dash })

$menu = New-Object Windows.Forms.ContextMenuStrip
$menu.Items.Add('Open PCpedia', $null, { Open-Dash }) | Out-Null
$menu.Items.Add('Gaming overlay', $null, { Post '/api/overlay' }) | Out-Null
$menu.Items.Add('-') | Out-Null
$menu.Items.Add('Quit', $null, { Post '/api/quit'; $ni.Visible = $false; [Windows.Forms.Application]::Exit() }) | Out-Null
$ni.ContextMenuStrip = $menu

[Windows.Forms.Application]::Run()
$ni.Dispose()
