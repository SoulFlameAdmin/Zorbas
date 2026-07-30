using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SoulFlame.ZorbasBridge;

internal sealed class BridgeSettings
{
    public string DeviceId { get; set; } = Guid.NewGuid().ToString("D");
    public string RestaurantCode { get; set; } = string.Empty;
    public string RestaurantName { get; set; } = string.Empty;
    public string ProtectedDeviceToken { get; set; } = string.Empty;
    public string StaffPrinterName { get; set; } = string.Empty;
    public string KitchenPrinterName { get; set; } = string.Empty;
    public bool StartMinimized { get; set; }

    [JsonIgnore]
    public bool IsPaired => !string.IsNullOrWhiteSpace(RestaurantCode) && !string.IsNullOrWhiteSpace(ProtectedDeviceToken);
}

internal sealed class SettingsStore
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("SoulFlame.ZorbasBridge.v1");
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    private readonly string _directory;
    private readonly string _settingsPath;

    public SettingsStore()
    {
        _directory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SoulFlame",
            "ZorbasBridge");
        _settingsPath = Path.Combine(_directory, "settings.json");
    }

    public string DirectoryPath => _directory;

    public BridgeSettings Load()
    {
        Directory.CreateDirectory(_directory);
        if (!File.Exists(_settingsPath))
        {
            var created = new BridgeSettings();
            Save(created);
            return created;
        }

        try
        {
            var json = File.ReadAllText(_settingsPath, Encoding.UTF8);
            var settings = JsonSerializer.Deserialize<BridgeSettings>(json, JsonOptions) ?? new BridgeSettings();
            if (string.IsNullOrWhiteSpace(settings.DeviceId))
            {
                settings.DeviceId = Guid.NewGuid().ToString("D");
                Save(settings);
            }
            return settings;
        }
        catch
        {
            var brokenPath = Path.Combine(_directory, $"settings-broken-{DateTime.Now:yyyyMMdd-HHmmss}.json");
            try { File.Move(_settingsPath, brokenPath, true); } catch { }
            var replacement = new BridgeSettings();
            Save(replacement);
            return replacement;
        }
    }

    public void Save(BridgeSettings settings)
    {
        Directory.CreateDirectory(_directory);
        var temporaryPath = _settingsPath + ".tmp";
        var json = JsonSerializer.Serialize(settings, JsonOptions);
        File.WriteAllText(temporaryPath, json, new UTF8Encoding(false));
        File.Move(temporaryPath, _settingsPath, true);
    }

    public void SetDeviceToken(BridgeSettings settings, string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            settings.ProtectedDeviceToken = string.Empty;
            return;
        }

        var clear = Encoding.UTF8.GetBytes(token);
        var protectedBytes = ProtectedData.Protect(clear, Entropy, DataProtectionScope.CurrentUser);
        settings.ProtectedDeviceToken = Convert.ToBase64String(protectedBytes);
        CryptographicOperations.ZeroMemory(clear);
    }

    public string GetDeviceToken(BridgeSettings settings)
    {
        if (string.IsNullOrWhiteSpace(settings.ProtectedDeviceToken)) return string.Empty;

        try
        {
            var protectedBytes = Convert.FromBase64String(settings.ProtectedDeviceToken);
            var clear = ProtectedData.Unprotect(protectedBytes, Entropy, DataProtectionScope.CurrentUser);
            try
            {
                return Encoding.UTF8.GetString(clear);
            }
            finally
            {
                CryptographicOperations.ZeroMemory(clear);
            }
        }
        catch
        {
            return string.Empty;
        }
    }

    public void ClearPairing(BridgeSettings settings)
    {
        settings.RestaurantCode = string.Empty;
        settings.RestaurantName = string.Empty;
        settings.ProtectedDeviceToken = string.Empty;
        Save(settings);
    }
}
