using System.Diagnostics;
using System.IO.Compression;
using System.Text;

namespace SoulFlame.ZorbasPrinterScanner;

internal sealed class MainForm : Form
{
    private readonly Button _scanButton = new();
    private readonly Button _openButton = new();
    private readonly Button _copyButton = new();
    private readonly ProgressBar _progress = new();
    private readonly TextBox _log = new();
    private readonly Label _status = new();
    private string? _lastReportFolder;
    private string? _lastZipPath;

    public MainForm()
    {
        Text = "Zorbas Printer Scanner · SoulFlame";
        Width = 760;
        Height = 610;
        MinimumSize = new Size(700, 560);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(10, 15, 24);
        ForeColor = Color.WhiteSmoke;
        Font = new Font("Segoe UI", 10F);

        var title = new Label
        {
            Text = "ZORBAS PRINTER SCANNER",
            AutoSize = true,
            Font = new Font("Segoe UI", 20F, FontStyle.Bold),
            ForeColor = Color.FromArgb(235, 190, 90),
            Location = new Point(28, 24)
        };

        var subtitle = new Label
        {
            Text = "Read-only анализ на сегашните Windows принтери и POS връзки",
            AutoSize = true,
            ForeColor = Color.Gainsboro,
            Location = new Point(31, 70)
        };

        var explanation = new Label
        {
            Text = "Програмата не променя настройки и не печата. Тя събира имена на принтери, драйвери, USB/LAN портове, IP адреси, опашки и свързан печатен софтуер. Накрая създава ZIP отчет на Desktop, който можеш да покажеш в ChatGPT.",
            AutoSize = false,
            Width = 690,
            Height = 70,
            Location = new Point(31, 105),
            ForeColor = Color.FromArgb(205, 213, 225)
        };

        _scanButton.Text = "АНАЛИЗИРАЙ ПРИНТЕРИТЕ";
        _scanButton.Width = 265;
        _scanButton.Height = 46;
        _scanButton.Location = new Point(31, 185);
        _scanButton.BackColor = Color.FromArgb(39, 112, 77);
        _scanButton.ForeColor = Color.White;
        _scanButton.FlatStyle = FlatStyle.Flat;
        _scanButton.FlatAppearance.BorderSize = 0;
        _scanButton.Font = new Font("Segoe UI", 10.5F, FontStyle.Bold);
        _scanButton.Click += async (_, _) => await RunScanAsync();

        _openButton.Text = "ОТВОРИ ОТЧЕТА";
        _openButton.Width = 175;
        _openButton.Height = 46;
        _openButton.Location = new Point(308, 185);
        _openButton.BackColor = Color.FromArgb(41, 74, 116);
        _openButton.ForeColor = Color.White;
        _openButton.FlatStyle = FlatStyle.Flat;
        _openButton.FlatAppearance.BorderSize = 0;
        _openButton.Enabled = false;
        _openButton.Click += (_, _) => OpenReport();

        _copyButton.Text = "КОПИРАЙ ПЪТЯ";
        _copyButton.Width = 165;
        _copyButton.Height = 46;
        _copyButton.Location = new Point(495, 185);
        _copyButton.BackColor = Color.FromArgb(55, 61, 72);
        _copyButton.ForeColor = Color.White;
        _copyButton.FlatStyle = FlatStyle.Flat;
        _copyButton.FlatAppearance.BorderSize = 0;
        _copyButton.Enabled = false;
        _copyButton.Click += (_, _) => CopyReportPath();

        _progress.Location = new Point(31, 248);
        _progress.Width = 690;
        _progress.Height = 10;
        _progress.Style = ProgressBarStyle.Blocks;

        _status.Text = "Готов за анализ.";
        _status.AutoSize = true;
        _status.Location = new Point(31, 270);
        _status.ForeColor = Color.FromArgb(160, 210, 180);

        _log.Location = new Point(31, 301);
        _log.Width = 690;
        _log.Height = 190;
        _log.Multiline = true;
        _log.ReadOnly = true;
        _log.ScrollBars = ScrollBars.Vertical;
        _log.BackColor = Color.FromArgb(16, 23, 35);
        _log.ForeColor = Color.FromArgb(220, 226, 235);
        _log.BorderStyle = BorderStyle.FixedSingle;
        _log.Font = new Font("Consolas", 9F);

        var privacy = new Label
        {
            Text = "Поверителност: не се събират поръчки, документи, пароли, токени или клиентски данни. Отчетът остава само на този компютър, докато ти не го изпратиш.",
            AutoSize = false,
            Width = 690,
            Height = 48,
            Location = new Point(31, 505),
            ForeColor = Color.FromArgb(150, 160, 177)
        };

        Controls.AddRange(new Control[]
        {
            title, subtitle, explanation, _scanButton, _openButton, _copyButton,
            _progress, _status, _log, privacy
        });
    }

