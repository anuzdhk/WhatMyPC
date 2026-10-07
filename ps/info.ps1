param([string]$Section)
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
function J($x) { ConvertTo-Json -InputObject $x -Depth 5 -Compress }
function D($d) { if ($d) { ([datetime]$d).ToString('s') } else { $null } }
function EvData($e) { $x = [xml]$e.ToXml(); $h = @{}; $x.Event.EventData.Data | ForEach-Object { $h[$_.Name] = $_.'#text' }; $h }

switch ($Section) {

'system' {
    $os = Get-CimInstance Win32_OperatingSystem; $cs = Get-CimInstance Win32_ComputerSystem
    J @{ os = $os.Caption; version = $os.Version; build = $os.BuildNumber; arch = $os.OSArchitecture; boot = (D $os.LastBootUpTime); installed = (D $os.InstallDate)
         host = $env:COMPUTERNAME; user = $env:USERNAME; domain = $cs.Domain; manufacturer = $cs.Manufacturer; model = $cs.Model; ramBytes = [double]$cs.TotalPhysicalMemory }
}

'cpu' {
    $arch = @{ 0 = 'x86'; 5 = 'ARM'; 9 = 'x64'; 12 = 'ARM64' }
    J @(Get-CimInstance Win32_Processor | ForEach-Object {
        @{ name = $_.Name.Trim(); cores = $_.NumberOfCores; threads = $_.NumberOfLogicalProcessors; baseMHz = $_.MaxClockSpeed; l2KB = $_.L2CacheSize; l3KB = $_.L3CacheSize
           arch = $arch[[int]$_.Architecture]; socket = $_.SocketDesignation; vendor = $_.Manufacturer; virtualization = $_.VirtualizationFirmwareEnabled }
    })
}

'memory' {
    $types = @{ 20 = 'DDR'; 21 = 'DDR2'; 24 = 'DDR3'; 26 = 'DDR4'; 34 = 'DDR5'; 27 = 'LPDDR'; 28 = 'LPDDR2'; 29 = 'LPDDR3'; 30 = 'LPDDR4'; 35 = 'LPDDR5' }
    $arr = Get-CimInstance Win32_PhysicalMemoryArray
    $slots = ($arr | Measure-Object MemoryDevices -Sum).Sum
    $mods = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object {
        @{ slot = $_.DeviceLocator; bank = $_.BankLabel; bytes = [double]$_.Capacity; speed = $_.Speed; configured = $_.ConfiguredClockSpeed
           type = $types[[int]$_.SMBIOSMemoryType]; maker = ($_.Manufacturer + '').Trim(); part = ($_.PartNumber + '').Trim(); form = $_.FormFactor }
    })
    J @{ slots = $slots; modules = $mods }
}

'gpu' {
    $base = 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11cd-bfc1-08002be10318}'
    $reg = @(Get-ChildItem $base | Where-Object { $_.PSChildName -match '^\d{4}$' } | ForEach-Object {
        $p = Get-ItemProperty $_.PSPath; @{ name = $p.DriverDesc; vram = [double]$p.'HardwareInformation.qwMemorySize' } })
    J @(Get-CimInstance Win32_VideoController | ForEach-Object {
        $n = $_.Name; $r = $reg | Where-Object { $_.name -eq $n } | Select-Object -First 1
        $v = if ($r -and $r.vram -gt 0) { $r.vram } else { [double]$_.AdapterRAM }
        @{ name = $n; vram = $v; driver = $_.DriverVersion; driverDate = (D $_.DriverDate); w = $_.CurrentHorizontalResolution; h = $_.CurrentVerticalResolution; hz = $_.CurrentRefreshRate; vendor = $_.AdapterCompatibility }
    })
}

'storage' {
    $map = @{}
    Get-Partition | Where-Object { $_.DriveLetter } | ForEach-Object { $map[[string]$_.DriveLetter] = [int]$_.DiskNumber }
    $pd = @(Get-PhysicalDisk | ForEach-Object {
        $r = $_ | Get-StorageReliabilityCounter
        @{ id = [int]$_.DeviceId; name = $_.FriendlyName; type = [string]$_.MediaType; bus = [string]$_.BusType; size = [double]$_.Size; health = [string]$_.HealthStatus; op = [string]$_.OperationalStatus
           serial = $_.SerialNumber; temp = $r.Temperature; wear = $r.Wear; hours = $r.PowerOnHours; readErr = $r.ReadErrorsTotal; writeErr = $r.WriteErrorsTotal }
    })
    $vols = @(Get-Volume | Where-Object { $_.DriveLetter } | ForEach-Object {
        @{ letter = [string]$_.DriveLetter; label = $_.FileSystemLabel; fs = $_.FileSystem; kind = [string]$_.DriveType; size = [double]$_.Size; free = [double]$_.SizeRemaining; disk = $map[[string]$_.DriveLetter] }
    })
    J @{ disks = $pd; volumes = $vols }
}

