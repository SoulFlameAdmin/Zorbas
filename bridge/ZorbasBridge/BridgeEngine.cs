namespace SoulFlame.ZorbasBridge;

internal sealed class BridgeEngine : IAsyncDisposable
{
    private readonly BridgeSettings _settings;
    private readonly SettingsStore _settingsStore;
    private readonly SupabaseBridgeClient _client;
    private readonly WindowsPrinterService _printerService;
    private readonly BridgeLog _log;
    private readonly SemaphoreSlim _lifecycleLock = new(1, 1);
    private CancellationTokenSource? _runCancellation;
    private Task? _runTask;
    private BridgeConfig? _config;

    public BridgeEngine(
        BridgeSettings settings,
        SettingsStore settingsStore,
        SupabaseBridgeClient client,
        WindowsPrinterService printerService,
        BridgeLog log)
    {
        _settings = settings;
        _settingsStore = settingsStore;
        _client = client;
        _printerService = printerService;
        _log = log;
    }

    public bool IsRunning => _runTask is { IsCompleted: false };
    public BridgeConfig? Config => _config;

    public event Action<bool, string>? ConnectionChanged;
    public event Action<BridgeConfig>? ConfigChanged;
    public event Action<string>? ActivityChanged;

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        await _lifecycleLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (IsRunning) return;
            _ = RequireDeviceToken();

