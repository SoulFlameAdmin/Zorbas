param(
  [Parameter(Mandatory = $true)]
  [string]$OutputFolder
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
New-Item -ItemType Directory -Force -Path $OutputFolder | Out-Null

function Safe-Run {
  param([scriptblock]$Script)
  try { & $Script }
  catch { [pscustomobject]@{ Error = $_.Exception.Message } }
}

function Read-RegistryValues {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return @() }
  try {
    $item = Get-ItemProperty -Path $Path
    $rows = @()
    foreach ($property in $item.PSObject.Properties) {
      if ($property.Name -notmatch '^PS(Path|ParentPath|ChildName|Drive|Provider)$') {
        $rows += [pscustomobject]@{ Name = $property.Name; Value = [string]$property.Value }
      }
    }
    return $rows
  }
  catch { return @([pscustomobject]@{ Error = $_.Exception.Message }) }
}

Write-Output '1/8 Windows and Print Spooler'
$metadata = [ordered]@{
  ScannerVersion = '1.0.1'
  GeneratedAt = (Get-Date).ToString('o')
  ComputerName = $env:COMPUTERNAME
  Windows = [System.Environment]::OSVersion.VersionString
  Is64BitOperatingSystem = [System.Environment]::Is64BitOperatingSystem
  PowerShellVersion = $PSVersionTable.PSVersion.ToString()
}
$spooler = Safe-Run { Get-Service -Name Spooler | Select-Object Name, Status, StartType }

Write-Output '2/8 Installed printers and queues'
$win32Printers = @(Safe-Run {
  Get-CimInstance Win32_Printer |
    Sort-Object Name |
    Select-Object Name, Default, Local, Network, Shared, ShareName, PortName, DriverName, PrintProcessor, Datatype, Status, PrinterStatus, WorkOffline, PNPDeviceID, SystemName, Location, Comment, HorizontalResolution, VerticalResolution
})

$printerQueues = @()
if (Get-Command Get-Printer -ErrorAction SilentlyContinue) {
  $printerQueues = @(Safe-Run {
    Get-Printer |
      Sort-Object Name |
      Select-Object Name, DriverName, PortName, Shared, ShareName, Published, Type, PrinterStatus, JobCount, ComputerName, RenderingMode
  })
}

$defaultPrinter = @($win32Printers | Where-Object { $_.Default -eq $true })

Write-Output '3/8 Ports, IP addresses and drivers'
$printerPorts = @()
if (Get-Command Get-PrinterPort -ErrorAction SilentlyContinue) {
  $printerPorts = @(Safe-Run {
    Get-PrinterPort |
      Sort-Object Name |
      Select-Object Name, Description, PortMonitor, PrinterHostAddress, PortNumber, Protocol, SNMPEnabled, LprQueueName, ByteCount
  })
}

$printerDrivers = @()
if (Get-Command Get-PrinterDriver -ErrorAction SilentlyContinue) {
  $printerDrivers = @(Safe-Run {
    Get-PrinterDriver |
      Sort-Object Name |
      Select-Object Name, Manufacturer, DriverVersion, MajorVersion, InfPath, ConfigFile, DataFile, HelpFile
  })
}

Write-Output '4/8 Paper and print settings'
$printConfigurations = @()
if ((Get-Command Get-Printer -ErrorAction SilentlyContinue) -and (Get-Command Get-PrintConfiguration -ErrorAction SilentlyContinue)) {
  foreach ($printer in @(Get-Printer -ErrorAction SilentlyContinue)) {
    try {
      $configuration = Get-PrintConfiguration -PrinterName $printer.Name -ErrorAction Stop
      $printConfigurations += [pscustomobject]@{
        PrinterName = $printer.Name
        PaperSize = [string]$configuration.PaperSize
        Color = [string]$configuration.Color
        DuplexingMode = [string]$configuration.DuplexingMode
        Collate = [string]$configuration.Collate
        InputBin = [string]$configuration.InputBin
      }
    }
    catch {
      $printConfigurations += [pscustomobject]@{ PrinterName = $printer.Name; Error = $_.Exception.Message }
    }
  }
}

Write-Output '5/8 USB and PnP devices'
$pnpDevices = @(Safe-Run {
  Get-CimInstance Win32_PnPEntity |
    Where-Object {
      $_.PNPClass -eq 'Printer' -or
      $_.Name -match '(?i)printer|thermal|receipt|pos|epson|star|xprinter|bixolon|citizen|rongta|gprinter|zjiang'
    } |
    Sort-Object Name |
    Select-Object Name, Manufacturer, PNPClass, PNPDeviceID, Service, Status, ConfigManagerErrorCode
})

