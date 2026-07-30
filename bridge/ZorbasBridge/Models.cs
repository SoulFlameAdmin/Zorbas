using System.Text.Json;
using System.Text.Json.Serialization;

namespace SoulFlame.ZorbasBridge;

internal sealed class PairResponse
{
    [JsonPropertyName("ok")]
    public bool Ok { get; set; }

    [JsonPropertyName("restaurant_id")]
    public Guid RestaurantId { get; set; }

    [JsonPropertyName("restaurant_code")]
    public string RestaurantCode { get; set; } = string.Empty;

    [JsonPropertyName("restaurant_name")]
    public string RestaurantName { get; set; } = string.Empty;

    [JsonPropertyName("device_record_id")]
    public Guid DeviceRecordId { get; set; }

    [JsonPropertyName("device_id")]
    public string DeviceId { get; set; } = string.Empty;

    [JsonPropertyName("device_token")]
    public string DeviceToken { get; set; } = string.Empty;

    [JsonPropertyName("operating_mode")]
    public string OperatingMode { get; set; } = BridgeModes.TestNoPrint;
}

internal sealed class BridgeConfig
{
    [JsonPropertyName("restaurant")]
    public RestaurantConfig Restaurant { get; set; } = new();

    [JsonPropertyName("device_record_id")]
    public Guid DeviceRecordId { get; set; }

    [JsonPropertyName("printers")]
    public List<PrinterDefinition> Printers { get; set; } = [];
}

internal sealed class RestaurantConfig
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("city")]
    public string? City { get; set; }

    [JsonPropertyName("site_url")]
    public string? SiteUrl { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("plan")]
    public string Plan { get; set; } = string.Empty;

    [JsonPropertyName("operating_mode")]
    public string OperatingMode { get; set; } = BridgeModes.TestNoPrint;
}

internal sealed class PrinterDefinition
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("code")]
    public string Code { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("destination")]
    public string Destination { get; set; } = string.Empty;

    [JsonPropertyName("connection_type")]
    public string? ConnectionType { get; set; }

    [JsonPropertyName("connection_value")]
    public string? ConnectionValue { get; set; }

    [JsonPropertyName("paper_width_mm")]
    public int PaperWidthMm { get; set; } = 80;

    [JsonPropertyName("model")]
    public string? Model { get; set; }

    [JsonPropertyName("active")]
    public bool Active { get; set; }
}

internal sealed class PrintJob
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("restaurant_id")]
    public Guid RestaurantId { get; set; }

    [JsonPropertyName("order_id")]
    public Guid? OrderId { get; set; }

    [JsonPropertyName("job_type")]
    public string JobType { get; set; } = "order";

    [JsonPropertyName("destination")]
    public string Destination { get; set; } = string.Empty;

    [JsonPropertyName("payload")]
    public JsonElement Payload { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "pending";

    [JsonPropertyName("attempts")]
    public int Attempts { get; set; }

    [JsonPropertyName("max_attempts")]
    public int MaxAttempts { get; set; } = 3;

    [JsonPropertyName("created_at")]
    public DateTimeOffset CreatedAt { get; set; }
}

internal sealed class ModeResponse
{
    [JsonPropertyName("ok")]
    public bool Ok { get; set; }

    [JsonPropertyName("operating_mode")]
    public string OperatingMode { get; set; } = BridgeModes.TestNoPrint;
}

internal sealed record ModeOption(string Value, string Label)
{
    public override string ToString() => Label;
}

internal static class BridgeModes
{
    public const string Legacy = "legacy";
    public const string TestNoPrint = "test_no_print";
    public const string Parallel = "parallel";
    public const string SoulFlame = "soulflame";

    public static readonly IReadOnlyList<ModeOption> Options =
    [
        new(Legacy, "Стара система"),
        new(TestNoPrint, "Тест без печат"),
        new(Parallel, "Паралелен тест"),
        new(SoulFlame, "SoulFlame система")
    ];

    public static string Label(string? value) =>
        Options.FirstOrDefault(option => option.Value == value)?.Label ?? value ?? "Неизвестен";

    public static bool ProcessesQueue(string? value) => value is Parallel or SoulFlame;
}