            _runCancellation = new CancellationTokenSource();
            _runTask = RunLoopAsync(_runCancellation.Token);
            ConnectionChanged?.Invoke(false, "Bridge стартира и чака връзка…");
            _log.Info("Bridge фоновият процес стартира. При липса на интернет ще опитва отново автоматично.");
        }
        finally
        {
            _lifecycleLock.Release();
        }
    }

    public async Task StopAsync()
    {
        await _lifecycleLock.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_runCancellation is null || _runTask is null) return;

            _runCancellation.Cancel();
            try { await _runTask.ConfigureAwait(false); }
            catch (OperationCanceledException) { }
            catch (Exception error) { _log.Warning($"Bridge stop: {error.Message}"); }

            _runCancellation.Dispose();
            _runCancellation = null;
            _runTask = null;
            ConnectionChanged?.Invoke(false, "Bridge е спрян");
            _log.Info("Bridge е спрян.");
        }
        finally
        {
            _lifecycleLock.Release();
        }
    }

    public async Task SetOperatingModeAsync(string mode, CancellationToken cancellationToken = default)
    {
        var token = RequireDeviceToken();
        var response = await _client.SetOperatingModeAsync(
            _settings.DeviceId,
            token,
            mode,
            cancellationToken).ConfigureAwait(false);

        if (_config is not null)
        {
            _config.Restaurant.OperatingMode = response.OperatingMode;
            ConfigChanged?.Invoke(_config);
        }

        _log.Info($"Режимът е сменен на {BridgeModes.Label(response.OperatingMode)}.");
        ActivityChanged?.Invoke($"Режим: {BridgeModes.Label(response.OperatingMode)}");
    }

    public Task PrintTestAsync(string destination, CancellationToken cancellationToken = default)
    {
        var printerName = GetPrinterName(destination);
        if (string.IsNullOrWhiteSpace(printerName))
        {
            throw new InvalidOperationException(destination == "kitchen"
                ? "Избери Windows принтер за Print 2."
                : "Избери Windows принтер за Print 1.");
        }

        var lines = ReceiptFormatter.TestReceipt(destination, printerName);
        return _printerService.PrintReceiptAsync(
            printerName,
            lines,
            $"Zorbas Bridge test {destination}",
            cancellationToken);
    }

    private async Task RunLoopAsync(CancellationToken cancellationToken)
    {
        var nextHeartbeat = DateTimeOffset.MinValue;
        var nextConfigRefresh = DateTimeOffset.MinValue;

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var now = DateTimeOffset.UtcNow;
                var token = RequireDeviceToken();

                if (_config is null || now >= nextConfigRefresh)
                {
                    _config = await _client.GetConfigAsync(
                        _settings.DeviceId,
                        token,
                        cancellationToken).ConfigureAwait(false);
                    SaveRestaurantIdentity(_config);
                    ConfigChanged?.Invoke(_config);
                    nextConfigRefresh = now.AddSeconds(15);
                }

                if (now >= nextHeartbeat)
                {
                    await _client.HeartbeatAsync(
                        _settings.DeviceId,
                        token,
                        "online",
                        Application.ProductVersion,
                        new
                        {
                            staff_printer = _settings.StaffPrinterName,
                            kitchen_printer = _settings.KitchenPrinterName,
                            kitchen_endpoint = "192.168.0.98:9100"
                        },
                        cancellationToken).ConfigureAwait(false);
                    nextHeartbeat = now.AddSeconds(20);
                    ConnectionChanged?.Invoke(true, "Bridge онлайн");
                }

                var mode = _config.Restaurant.OperatingMode;
                if (mode == BridgeModes.Legacy)
                {
                    ActivityChanged?.Invoke("Старата система е активна. Новият печат е спрян.");
                }
                else
                {
                    var staffPrinted = await ProcessDestinationAsync("staff", cancellationToken).ConfigureAwait(false);
                    var kitchenPrinted = await ProcessDestinationAsync("kitchen", cancellationToken).ConfigureAwait(false);

                    if (!staffPrinted && !kitchenPrinted && mode == BridgeModes.TestNoPrint)
                    {
                        ActivityChanged?.Invoke("Тестов режим: приема само TEST от телефона.");
                    }
                    else if (!staffPrinted && !kitchenPrinted)
                    {
                        ActivityChanged?.Invoke("Bridge онлайн · чака бележки.");
                    }
                }

                await Task.Delay(1000, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception error)
            {
                ConnectionChanged?.Invoke(false, "Няма връзка · автоматичен нов опит");
                ActivityChanged?.Invoke("Ще опита отново след 5 секунди.");
                _log.Error(error.Message);
                await Task.Delay(TimeSpan.FromSeconds(5), cancellationToken).ConfigureAwait(false);
            }
        }
    }

    private async Task<bool> ProcessDestinationAsync(string destination, CancellationToken cancellationToken)
    {
        var printerName = GetPrinterName(destination);
        if (string.IsNullOrWhiteSpace(printerName) || !_printerService.IsPrinterAvailable(printerName))
        {
            ActivityChanged?.Invoke(destination == "kitchen"
                ? "Print 2 не е избран или не е наличен."
                : "Print 1 не е избран или не е наличен.");
            return false;
        }

        var token = RequireDeviceToken();
        var job = await _client.ClaimNextAsync(
            _settings.DeviceId,
            token,
            destination,
            cancellationToken).ConfigureAwait(false);

        if (job is null) return false;

        var orderNumber = ReadOrderNumber(job);
        ActivityChanged?.Invoke($"{(destination == "kitchen" ? "Print 2" : "Print 1")}: бележка №{orderNumber}");
        _log.Info($"Взета е задача {job.Id} за {destination}, №{orderNumber}, опит {job.Attempts}/{job.MaxAttempts}.");

        try
        {
            await _client.AckAsync(
                _settings.DeviceId,
                token,
                job.Id,
                "preparing",
                cancellationToken: cancellationToken).ConfigureAwait(false);

            var lines = ReceiptFormatter.Format(
                job,
                _config?.Restaurant.Name ?? _settings.RestaurantName);

            await _client.AckAsync(
                _settings.DeviceId,
                token,
                job.Id,
                "printing",
                cancellationToken: cancellationToken).ConfigureAwait(false);

            await _printerService.PrintReceiptAsync(
                printerName,
                lines,
                $"Zorbas {job.JobType} {orderNumber}",
                cancellationToken).ConfigureAwait(false);

            await _client.AckAsync(
                _settings.DeviceId,
                token,
                job.Id,
                "printed",
                metadata: new
                {
                    windows_printer = printerName,
                    receipt_profile = "icash-photo-match-v1"
                },
                cancellationToken: cancellationToken).ConfigureAwait(false);

            _log.Info($"Задача {job.Id} е приета от Windows spooler на „{printerName}“.");
            return true;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception error)
        {
            var retry = job.Attempts < job.MaxAttempts;
            var status = retry ? "retrying" : "failed";
            try
            {
                await _client.AckAsync(
                    _settings.DeviceId,
                    token,
                    job.Id,
                    status,
                    error.Message,
                    new { windows_printer = printerName },
                    CancellationToken.None).ConfigureAwait(false);
            }
            catch (Exception ackError)
            {
                _log.Error($"Неуспешен ACK за задача {job.Id}: {ackError.Message}");
            }

            _log.Error($"Печатът на задача {job.Id} се провали: {error.Message}");
            return false;
        }
    }

    private string GetPrinterName(string destination) =>
        destination == "kitchen" ? _settings.KitchenPrinterName : _settings.StaffPrinterName;

    private string RequireDeviceToken()
    {
        var token = _settingsStore.GetDeviceToken(_settings);
        if (string.IsNullOrWhiteSpace(token))
            throw new InvalidOperationException("Bridge устройството не е свързано. Въведи ресторантския код.");

        return token;
    }

    private void SaveRestaurantIdentity(BridgeConfig config)
    {
        _settings.RestaurantCode = config.Restaurant.Code;
        _settings.RestaurantName = config.Restaurant.Name;
        _settingsStore.Save(_settings);
    }

    private static string ReadOrderNumber(PrintJob job)
    {
        if (job.Payload.ValueKind == System.Text.Json.JsonValueKind.Object &&
            job.Payload.TryGetProperty("order_number", out var number))
        {
            return number.ToString();
        }

        return "—";
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync().ConfigureAwait(false);
        _lifecycleLock.Dispose();
    }
}
