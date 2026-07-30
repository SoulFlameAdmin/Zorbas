using System.Diagnostics;
using System.IO.Compression;
using System.Text;

namespace SoulFlame.ZorbasPrinterScanner;

internal sealed class MainForm : Form
{
    private const string ScriptResourceName = "SoulFlame.ZorbasPrinterScanner.PrinterScan.ps1";

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

        ConfigureButton(_scanButton, "АНАЛИЗИРАЙ ПРИНТЕРИТЕ", new Point(31, 185), 265, Color.FromArgb(39, 112, 77));
        _scanButton.Font = new Font("Segoe UI", 10.5F, FontStyle.Bold);
        _scanButton.Click += async (_, _) => await RunScanAsync();

        ConfigureButton(_openButton, "ОТВОРИ ОТЧЕТА", new Point(308, 185), 175, Color.FromArgb(41, 74, 116));
        _openButton.Enabled = false;
        _openButton.Click += (_, _) => OpenReport();

        ConfigureButton(_copyButton, "КОПИРАЙ ПЪТЯ", new Point(495, 185), 165, Color.FromArgb(55, 61, 72));
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

    private static void ConfigureButton(Button button, string text, Point location, int width, Color color)
    {
        button.Text = text;
        button.Width = width;
        button.Height = 46;
        button.Location = location;
        button.BackColor = color;
        button.ForeColor = Color.White;
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
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
            await File.WriteAllTextAsync(scriptPath, LoadPowerShellScript(), new UTF8Encoding(false));
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

    private static string LoadPowerShellScript()
    {
        using var stream = typeof(MainForm).Assembly.GetManifestResourceStream(ScriptResourceName)
            ?? throw new InvalidOperationException("Вграденият модул за анализ липсва.");
        using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
        return reader.ReadToEnd();
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
}
