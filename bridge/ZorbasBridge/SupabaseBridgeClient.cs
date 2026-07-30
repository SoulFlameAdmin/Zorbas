using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace SoulFlame.ZorbasBridge;

internal sealed class SupabaseBridgeClient : IDisposable
{
    private const string ApiUrl = "https://frhletkiuupgksmgxoxc.supabase.co";
    private const string ApiKey = "sb_publishable_JQPnalB8jOs639_PWoR6mA_AOk11xWC";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly HttpClient _httpClient = new()
    {
        BaseAddress = new Uri(ApiUrl),
        Timeout = TimeSpan.FromSeconds(15)
    };

    public Task<PairResponse> PairAsync(
        string restaurantCode,
        string deviceId,
        string deviceName,
        string appVersion,
        CancellationToken cancellationToken = default) =>
        RpcRequiredAsync<PairResponse>(
            "sf_pair_restaurant_device",
            new
            {
                p_restaurant_code = restaurantCode,
                p_device_id = deviceId,
                p_device_name = deviceName,
                p_platform = "windows",
                p_app_version = appVersion
            },
            cancellationToken);

    public Task<BridgeConfig> GetConfigAsync(
        string deviceId,
        string deviceToken,
        CancellationToken cancellationToken = default) =>
        RpcRequiredAsync<BridgeConfig>(
            "sf_bridge_get_config",
            new
            {
                p_device_id = deviceId,
                p_device_token = deviceToken
            },
            cancellationToken);

    public Task HeartbeatAsync(
        string deviceId,
        string deviceToken,
        string state,
        string appVersion,
        object? metadata = null,
        CancellationToken cancellationToken = default) =>
        RpcDiscardAsync(
            "sf_bridge_heartbeat",
            new
            {
                p_device_id = deviceId,
                p_device_token = deviceToken,
                p_state = state,
                p_app_version = appVersion,
                p_metadata = metadata ?? new { }
            },
            cancellationToken);

    public Task<PrintJob?> ClaimNextAsync(
        string deviceId,
        string deviceToken,
        string destination,
        CancellationToken cancellationToken = default) =>
        RpcOptionalAsync<PrintJob>(
            "sf_bridge_claim_next_print_job",
            new
            {
                p_device_id = deviceId,
                p_device_token = deviceToken,
                p_destination = destination
            },
            cancellationToken);

    public Task AckAsync(
        string deviceId,
        string deviceToken,
        Guid jobId,
        string status,
        string? error = null,
        object? metadata = null,
        CancellationToken cancellationToken = default) =>
        RpcDiscardAsync(
            "sf_bridge_ack_print_job",
            new
            {
                p_device_id = deviceId,
                p_device_token = deviceToken,
                p_job_id = jobId,
                p_status = status,
                p_error = error,
                p_metadata = metadata ?? new { }
            },
            cancellationToken);

    public Task<ModeResponse> SetOperatingModeAsync(
        string deviceId,
        string deviceToken,
        string mode,
        CancellationToken cancellationToken = default) =>
        RpcRequiredAsync<ModeResponse>(
            "sf_bridge_set_operating_mode",
            new
            {
                p_device_id = deviceId,
                p_device_token = deviceToken,
                p_mode = mode
            },
            cancellationToken);

    private async Task<T> RpcRequiredAsync<T>(string name, object payload, CancellationToken cancellationToken)
    {
        var result = await RpcOptionalAsync<T>(name, payload, cancellationToken).ConfigureAwait(false);
        return result ?? throw new InvalidOperationException($"RPC {name} върна празен отговор.");
    }

    private async Task RpcDiscardAsync(string name, object payload, CancellationToken cancellationToken)
    {
        _ = await SendAsync(name, payload, cancellationToken).ConfigureAwait(false);
    }

    private async Task<T?> RpcOptionalAsync<T>(string name, object payload, CancellationToken cancellationToken)
    {
        var json = await SendAsync(name, payload, cancellationToken).ConfigureAwait(false);
        if (string.IsNullOrWhiteSpace(json) || json.Trim().Equals("null", StringComparison.OrdinalIgnoreCase))
        {
            return default;
        }

        return JsonSerializer.Deserialize<T>(json, JsonOptions);
    }

    private async Task<string> SendAsync(string name, object payload, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"/rest/v1/rpc/{name}");
        request.Headers.TryAddWithoutValidation("apikey", ApiKey);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ApiKey);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        request.Content = new StringContent(
            JsonSerializer.Serialize(payload, JsonOptions),
            Encoding.UTF8,
            "application/json");

        using var response = await _httpClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);

        if (response.IsSuccessStatusCode) return body;

        var message = TryReadErrorMessage(body)
            ?? $"SoulFlame API грешка: {(int)response.StatusCode} {response.ReasonPhrase}";
        throw new InvalidOperationException(message);
    }

    private static string? TryReadErrorMessage(string body)
    {
        if (string.IsNullOrWhiteSpace(body)) return null;

        try
        {
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            foreach (var name in new[] { "message", "hint", "details", "error" })
            {
                if (root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String)
                {
                    var text = value.GetString();
                    if (!string.IsNullOrWhiteSpace(text)) return text;
                }
            }
        }
        catch
        {
            // The fallback below is safer than surfacing malformed JSON.
        }

        return body.Length <= 300 ? body : body[..300];
    }

    public void Dispose() => _httpClient.Dispose();
}