    private async Task RunScanAsync()
    {
        _scanButton.Enabled = false;
        _openButton.Enabled = false;
        _copyButton.Enabled = false;
        _progress.Style = ProgressBarStyle.Marquee;
        _progress.MarqueeAnimationSpeed = 25;
        _log.Clear();
        _status.Text = "Анализът работи…";
        _status.ForeColor = Color.FromArgb(235, 190, 90);

        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        if (string.IsNullOrWhiteSpace(desktop) || !Directory.Exists(desktop))
        {
            desktop = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        }

        var timestamp = DateTime.Now.ToString("yyyyMMdd-HHmmss");
        var reportFolder = Path.Combine(desktop, $"Zorbas-Printer-Report-{timestamp}");
        var zipPath = reportFolder + ".zip";
        var scriptPath = Path.Combine(Path.GetTempPath(), $"zorbas-printer-scan-{Guid.NewGuid():N}.ps1");

        try
        {
            Directory.CreateDirectory(reportFolder);
            await File.WriteAllTextAsync(scriptPath, PowerShellScript, new UTF8Encoding(false));
            AppendLog("Стартиране на read-only Windows анализ…");

            var startInfo = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            startInfo.ArgumentList.Add("-NoProfile");
            startInfo.ArgumentList.Add("-ExecutionPolicy");
            startInfo.ArgumentList.Add("Bypass");
            startInfo.ArgumentList.Add("-File");
            startInfo.ArgumentList.Add(scriptPath);
            startInfo.ArgumentList.Add("-OutputFolder");
            startInfo.ArgumentList.Add(reportFolder);

            using var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
            process.OutputDataReceived += (_, args) =>
            {
                if (!string.IsNullOrWhiteSpace(args.Data)) BeginInvoke(() => AppendLog(args.Data));
            };
            process.ErrorDataReceived += (_, args) =>
            {
                if (!string.IsNullOrWhiteSpace(args.Data)) BeginInvoke(() => AppendLog("Windows: " + args.Data));
            };

            if (!process.Start()) throw new InvalidOperationException("PowerShell анализът не можа да стартира.");
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            await process.WaitForExitAsync();

            var jsonPath = Path.Combine(reportFolder, "report.json");
            var textPath = Path.Combine(reportFolder, "report.txt");
            if (process.ExitCode != 0 || !File.Exists(jsonPath) || !File.Exists(textPath))
            {
                throw new InvalidOperationException($"Отчетът не беше завършен. Windows код: {process.ExitCode}.");
            }

            if (File.Exists(zipPath)) File.Delete(zipPath);
            ZipFile.CreateFromDirectory(reportFolder, zipPath, CompressionLevel.Optimal, includeBaseDirectory: true);

            _lastReportFolder = reportFolder;
            _lastZipPath = zipPath;
            _status.Text = "Готово. ZIP отчетът е създаден на Desktop.";
            _status.ForeColor = Color.FromArgb(105, 220, 145);
            AppendLog("✓ report.json");
            AppendLog("✓ report.txt");
            AppendLog($"✓ {Path.GetFileName(zipPath)}");
            AppendLog("Качи ZIP файла в ChatGPT, за да конфигурираме Print 1 и Print 2.");
            _openButton.Enabled = true;
            _copyButton.Enabled = true;
        }
        catch (Exception error)
        {
            _status.Text = "Анализът не завърши.";
            _status.ForeColor = Color.FromArgb(240, 115, 115);
            AppendLog("ГРЕШКА: " + error.Message);
            MessageBox.Show(this, error.Message, "Zorbas Printer Scanner", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            try { if (File.Exists(scriptPath)) File.Delete(scriptPath); } catch { }
            _progress.MarqueeAnimationSpeed = 0;
            _progress.Style = ProgressBarStyle.Blocks;
            _scanButton.Enabled = true;
        }
    }

    private void OpenReport()
    {
        if (string.IsNullOrWhiteSpace(_lastReportFolder) || !Directory.Exists(_lastReportFolder)) return;
        Process.Start(new ProcessStartInfo("explorer.exe", _lastReportFolder) { UseShellExecute = true });
    }

    private void CopyReportPath()
    {
        if (string.IsNullOrWhiteSpace(_lastZipPath)) return;
        Clipboard.SetText(_lastZipPath);
        _status.Text = "Пътят до ZIP файла е копиран.";
    }

    private void AppendLog(string message)
    {
        if (_log.TextLength > 0) _log.AppendText(Environment.NewLine);
        _log.AppendText(message);
    }

    private const string PowerShellScript = """
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

Write-Output '1/8 Windows и Print Spooler'
$metadata = [ordered]@{
  ScannerVersion = '1.0.0'
  GeneratedAt = (Get-Date).ToString('o')
  ComputerName = $env:COMPUTERNAME
  Windows = [System.Environment]::OSVersion.VersionString
  Is64BitOperatingSystem = [System.Environment]::Is64BitOperatingSystem
  PowerShellVersion = $PSVersionTable.PSVersion.ToString()
}
$spooler = Safe-Run { Get-Service -Name Spooler | Select-Object Name, Status, StartType }

Write-Output '2/8 Инсталирани принтери и опашки'
$win32Printers = @(Safe-Run {
  Get-CimInstance Win32_Printer | Sort-Object Name | Select-Object \
    Name, Default, Local, Network, Shared, ShareName, PortName, DriverName, \
    PrintProcessor, Datatype, Status, PrinterStatus, WorkOffline, PNPDeviceID, \
    SystemName, Location, Comment, HorizontalResolution, VerticalResolution
})

$printerQueues = @()
if (Get-Command Get-Printer -ErrorAction SilentlyContinue) {
  $printerQueues = @(Safe-Run {
    Get-Printer | Sort-Object Name | Select-Object \
      Name, DriverName, PortName, Shared, ShareName, Published, Type, \
      PrinterStatus, JobCount, ComputerName, RenderingMode
  })
}

$defaultPrinter = @($win32Printers | Where-Object { $_.Default -eq $true })

Write-Output '3/8 Портове, IP адреси и драйвери'
$printerPorts = @()
if (Get-Command Get-PrinterPort -ErrorAction SilentlyContinue) {
  $printerPorts = @(Safe-Run {
    Get-PrinterPort | Sort-Object Name | Select-Object \
      Name, Description, PortMonitor, PrinterHostAddress, PortNumber, \
      Protocol, SNMPEnabled, LprQueueName, ByteCount
  })
}

$printerDrivers = @()
if (Get-Command Get-PrinterDriver -ErrorAction SilentlyContinue) {
  $printerDrivers = @(Safe-Run {
    Get-PrinterDriver | Sort-Object Name | Select-Object \
      Name, Manufacturer, DriverVersion, MajorVersion, InfPath, \
      ConfigFile, DataFile, HelpFile
  })
}

Write-Output '4/8 Настройки на хартия и печат'
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

Write-Output '5/8 USB и PnP устройства'
$pnpDevices = @(Safe-Run {
  Get-CimInstance Win32_PnPEntity | Where-Object {
    $_.PNPClass -eq 'Printer' -or
    $_.Name -match '(?i)printer|thermal|receipt|pos|epson|star|xprinter|bixolon|citizen|rongta|gprinter|zjiang'
  } | Sort-Object Name | Select-Object Name, Manufacturer, PNPClass, PNPDeviceID, Service, Status, ConfigManagerErrorCode
})

Write-Output '6/8 Windows printer registry'
$registry = [ordered]@{
  CurrentUserDevices = @(Read-RegistryValues 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Devices')
  CurrentUserPrinterPorts = @(Read-RegistryValues 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\PrinterPorts')
  PrintMonitors = @(Safe-Run { Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print\\Monitors' | Select-Object PSChildName })
  TcpIpPorts = @(Safe-Run {
    $base = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Print\\Monitors\\Standard TCP/IP Port\\Ports'
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

Write-Output '7/8 Свързан печатен и POS софтуер'
$softwarePattern = '(?i)zorbas|restaurant|waiter|kitchen|receipt|thermal|printer|print|pos\\b|point.of.sale|sql'
$installedSoftware = @()
foreach ($path in @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)) {
  $installedSoftware += @(Safe-Run {
    Get-ItemProperty $path -ErrorAction SilentlyContinue | Where-Object {
      $_.DisplayName -and $_.DisplayName -match $softwarePattern
    } | Select-Object DisplayName, DisplayVersion, Publisher, InstallLocation, InstallDate
  })
}
$installedSoftware = @($installedSoftware | Sort-Object DisplayName -Unique)

$relatedProcesses = @(Safe-Run {
  Get-CimInstance Win32_Process | Where-Object {
    $_.Name -match '(?i)zorbas|restaurant|waiter|kitchen|receipt|thermal|printer|print|pos|sql'
  } | Select-Object Name, ProcessId, ExecutablePath
})

Write-Output '8/8 Мрежови връзки към стандартни printer портове'
$networkConnections = @()
if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
  $networkConnections = @(Safe-Run {
    Get-NetTCPConnection | Where-Object {
      $_.RemotePort -in @(515, 631, 9100) -or $_.LocalPort -in @(515, 631, 9100)
    } | Select-Object State, LocalAddress, LocalPort, RemoteAddress, RemotePort, OwningProcess
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
foreach ($printer in @($defaultPrinter)) { $lines.Add('- ' + $printer.Name + ' | ' + $printer.PortName + ' | ' + $printer.DriverName) }
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
foreach ($software in @($installedSoftware)) { $lines.Add('- ' + $software.DisplayName + ' ' + $software.DisplayVersion + ' | ' + $software.InstallLocation) }
$lines.Add('')
$lines.Add('Upload the ZIP report to ChatGPT. No data was uploaded automatically.')
$lines | Set-Content -Path (Join-Path $OutputFolder 'report.txt') -Encoding UTF8

Write-Output 'Отчетът е създаден успешно.'
exit 0
""";
}