'network' {
    J @(Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' } | ForEach-Object {
        @{ name = $_.InterfaceAlias; desc = $_.InterfaceDescription; ipv4 = @($_.IPv4Address | ForEach-Object { $_.IPAddress }); ipv6 = @($_.IPv6Address | ForEach-Object { $_.IPAddress })
           gateway = @($_.IPv4DefaultGateway | ForEach-Object { $_.NextHop }); dns = @($_.DNSServer.ServerAddresses); mac = $_.NetAdapter.MacAddress
           speed = $_.NetAdapter.LinkSpeed; media = [string]$_.NetAdapter.PhysicalMediaType }
    })
}

'battery' {
    $b = Get-CimInstance Win32_Battery | Select-Object -First 1
    if (-not $b) { J @{ present = $false } }
    else {
        $full = (Get-CimInstance -Namespace root/wmi BatteryFullChargedCapacity | Select-Object -First 1).FullChargedCapacity
        $des = (Get-CimInstance -Namespace root/wmi BatteryStaticData | Select-Object -First 1).DesignedCapacity
        $cyc = (Get-CimInstance -Namespace root/wmi BatteryCycleCount | Select-Object -First 1).CycleCount
        $st = [int]$b.BatteryStatus
        $rt = $b.EstimatedRunTime; if ($rt -ge 71582788) { $rt = $null }
        J @{ present = $true; percent = $b.EstimatedChargeRemaining; status = $st; charging = ($st -in 2, 6, 7, 8, 9); full = ($st -eq 3); minutes = $rt; design = $des; current = $full; cycles = $cyc; name = $b.Name }
    }
}

'hardware' {
    $bb = Get-CimInstance Win32_BaseBoard; $bi = Get-CimInstance Win32_BIOS
    $chip = Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match 'LPC Controller|ISA Bridge|Host Bridge|Chipset' } | Select-Object -First 1
    J @{ board = @{ maker = $bb.Manufacturer; product = $bb.Product; version = $bb.Version; serial = $bb.SerialNumber }
         bios = @{ maker = $bi.Manufacturer; version = $bi.SMBIOSBIOSVersion; date = (D $bi.ReleaseDate); serial = $bi.SerialNumber }
         chipset = $chip.Name }
}

'devices' {
    Add-Type -AssemblyName System.Windows.Forms
    $hz = (Get-CimInstance Win32_VideoController | Select-Object -First 1).CurrentRefreshRate
    $mons = @([Windows.Forms.Screen]::AllScreens | ForEach-Object { @{ name = $_.DeviceName; w = $_.Bounds.Width; h = $_.Bounds.Height; primary = $_.Primary; hz = $hz } })
    $names = @(Get-CimInstance -Namespace root/wmi WmiMonitorID | ForEach-Object { -join ($_.UserFriendlyName | Where-Object { $_ -ne 0 } | ForEach-Object { [char]$_ }) })
    $dev = @(Get-PnpDevice -PresentOnly -Class USB, Keyboard, Mouse, AudioEndpoint, Printer, Bluetooth, Camera, Image | ForEach-Object {
        @{ name = $_.FriendlyName; cls = [string]$_.Class; status = [string]$_.Status; maker = $_.Manufacturer } })
    J @{ monitors = $mons; monitorNames = $names; devices = $dev }
}

'software' {
    $k = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
    J @(Get-ItemProperty $k | Where-Object { $_.DisplayName -and -not $_.SystemComponent } | Sort-Object DisplayName -Unique | ForEach-Object {
        @{ name = $_.DisplayName; version = $_.DisplayVersion; publisher = $_.Publisher; sizeKB = [double]$_.EstimatedSize; date = $_.InstallDate } })
}

'drivers' {
    J @(Get-CimInstance Win32_PnPSignedDriver | Where-Object { $_.DeviceName } | ForEach-Object {
        @{ name = $_.DeviceName; version = $_.DriverVersion; date = (D $_.DriverDate); maker = $_.Manufacturer; cls = $_.DeviceClass } })
}

'startup' {
    $ln = 'Microsoft-Windows-Diagnostics-Performance/Operational'
    $items = @(Get-CimInstance Win32_StartupCommand | ForEach-Object { @{ name = $_.Name; command = $_.Command; location = $_.Location; user = $_.User } })
    $boots = @(Get-WinEvent -FilterHashtable @{ LogName = $ln; Id = 100 } -MaxEvents 8 | ForEach-Object { $d = EvData $_
        @{ time = $_.TimeCreated.ToString('s'); bootMs = [double]$d.BootTime; mainMs = [double]$d.MainPathBootTime; postMs = [double]$d.BootPostBootTime } })
    $slow = @(Get-WinEvent -FilterHashtable @{ LogName = $ln; Id = 101 } -MaxEvents 200 | ForEach-Object { $d = EvData $_
        @{ name = $d.FriendlyName; file = $d.Name; ms = [double]$d.TotalTime; degr = [double]$d.DegradationTime } })
    J @{ items = $items; boots = $boots; slow = $slow }
}

