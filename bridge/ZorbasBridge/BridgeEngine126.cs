namespace SoulFlame.ZorbasBridge;

internal sealed class BridgeEngine
{
    private readonly BridgeSettings _settings;
    private readonly SettingsStore _settingsStore;
    private readonly SupabaseBridgeClient _client;
    private readonly WindowsPrinterService _printerService;
    private readonly NetworkPrinterService _networkPrinterService = new();
    private readonly BridgeLog _log;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private CancellationTokenSource? _cts;
    private Task? _loop;
    private BridgeConfig? _config;

    public BridgeEngine(BridgeSettings settings, SettingsStore settingsStore, SupabaseBridgeClient client, WindowsPrinterService printerService, BridgeLog log)
    {
        _settings = settings;
        _settingsStore = settingsStore;
        _client = client;
        _printerService = printerService;
        _log = log;
    }

    public bool IsRunning => _loop is { IsCompleted: false };
    public BridgeConfig? Config => _config;
    public event Action<bool,string>? ConnectionChanged;
    public event Action<BridgeConfig>? ConfigChanged;
    public event Action<string>? ActivityChanged;

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (IsRunning) return;
            _ = RequireToken();
            _cts = new CancellationTokenSource();
            _loop = RunAsync(_cts.Token);
            ConnectionChanged?.Invoke(false,"Bridge стартира…");
        }
        finally { _gate.Release(); }
    }

    public async Task StopAsync()
    {
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_cts is null || _loop is null) return;
            _cts.Cancel();
            try { await _loop.ConfigureAwait(false); } catch (OperationCanceledException) { } catch (Exception e) { _log.Warning(e.Message); }
            _cts.Dispose(); _cts=null; _loop=null;
            ConnectionChanged?.Invoke(false,"Bridge е спрян");
        }
        finally { _gate.Release(); }
    }

    public async Task SetOperatingModeAsync(string mode, CancellationToken cancellationToken = default)
    {
        var result = await _client.SetOperatingModeAsync(_settings.DeviceId,RequireToken(),mode,cancellationToken).ConfigureAwait(false);
        if (_config is not null) { _config.Restaurant.OperatingMode=result.OperatingMode; ConfigChanged?.Invoke(_config); }
        ActivityChanged?.Invoke($"Режим: {BridgeModes.Label(result.OperatingMode)}");
    }

    public async Task PrintTestAsync(string destination, CancellationToken cancellationToken = default)
    {
        if (destination is not "staff" and not "kitchen") throw new InvalidOperationException("Невалидна тестова дестинация.");
        _config = await _client.GetConfigAsync(_settings.DeviceId,RequireToken(),cancellationToken).ConfigureAwait(false);
        SaveIdentity(_config);
        ConfigChanged?.Invoke(_config);

        if (TryGetNetworkEndpoint(destination,out var host,out var port))
        {
            var receipt=ReceiptFormatter.TestReceipt(destination,$"{host}:{port}");
            await _networkPrinterService.PrintReceiptAsync(host,port,receipt,$"SoulFlame local test {destination}",cancellationToken).ConfigureAwait(false);
            ActivityChanged?.Invoke($"LOCAL TEST → {host}:{port}");
            return;
        }

        var printer=GetPrinterName(destination);
        if (string.IsNullOrWhiteSpace(printer) || !_printerService.IsPrinterAvailable(printer))
            throw new InvalidOperationException(destination=="kitchen" ? "Избери наличен Windows принтер за Кухня." : "Избери наличен Windows принтер за Сервитьори.");

        await _printerService.PrintReceiptAsync(printer,ReceiptFormatter.TestReceipt(destination,printer),$"SoulFlame local test {destination}",cancellationToken).ConfigureAwait(false);
        ActivityChanged?.Invoke($"LOCAL TEST → {printer}");
    }

    private async Task RunAsync(CancellationToken ct)
    {
        var heartbeatAt=DateTimeOffset.MinValue;
        var configAt=DateTimeOffset.MinValue;
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var now=DateTimeOffset.UtcNow;
                var token=RequireToken();
                if (_config is null || now>=configAt)
                {
                    _config=await _client.GetConfigAsync(_settings.DeviceId,token,ct).ConfigureAwait(false);
                    SaveIdentity(_config);
                    ConfigChanged?.Invoke(_config);
                    configAt=now.AddSeconds(10);
                }

                if (now>=heartbeatAt)
                {
                    var installed=_printerService.GetInstalledPrinters();
                    await _client.HeartbeatAsync(_settings.DeviceId,token,"online",Application.ProductVersion,new
                    {
                        installed_printers=installed,
                        staff_printer=_settings.StaffPrinterName,
                        kitchen_printer=_settings.KitchenPrinterName,
                        kitchen_transport=TryGetNetworkEndpoint("kitchen",out var h,out var p) ? "lan" : "windows",
                        kitchen_endpoint=!string.IsNullOrWhiteSpace(h) ? $"{h}:{p}" : null
                    },ct).ConfigureAwait(false);
                    heartbeatAt=now.AddSeconds(15);
                    ConnectionChanged?.Invoke(true,"Bridge online");
                }

                var mode=_config.Restaurant.OperatingMode;
                if (mode==BridgeModes.Legacy)
                {
                    ActivityChanged?.Invoke("Старата система е активна. SoulFlame queue е спрян.");
                }
                else
                {
                    var a=await ProcessDestinationAsync("staff",ct).ConfigureAwait(false);
                    var b=await ProcessDestinationAsync("kitchen",ct).ConfigureAwait(false);
                    if (!a && !b) ActivityChanged?.Invoke(mode==BridgeModes.TestNoPrint ? "TEST mode · чака test job" : "Bridge online · чака задачи");
                }
                await Task.Delay(900,ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (Exception e)
            {
                ConnectionChanged?.Invoke(false,"Няма връзка · retry след 5 s");
                ActivityChanged?.Invoke(e.Message);
                _log.Error(e.Message);
                await Task.Delay(TimeSpan.FromSeconds(5),ct).ConfigureAwait(false);
            }
        }
    }

    private async Task<bool> ProcessDestinationAsync(string destination,CancellationToken ct)
    {
        var mode=_config?.Restaurant.OperatingMode ?? BridgeModes.TestNoPrint;
        var simulate=mode==BridgeModes.TestNoPrint;
        var network=TryGetNetworkEndpoint(destination,out var host,out var port);
        var printer=GetPrinterName(destination);

        if (!simulate && !network && (string.IsNullOrWhiteSpace(printer) || !_printerService.IsPrinterAvailable(printer))) return false;

        var job=await _client.ClaimNextAsync(_settings.DeviceId,RequireToken(),destination,ct).ConfigureAwait(false);
        if (job is null) return false;
        var authoritative=job.OperatingMode;
        simulate=authoritative==BridgeModes.TestNoPrint;
        var physical=authoritative is BridgeModes.Parallel or BridgeModes.SoulFlame;

        try
        {
            if (!simulate && !physical) throw new InvalidOperationException("[SAFE_NO_OUTPUT] Невалиден operating mode.");
            await _client.AckAsync(_settings.DeviceId,RequireToken(),job.Id,"preparing",cancellationToken:ct).ConfigureAwait(false);
            var receipt=ReceiptFormatter.Format(job,_config?.Restaurant.Name ?? _settings.RestaurantName);

            if (simulate)
            {
                await _client.AckAsync(_settings.DeviceId,RequireToken(),job.Id,"printed",metadata:new { simulated=true,no_physical_output=true,operating_mode=authoritative,destination },cancellationToken:ct).ConfigureAwait(false);
                return true;
            }

            await _client.AckAsync(_settings.DeviceId,RequireToken(),job.Id,"printing",cancellationToken:ct).ConfigureAwait(false);
            object metadata;
            if (network)
            {
                await _networkPrinterService.PrintReceiptAsync(host,port,receipt,$"SoulFlame {job.JobType}",ct).ConfigureAwait(false);
                metadata=new { network_printer=$"{host}:{port}",operating_mode=authoritative,destination };
            }
            else
            {
                if (string.IsNullOrWhiteSpace(printer)) throw new InvalidOperationException("[SAFE_NO_OUTPUT] Няма избран Windows принтер.");
                await _printerService.PrintReceiptAsync(printer,receipt,$"SoulFlame {job.JobType}",ct).ConfigureAwait(false);
                metadata=new { windows_printer=printer,operating_mode=authoritative,destination };
            }

            await _client.AckAsync(_settings.DeviceId,RequireToken(),job.Id,"printed",metadata:metadata,cancellationToken:ct).ConfigureAwait(false);
            ActivityChanged?.Invoke($"✓ {job.JobType.ToUpperInvariant()} → {(network ? $"{host}:{port}" : printer)}");
            return true;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception e)
        {
            var ambiguous=physical && e is PrinterDeliveryException delivery && delivery.MayHaveProducedOutput;
            var retry=!ambiguous && job.Attempts<job.MaxAttempts;
            try
            {
                await _client.AckAsync(_settings.DeviceId,RequireToken(),job.Id,retry?"retrying":"failed",e.Message,new
                {
                    output=network ? $"{host}:{port}" : printer,
                    operating_mode=authoritative,
                    no_physical_output=simulate || !physical,
                    ambiguous_physical_output=ambiguous,
                    auto_retry=retry
                },CancellationToken.None).ConfigureAwait(false);
            }
            catch (Exception ackError) { _log.Error($"ACK error: {ackError.Message}"); }
            _log.Error(e.Message);
            return false;
        }
    }

    private bool TryGetNetworkEndpoint(string destination,out string host,out int port)
    {
        host=string.Empty; port=0;
        if (!destination.Equals("kitchen",StringComparison.OrdinalIgnoreCase)) return false;
        var definition=_config?.Printers.FirstOrDefault(p=>p.Active && p.Destination.Equals("kitchen",StringComparison.OrdinalIgnoreCase) && string.Equals(p.ConnectionType,"lan",StringComparison.OrdinalIgnoreCase));
        var endpoint=definition?.ConnectionValue;
        if (string.IsNullOrWhiteSpace(endpoint)) return false;
        var value=endpoint.Trim();
        var split=value.LastIndexOf(':');
        if (split<=0 || split>=value.Length-1) return false;
        host=value[..split].Trim().Trim('[',']');
        if (string.IsNullOrWhiteSpace(host) || !int.TryParse(value[(split+1)..],out port) || port<=0 || port>65535) { host=string.Empty; port=0; return false; }
        return true;
    }

    private string? GetPrinterName(string destination) => destination=="kitchen" ? _settings.KitchenPrinterName : _settings.StaffPrinterName;

    private string RequireToken()
    {
        var token=_settingsStore.GetDeviceToken(_settings);
        if (string.IsNullOrWhiteSpace(token)) throw new InvalidOperationException("Bridge не е свързан. Въведи pairing code.");
        return token;
    }

    private void SaveIdentity(BridgeConfig config)
    {
        _settings.RestaurantCode=config.Restaurant.Code;
        _settings.RestaurantName=config.Restaurant.Name;
        _settingsStore.Save(_settings);
    }
}