Write-Output '6/8 Windows printer registry'
$registry = [ordered]@{
  CurrentUserDevices = @(Read-RegistryValues 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Devices')
  CurrentUserPrinterPorts = @(Read-RegistryValues 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\PrinterPorts')
  PrintMonitors = @(Safe-Run {
    Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Print\Monitors' |
      Select-Object PSChildName
  })
  TcpIpPorts = @(Safe-Run {
    $base = 'HKLM:\SYSTEM\CurrentControlSet\Control\Print\Monitors\Standard TCP/IP Port\Ports'
    if (Test-Path $base) {
      Get-ChildItem $base | ForEach-Object {
        $values = Get-ItemProperty $_.PSPath
        [pscustomobject]@{
          Name = $_.PSChildName
          HostName = [string]$values.HostName
          IPAddress = [string]$values.IPAddress
          PortNumber = [string]$values.PortNumber
          Protocol = [string]$values.Protocol
          SNMPEnabled = [string]$values.SNMPEnabled
        }
      }
    }
  })
}

Write-Output '7/8 Related printer and POS software'
$softwarePattern = '(?i)zorbas|restaurant|waiter|kitchen|receipt|thermal|printer|print|pos\b|point.of.sale|sql'
$installedSoftware = @()
foreach ($path in @(
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
)) {
  $installedSoftware += @(Safe-Run {
    Get-ItemProperty $path -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -and $_.DisplayName -match $softwarePattern } |
      Select-Object DisplayName, DisplayVersion, Publisher, InstallLocation, InstallDate
  })
}
$installedSoftware = @($installedSoftware | Sort-Object DisplayName -Unique)

$relatedProcesses = @(Safe-Run {
  Get-CimInstance Win32_Process |
    Where-Object { $_.Name -match '(?i)zorbas|restaurant|waiter|kitchen|receipt|thermal|printer|print|pos|sql' } |
    Select-Object Name, ProcessId, ExecutablePath
})

Write-Output '8/8 Network connections to standard printer ports'
$networkConnections = @()
if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
  $networkConnections = @(Safe-Run {
    Get-NetTCPConnection |
      Where-Object { $_.RemotePort -in @(515, 631, 9100) -or $_.LocalPort -in @(515, 631, 9100) } |
      Select-Object State, LocalAddress, LocalPort, RemoteAddress, RemotePort, OwningProcess
  })
}

$report = [ordered]@{
  Metadata = $metadata
  Spooler = $spooler
  DefaultPrinter = $defaultPrinter
  Win32Printers = $win32Printers
  PrinterQueues = $printerQueues
  PrinterPorts = $printerPorts
  PrinterDrivers = $printerDrivers
  PrintConfigurations = $printConfigurations
  PnpDevices = $pnpDevices
  Registry = $registry
  InstalledPrinterOrPosSoftware = $installedSoftware
  RelatedProcesses = $relatedProcesses
  PrinterNetworkConnections = $networkConnections
  Privacy = [ordered]@{
    UploadedAutomatically = $false
    OrdersCollected = $false
    DocumentsCollected = $false
    PasswordsOrTokensCollected = $false
  }
}

$jsonPath = Join-Path $OutputFolder 'report.json'
$report | ConvertTo-Json -Depth 12 | Set-Content -Path $jsonPath -Encoding UTF8

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add('ZORBAS PRINTER SCANNER REPORT')
$lines.Add('Generated: ' + $metadata.GeneratedAt)
$lines.Add('Computer: ' + $metadata.ComputerName)
$lines.Add('Spooler: ' + [string]$spooler.Status)
$lines.Add('')
$lines.Add('DEFAULT PRINTER')
if (@($defaultPrinter).Count -eq 0) { $lines.Add('No default printer detected.') }
foreach ($printer in @($defaultPrinter)) {
  $lines.Add('- ' + $printer.Name + ' | ' + $printer.PortName + ' | ' + $printer.DriverName)
}
$lines.Add('')
$lines.Add('PRINTER QUEUES')
foreach ($printer in @($win32Printers)) {
  $lines.Add('- ' + $printer.Name + ' | Port=' + $printer.PortName + ' | Driver=' + $printer.DriverName + ' | Default=' + $printer.Default + ' | Offline=' + $printer.WorkOffline)
}
$lines.Add('')
$lines.Add('PRINTER PORTS')
foreach ($port in @($printerPorts)) {
  $lines.Add('- ' + $port.Name + ' | IP=' + $port.PrinterHostAddress + ' | Port=' + $port.PortNumber + ' | Monitor=' + $port.PortMonitor)
}
$lines.Add('')
$lines.Add('RELATED SOFTWARE')
foreach ($software in @($installedSoftware)) {
  $lines.Add('- ' + $software.DisplayName + ' ' + $software.DisplayVersion + ' | ' + $software.InstallLocation)
}
$lines.Add('')
$lines.Add('Upload the ZIP report to ChatGPT. No data was uploaded automatically.')
$lines | Set-Content -Path (Join-Path $OutputFolder 'report.txt') -Encoding UTF8

Write-Output 'Report created successfully.'
exit 0
