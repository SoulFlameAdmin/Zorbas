using System.Text;

namespace SoulFlame.ZorbasBridge;

internal sealed class BridgeLog
{
    private const long MaxLogBytes = 2 * 1024 * 1024;
    private readonly object _sync = new();
    private readonly string _directory;
    private readonly string _path;

    public BridgeLog(string settingsDirectory)
    {
        _directory = Path.Combine(settingsDirectory, "logs");
        _path = Path.Combine(_directory, "bridge.log");
    }

    public event Action<string>? LineWritten;

    public void Info(string message) => Write("INFO", message);
    public void Warning(string message) => Write("WARN", message);
    public void Error(string message) => Write("ERROR", message);

    private void Write(string level, string message)
    {
        var safeMessage = string.IsNullOrWhiteSpace(message) ? "—" : message.Trim();
        var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} [{level}] {safeMessage}";

        lock (_sync)
        {
            try
            {
                Directory.CreateDirectory(_directory);
                RotateIfNeeded();
                File.AppendAllText(_path, line + Environment.NewLine, new UTF8Encoding(false));
            }
            catch
            {
                // Logging must never stop printing.
            }
        }

        try { LineWritten?.Invoke(line); } catch { }
    }

    private void RotateIfNeeded()
    {
        if (!File.Exists(_path) || new FileInfo(_path).Length < MaxLogBytes) return;

        var archive = Path.Combine(_directory, "bridge.previous.log");
        try { File.Move(_path, archive, true); } catch { }
    }
}
