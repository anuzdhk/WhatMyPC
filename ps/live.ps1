$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$i = 0
$pagefile = $null
$sensors = @()
while ($true) {
    $o = @{}
    $d = Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -Filter "Name='_Total'"
    $o.disk = @{ r = [double]$d.DiskReadBytesPersec; w = [double]$d.DiskWriteBytesPersec; busy = [double]$d.PercentDiskTime; q = [double]$d.CurrentDiskQueueLength }

    $o.net = @(Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface | ForEach-Object {
        @{ name = $_.Name; rx = [double]$_.BytesReceivedPersec; tx = [double]$_.BytesSentPersec }
    })

    $o.procs = @(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $_.Name -ne '_Total' -and $_.Name -ne 'Idle' } | ForEach-Object {
        @{ pid = [int]$_.IDProcess; n = ($_.Name -replace '#\d+$', ''); cpu = [double]$_.PercentProcessorTime; ws = [double]$_.WorkingSetPrivate; io = [double]($_.IOReadBytesPersec + $_.IOWriteBytesPersec); th = [int]$_.ThreadCount }
    })

    # GPU engines (works for NVIDIA / AMD / Intel via WDDM counters)
    $gpuPid = @{}; $types = @{}
    Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine | ForEach-Object {
        if ($_.Name -match 'pid_(\d+)_.*engtype_(\w+)') {
            $p = $matches[1]; $t = $matches[2]; $u = [double]$_.UtilizationPercentage
            $gpuPid[$p] = [double]$gpuPid[$p] + $u
            $types[$t] = [double]$types[$t] + $u
        }
    }
    $gt = 0; foreach ($v in $types.Values) { if ($v -gt $gt) { $gt = $v } }
    $o.gpuTotal = [math]::Min(100, $gt)
    $o.gpuPid = $gpuPid
    $mem = 0; Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory | ForEach-Object { $mem += [double]$_.DedicatedUsage }
    $o.gpuMem = $mem

    $pm = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory
    $o.mem = @{ cache = [double]$pm.CacheBytes; commit = [double]$pm.CommittedBytes; limit = [double]$pm.CommitLimit; avail = [double]$pm.AvailableBytes }

    $pi = Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation -Filter "Name='_Total'"
    $o.mhz = [double]$pi.ProcessorFrequency
    $o.perf = [double]$pi.PercentProcessorPerformance

    if ($i % 10 -eq 0) {
        $pf = Get-CimInstance Win32_PageFileUsage | Select-Object -First 1
        $pagefile = @{ total = [double]$pf.AllocatedBaseSize; used = [double]$pf.CurrentUsage }
        $sensors = @()
        foreach ($ns in 'root/LibreHardwareMonitor', 'root/OpenHardwareMonitor') {
            $s = Get-CimInstance -Namespace $ns -ClassName Sensor
            if ($s) {
                $sensors = @($s | Where-Object { $_.SensorType -in 'Temperature', 'Power', 'Fan', 'Clock' } | ForEach-Object { @{ n = $_.Name; t = $_.SensorType; v = [double]$_.Value; p = $_.Parent } })
                break
            }
        }
        if (-not $sensors.Count) {
            $z = @(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature)
            if ($z.Count) { $sensors = @($z | ForEach-Object { @{ n = 'ACPI Thermal Zone'; t = 'Temperature'; v = [math]::Round($_.CurrentTemperature / 10 - 273.15, 1); p = 'acpi' } }) }
        }
    }
    $o.pagefile = $pagefile
    $o.sensors = $sensors
    $i++
    [Console]::Out.WriteLine((ConvertTo-Json -InputObject $o -Depth 5 -Compress))
    Start-Sleep -Milliseconds 400
}