'security' {
    $mp = Get-MpComputerStatus
    $fw = @(Get-NetFirewallProfile | ForEach-Object { @{ name = [string]$_.Name; enabled = ([string]$_.Enabled -eq 'True') } })
    $av = @(Get-CimInstance -Namespace root/SecurityCenter2 AntiVirusProduct | ForEach-Object { @{ name = $_.displayName; on = (([int]$_.productState -band 0x1000) -ne 0) } })
    $bl = @()
    $sh = New-Object -ComObject Shell.Application
    foreach ($v in (Get-Volume | Where-Object { $_.DriveLetter -and $_.DriveType -eq 'Fixed' })) {
        $x = $sh.NameSpace("$($v.DriveLetter):").Self.ExtendedProperty('System.Volume.BitLockerProtection')
        $bl += @{ drive = "$($v.DriveLetter):"; on = ($x -in 1, 3, 5) }
    }
    $sb = Confirm-SecureBootUEFI
    $uac = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System').EnableLUA
    J @{ defender = @{ available = [bool]$mp; antivirus = $mp.AntivirusEnabled; realtime = $mp.RealTimeProtectionEnabled; sigAge = $mp.AntivirusSignatureAge; sigUpdated = (D $mp.AntivirusSignatureLastUpdated); tamper = $mp.IsTamperProtected }
         firewall = $fw; products = $av; bitlocker = $bl; secureBoot = $sb; uac = ($uac -eq 1) }
}

'updates' {
    $res = @()
    try {
        $s = New-Object -ComObject Microsoft.Update.Session
        $r = $s.CreateUpdateSearcher().Search('IsInstalled=0 and IsHidden=0')
        $res = @($r.Updates | ForEach-Object { $cats = @($_.Categories | ForEach-Object { $_.Name })
            @{ title = $_.Title; severity = $_.MsrcSeverity; security = ($cats -contains 'Security Updates'); downloaded = $_.IsDownloaded } })
    } catch {}
    $last = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\Results\Detect').LastSuccessTime
    $hot = @(Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 10 | ForEach-Object { @{ id = $_.HotFixID; desc = $_.Description; on = (D $_.InstalledOn) } })
    J @{ pending = $res; lastCheck = $last; hotfixes = $hot }
}

'ports' {
    $pn = @{}; Get-Process | ForEach-Object { $pn[[int]$_.Id] = $_.ProcessName }
    $tcp = @(Get-NetTCPConnection | Where-Object { $_.State -in 'Listen', 'Established' } | ForEach-Object {
        @{ state = [string]$_.State; laddr = $_.LocalAddress; lport = $_.LocalPort; raddr = $_.RemoteAddress; rport = $_.RemotePort; pid = [int]$_.OwningProcess; proc = $pn[[int]$_.OwningProcess] } })
    $udp = @(Get-NetUDPEndpoint | ForEach-Object { @{ state = 'UDP'; laddr = $_.LocalAddress; lport = $_.LocalPort; raddr = ''; rport = 0; pid = [int]$_.OwningProcess; proc = $pn[[int]$_.OwningProcess] } })
    J @{ tcp = $tcp; udp = $udp }
}

'events' {
    $since = (Get-Date).AddDays(-60)
    $out = @()
    $out += @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 41, 6008, 1001; StartTime = $since } -MaxEvents 80 | Where-Object { $_.Id -ne 1001 -or $_.ProviderName -like '*SystemErrorReporting*' } | ForEach-Object {
        $k = switch ($_.Id) { 41 { 'Unexpected shutdown / power loss' } 6008 { 'Unexpected shutdown' } 1001 { 'Blue screen (BugCheck)' } }
        @{ time = $_.TimeCreated.ToString('s'); id = $_.Id; kind = $k; source = $_.ProviderName; msg = (($_.Message -split "`n")[0]) } })
    $out += @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000, 1002; StartTime = $since } -MaxEvents 80 | ForEach-Object {
        @{ time = $_.TimeCreated.ToString('s'); id = $_.Id; kind = $(if ($_.Id -eq 1000) { 'Application crash' } else { 'Application hang' }); source = $_.ProviderName; msg = (($_.Message -split "`n")[0]) } })
    J $out
}

default { J @{ error = 'unknown section' } }
}
