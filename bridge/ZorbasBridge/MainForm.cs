using System.Diagnostics;

namespace SoulFlame.ZorbasBridge;

internal sealed class MainForm : Form
{
    private readonly SettingsStore _settingsStore;
    private readonly BridgeSettings _settings;
    private readonly BridgeLog _log;
    private readonly SupabaseBridgeClient _client;
    private readonly WindowsPrinterService _printerService;
    private readonly BridgeEngine _engine;

    private readonly Label _restaurantLabel = new();
    private readonly Label _connectionLabel = new();
    private readonly Label _activityLabel = new();
    private readonly TextBox _codeTextBox = new();
    private readonly Button _pairButton = new();
    private readonly ComboBox _staffPrinterCombo = new();
    private readonly ComboBox _kitchenPrinterCombo = new();
    private readonly ComboBox _modeCombo = new();
    private readonly Button _startButton = new();
    private readonly Button _stopButton = new();
    private readonly RichTextBox _logBox = new();
    private readonly NotifyIcon _notifyIcon = new();

    private bool _allowExit;
    private bool _bootCompleted;

    public MainForm()
    {
        _settingsStore = new SettingsStore();
        _settings = _settingsStore.Load();
        _log = new BridgeLog(_settingsStore.DirectoryPath);
        _client = new SupabaseBridgeClient();
        _printerService = new WindowsPrinterService();
        _engine = new BridgeEngine(_settings, _settingsStore, _client, _printerService, _log);

        Text = "Zorbas Bridge by SoulFlame";
        Width = 920;
        Height = 720;
        MinimumSize = new Size(760, 620);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(10, 15, 24);
        ForeColor = Color.WhiteSmoke;
        Font = new Font("Segoe UI", 10f, FontStyle.Regular, GraphicsUnit.Point);

        BuildInterface();
        ConfigureTrayIcon();
        WireEvents();
    }

    protected override async void OnShown(EventArgs e)
    {
        base.OnShown(e);
        if (_bootCompleted) return;
        _bootCompleted = true;

        RefreshPrinterLists();
        _codeTextBox.Text = _settings.RestaurantCode;
        UpdateIdentityLabels();

        if (_settings.IsPaired && !string.IsNullOrWhiteSpace(_settingsStore.GetDeviceToken(_settings)))
        {
            await StartEngineSafeAsync();
            if (_settings.StartMinimized) HideToTray(showBalloon: false);
        }
        else
        {
            SetConnection(false, "Въведи кода sf-zorbas, за да свържеш компютъра.");
        }
    }

    private void BuildInterface()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(18),
            ColumnCount = 1,
            RowCount = 7,
            BackColor = BackColor
        };
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        Controls.Add(root);

        root.Controls.Add(BuildHeader(), 0, 0);
        root.Controls.Add(BuildStatusStrip(), 0, 1);
        root.Controls.Add(BuildPairingGroup(), 0, 2);
        root.Controls.Add(BuildPrinterGroup(), 0, 3);
        root.Controls.Add(BuildModeGroup(), 0, 4);
        root.Controls.Add(BuildLogGroup(), 0, 5);
        root.Controls.Add(BuildFooter(), 0, 6);
    }

    private Control BuildHeader()
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            ColumnCount = 2,
            BackColor = Color.Transparent,
            Margin = new Padding(0, 0, 0, 12)
        };
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

        var titlePanel = new FlowLayoutPanel
        {
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            BackColor = Color.Transparent,
            Margin = Padding.Empty
        };
        titlePanel.Controls.Add(new Label
        {
            AutoSize = true,
            Text = "ZORBAS BRIDGE",
            Font = new Font(Font.FontFamily, 19f, FontStyle.Bold),
            ForeColor = Color.White
        });
        titlePanel.Controls.Add(new Label
        {
            AutoSize = true,
            Text = "Powered by SoulFlame Restaurant OS",
            ForeColor = Color.FromArgb(162, 174, 194)
        });

        var version = new Label
        {
            AutoSize = true,
            Text = $"v{Application.ProductVersion}",
            ForeColor = Color.FromArgb(135, 220, 170),
            Padding = new Padding(12, 9, 12, 9),
            BackColor = Color.FromArgb(22, 54, 41),
            Anchor = AnchorStyles.Top | AnchorStyles.Right
        };

        panel.Controls.Add(titlePanel, 0, 0);
        panel.Controls.Add(version, 1, 0);
        return panel;
    }

    private Control BuildStatusStrip()
    {
        var panel = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            ColumnCount = 3,
            Padding = new Padding(12),
            BackColor = Color.FromArgb(19, 27, 41),
            Margin = new Padding(0, 0, 0, 12)
        };
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 38));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 26));
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 36));

        _restaurantLabel.AutoSize = true;
        _restaurantLabel.Text = "Ресторант: —";
        _restaurantLabel.ForeColor = Color.White;

        _connectionLabel.AutoSize = true;
        _connectionLabel.Text = "● Офлайн";
        _connectionLabel.ForeColor = Color.FromArgb(255, 145, 145);

        _activityLabel.AutoSize = true;
        _activityLabel.Text = "Очаква свързване";
        _activityLabel.ForeColor = Color.FromArgb(174, 188, 210);

        panel.Controls.Add(_restaurantLabel, 0, 0);
        panel.Controls.Add(_connectionLabel, 1, 0);
        panel.Controls.Add(_activityLabel, 2, 0);
        return panel;
    }

    private Control BuildPairingGroup()
    {
        var group = CreateGroup("1. Свързване на този компютър");
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            ColumnCount = 4,
            Padding = new Padding(10)
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

        layout.Controls.Add(CreateFieldLabel("Код на ресторанта"), 0, 0);
        ConfigureTextBox(_codeTextBox);
        _codeTextBox.PlaceholderText = "sf-zorbas";
        layout.Controls.Add(_codeTextBox, 1, 0);

        ConfigureButton(_pairButton, "СВЪРЖИ", Color.FromArgb(32, 115, 78));
        layout.Controls.Add(_pairButton, 2, 0);

        var resetButton = CreateButton("Ново свързване", Color.FromArgb(67, 75, 92));
        resetButton.Click += async (_, _) => await ResetPairingAsync();
        layout.Controls.Add(resetButton, 3, 0);

        var hint = new Label
        {
            AutoSize = true,
            Text = "Кодът регистрира компютъра само към избрания ресторант. Устройственият токен се пази криптирано за текущия Windows потребител.",
            ForeColor = Color.FromArgb(145, 160, 183),
            MaximumSize = new Size(760, 0),
            Margin = new Padding(3, 8, 3, 0)
        };
        layout.SetColumnSpan(hint, 4);
        layout.Controls.Add(hint, 0, 1);
        group.Controls.Add(layout);
        return group;
    }

    private Control BuildPrinterGroup()
    {
        var group = CreateGroup("2. Физически принтери");
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            ColumnCount = 3,
            RowCount = 3,
            Padding = new Padding(10)
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

        layout.Controls.Add(CreateFieldLabel("Print 1 · Сервитьори"), 0, 0);
        ConfigurePrinterCombo(_staffPrinterCombo);
        layout.Controls.Add(_staffPrinterCombo, 1, 0);
        var testStaff = CreateButton("ТЕСТ PRINT 1", Color.FromArgb(51, 93, 145));
        testStaff.Click += async (_, _) => await PrintTestSafeAsync("staff");
        layout.Controls.Add(testStaff, 2, 0);

        layout.Controls.Add(CreateFieldLabel("Print 2 · Кухня"), 0, 1);
        ConfigurePrinterCombo(_kitchenPrinterCombo);
        layout.Controls.Add(_kitchenPrinterCombo, 1, 1);
        var testKitchen = CreateButton("ТЕСТ PRINT 2", Color.FromArgb(51, 93, 145));
        testKitchen.Click += async (_, _) => await PrintTestSafeAsync("kitchen");
        layout.Controls.Add(testKitchen, 2, 1);

        var refreshButton = CreateButton("Обнови списъка с Windows принтери", Color.FromArgb(67, 75, 92));
        refreshButton.Click += (_, _) => RefreshPrinterLists();
        layout.SetColumnSpan(refreshButton, 3);
        layout.Controls.Add(refreshButton, 0, 2);

        group.Controls.Add(layout);
        return group;
    }

    private Control BuildModeGroup()
    {
        var group = CreateGroup("3. Режим и безопасно връщане");
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            AutoSize = true,
            ColumnCount = 4,
            Padding = new Padding(10)
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

        layout.Controls.Add(CreateFieldLabel("Режим"), 0, 0);
        _modeCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        _modeCombo.Dock = DockStyle.Fill;
        _modeCombo.BackColor = Color.FromArgb(31, 40, 56);
        _modeCombo.ForeColor = Color.White;
        _modeCombo.Items.AddRange(BridgeModes.Options.Cast<object>().ToArray());
        _modeCombo.SelectedIndex = 1;
        layout.Controls.Add(_modeCombo, 1, 0);

        var applyButton = CreateButton("ПРИЛОЖИ", Color.FromArgb(32, 115, 78));
        applyButton.Click += async (_, _) => await ApplyModeSafeAsync();
        layout.Controls.Add(applyButton, 2, 0);

        var fallbackButton = CreateButton("ВЪРНИ СТАРАТА СИСТЕМА", Color.FromArgb(150, 48, 48));
        fallbackButton.Click += async (_, _) => await ActivateLegacySafeAsync();
        layout.Controls.Add(fallbackButton, 3, 0);

        var note = new Label
        {
            AutoSize = true,
            MaximumSize = new Size(760, 0),
            Text = "„Тест без печат“ не взема задачи. „Паралелен тест“ и „SoulFlame система“ печатат. „Стара система“ незабавно спира новото вземане на бележки.",
            ForeColor = Color.FromArgb(145, 160, 183),
            Margin = new Padding(3, 8, 3, 0)
        };
        layout.SetColumnSpan(note, 4);
        layout.Controls.Add(note, 0, 1);

        group.Controls.Add(layout);
        return group;
    }

    private Control BuildLogGroup()
    {
        var group = CreateGroup("Диагностика");
        _logBox.Dock = DockStyle.Fill;
        _logBox.ReadOnly = true;
        _logBox.BackColor = Color.FromArgb(7, 11, 18);
        _logBox.ForeColor = Color.FromArgb(190, 211, 199);
        _logBox.BorderStyle = BorderStyle.None;
        _logBox.Font = new Font(FontFamily.GenericMonospace, 8.5f);
        _logBox.WordWrap = false;
        group.Controls.Add(_logBox);
        return group;
    }

    private Control BuildFooter()
    {
        var panel = new FlowLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = true,
            Margin = new Padding(0, 10, 0, 0)
        };

        ConfigureButton(_startButton, "СТАРТИРАЙ BRIDGE", Color.FromArgb(32, 115, 78));
        ConfigureButton(_stopButton, "СПРИ BRIDGE", Color.FromArgb(129, 80, 37));
        panel.Controls.Add(_startButton);
        panel.Controls.Add(_stopButton);

        var openSite = CreateButton("Отвори Zorbas", Color.FromArgb(51, 93, 145));
        openSite.Click += (_, _) => OpenUrl("https://zorbas-seven.vercel.app/");
        panel.Controls.Add(openSite);

        var openPrint = CreateButton("Отвори Print Center", Color.FromArgb(51, 93, 145));
        openPrint.Click += (_, _) => OpenUrl("https://zorbas-seven.vercel.app/print.html");
        panel.Controls.Add(openPrint);

        var openLogs = CreateButton("Отвори логовете", Color.FromArgb(67, 75, 92));
        openLogs.Click += (_, _) => OpenFolder(Path.Combine(_settingsStore.DirectoryPath, "logs"));
        panel.Controls.Add(openLogs);

        var hideButton = CreateButton("Скрий до часовника", Color.FromArgb(67, 75, 92));
        hideButton.Click += (_, _) => HideToTray(showBalloon: true);
        panel.Controls.Add(hideButton);

        return panel;
    }

    private void WireEvents()
    {
        _pairButton.Click += async (_, _) => await PairSafeAsync();
        _startButton.Click += async (_, _) => await StartEngineSafeAsync();
        _stopButton.Click += async (_, _) => await StopEngineSafeAsync();

        _staffPrinterCombo.SelectedIndexChanged += (_, _) => SavePrinterMappings();
        _kitchenPrinterCombo.SelectedIndexChanged += (_, _) => SavePrinterMappings();

        _engine.ConnectionChanged += (online, message) => Ui(() => SetConnection(online, message));
        _engine.ActivityChanged += message => Ui(() => _activityLabel.Text = message);
        _engine.ConfigChanged += config => Ui(() => ApplyConfig(config));
        _log.LineWritten += line => Ui(() => AppendLog(line));

        Resize += (_, _) =>
        {
            if (WindowState == FormWindowState.Minimized) HideToTray(showBalloon: false);
        };

        FormClosing += (_, eventArgs) =>
        {
            if (_allowExit) return;
            eventArgs.Cancel = true;
            HideToTray(showBalloon: true);
        };
    }

    private void ConfigureTrayIcon()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("Отвори Zorbas Bridge", null, (_, _) => RestoreFromTray());
        menu.Items.Add("Върни старата система", null, async (_, _) => await ActivateLegacySafeAsync());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Изход", null, async (_, _) => await ExitApplicationAsync());

        _notifyIcon.Icon = SystemIcons.Application;
        _notifyIcon.Text = "Zorbas Bridge by SoulFlame";
        _notifyIcon.ContextMenuStrip = menu;
        _notifyIcon.Visible = true;
        _notifyIcon.DoubleClick += (_, _) => RestoreFromTray();
    }

    private async Task PairSafeAsync()
    {
        var code = _codeTextBox.Text.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(code))
        {
            ShowError("Въведи ресторантски код.");
            return;
        }

        _pairButton.Enabled = false;
        _pairButton.Text = "СВЪРЗВАНЕ…";
        try
        {
            await _engine.StopAsync();
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
            var response = await _client.PairAsync(
                code,
                _settings.DeviceId,
                Environment.MachineName,
                Application.ProductVersion,
                timeout.Token);

            if (!response.Ok || string.IsNullOrWhiteSpace(response.DeviceToken))
            {
                throw new InvalidOperationException("SoulFlame не върна валиден устройствен токен.");
            }

            _settings.RestaurantCode = response.RestaurantCode;
            _settings.RestaurantName = response.RestaurantName;
            _settingsStore.SetDeviceToken(_settings, response.DeviceToken);
            _settingsStore.Save(_settings);
            UpdateIdentityLabels();
            _log.Info($"Компютърът е свързан към {response.RestaurantName} с код {response.RestaurantCode}.");
            await StartEngineSafeAsync();
        }
        catch (Exception error)
        {
            _log.Error($"Свързването се провали: {error.Message}");
            ShowError(error.Message);
        }
        finally
        {
            _pairButton.Enabled = true;
            _pairButton.Text = "СВЪРЖИ";
        }
    }

    private async Task StartEngineSafeAsync()
    {
        SavePrinterMappings();
        if (!_settings.IsPaired || string.IsNullOrWhiteSpace(_settingsStore.GetDeviceToken(_settings)))
        {
            ShowError("Първо свържи компютъра с ресторантския код.");
            return;
        }

        _startButton.Enabled = false;
        try
        {
            await _engine.StartAsync();
            _stopButton.Enabled = true;
        }
        catch (Exception error)
        {
            SetConnection(false, error.Message);
            _log.Error(error.Message);
            ShowError(error.Message);
        }
        finally
        {
            _startButton.Enabled = true;
        }
    }

    private async Task StopEngineSafeAsync()
    {
        _stopButton.Enabled = false;
        try { await _engine.StopAsync(); }
        finally { _stopButton.Enabled = true; }
    }

    private async Task PrintTestSafeAsync(string destination)
    {
        SavePrinterMappings();
        try
        {
            await _engine.PrintTestAsync(destination);
            _log.Info($"Тестът за {(destination == "kitchen" ? "Print 2" : "Print 1")} е приет от Windows spooler.");
            MessageBox.Show(
                "Тестовата бележка е изпратена към Windows принтера.",
                "Zorbas Bridge",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception error)
        {
            _log.Error(error.Message);
            ShowError(error.Message);
        }
    }

    private async Task ApplyModeSafeAsync()
    {
        if (_modeCombo.SelectedItem is not ModeOption option) return;
        try
        {
            await _engine.SetOperatingModeAsync(option.Value);
            ApplyModeSelection(option.Value);
        }
        catch (Exception error)
        {
            _log.Error(error.Message);
            ShowError(error.Message);
        }
    }

    private async Task ActivateLegacySafeAsync()
    {
        var result = MessageBox.Show(
            "Това спира новия SoulFlame печат. Старата система и чакащите задачи не се изтриват. Продължаваме ли?",
            "Върни старата система",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Warning);
        if (result != DialogResult.Yes) return;

        try
        {
            await _engine.SetOperatingModeAsync(BridgeModes.Legacy);
            ApplyModeSelection(BridgeModes.Legacy);
            _activityLabel.Text = "Старата система е активна.";
        }
        catch (Exception error)
        {
            _log.Error(error.Message);
            ShowError(error.Message);
        }
    }

    private async Task ResetPairingAsync()
    {
        var result = MessageBox.Show(
            "Да се премахне ли връзката на този Windows потребител с ресторанта?",
            "Ново свързване",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Question);
        if (result != DialogResult.Yes) return;

        await _engine.StopAsync();
        _settingsStore.ClearPairing(_settings);
        _codeTextBox.Clear();
        UpdateIdentityLabels();
        SetConnection(false, "Въведи нов ресторантски код.");
        _log.Warning("Локалното Bridge свързване е премахнато.");
    }

    private void RefreshPrinterLists()
    {
        var printers = _printerService.GetInstalledPrinters();
        FillPrinterCombo(_staffPrinterCombo, printers, _settings.StaffPrinterName);
        FillPrinterCombo(_kitchenPrinterCombo, printers, _settings.KitchenPrinterName);
        _log.Info($"Открити Windows принтери: {printers.Count}.");
    }

    private static void FillPrinterCombo(ComboBox combo, IReadOnlyList<string> printers, string selected)
    {
        combo.BeginUpdate();
        combo.Items.Clear();
        foreach (var printer in printers) combo.Items.Add(printer);
        if (!string.IsNullOrWhiteSpace(selected) && combo.Items.Contains(selected)) combo.SelectedItem = selected;
        else if (combo.Items.Count == 1) combo.SelectedIndex = 0;
        combo.EndUpdate();
    }

    private void SavePrinterMappings()
    {
        _settings.StaffPrinterName = _staffPrinterCombo.SelectedItem?.ToString() ?? string.Empty;
        _settings.KitchenPrinterName = _kitchenPrinterCombo.SelectedItem?.ToString() ?? string.Empty;
        _settingsStore.Save(_settings);
    }

    private void ApplyConfig(BridgeConfig config)
    {
        _settings.RestaurantCode = config.Restaurant.Code;
        _settings.RestaurantName = config.Restaurant.Name;
        _settingsStore.Save(_settings);
        UpdateIdentityLabels();
        ApplyModeSelection(config.Restaurant.OperatingMode);
        _activityLabel.Text = BridgeModes.ProcessesQueue(config.Restaurant.OperatingMode)
            ? "Опашката Print 1 / Print 2 е активна."
            : config.Restaurant.OperatingMode == BridgeModes.Legacy
                ? "Старата система е активна."
                : "Тест без печат.";
    }

    private void ApplyModeSelection(string mode)
    {
        var option = BridgeModes.Options.FirstOrDefault(item => item.Value == mode);
        if (option is not null) _modeCombo.SelectedItem = option;
    }

    private void UpdateIdentityLabels()
    {
        _restaurantLabel.Text = string.IsNullOrWhiteSpace(_settings.RestaurantName)
            ? "Ресторант: —"
            : $"Ресторант: {_settings.RestaurantName} ({_settings.RestaurantCode})";
    }

    private void SetConnection(bool online, string message)
    {
        _connectionLabel.Text = online ? "● Онлайн" : "● Офлайн";
        _connectionLabel.ForeColor = online
            ? Color.FromArgb(105, 225, 150)
            : Color.FromArgb(255, 145, 145);
        _activityLabel.Text = message;
    }

    private void AppendLog(string line)
    {
        if (_logBox.TextLength > 120_000)
        {
            _logBox.Select(0, 40_000);
            _logBox.SelectedText = string.Empty;
        }
        _logBox.AppendText(line + Environment.NewLine);
        _logBox.SelectionStart = _logBox.TextLength;
        _logBox.ScrollToCaret();
    }

    private void HideToTray(bool showBalloon)
    {
        Hide();
        ShowInTaskbar = false;
        if (!showBalloon) return;
        _notifyIcon.BalloonTipTitle = "Zorbas Bridge работи";
        _notifyIcon.BalloonTipText = "Печатният мост продължава да работи до часовника.";
        _notifyIcon.ShowBalloonTip(2500);
    }

    private void RestoreFromTray()
    {
        ShowInTaskbar = true;
        Show();
        WindowState = FormWindowState.Normal;
        Activate();
    }

    private async Task ExitApplicationAsync()
    {
        _allowExit = true;
        await _engine.StopAsync();
        _notifyIcon.Visible = false;
        Close();
    }

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
        _client.Dispose();
        _engine.DisposeAsync().AsTask().GetAwaiter().GetResult();
        base.OnFormClosed(e);
    }

    private static GroupBox CreateGroup(string title) => new()
    {
        Text = title,
        Dock = DockStyle.Fill,
        AutoSize = false,
        Height = 106,
        ForeColor = Color.FromArgb(215, 225, 239),
        BackColor = Color.FromArgb(15, 22, 34),
        Padding = new Padding(8),
        Margin = new Padding(0, 0, 0, 10)
    };

    private static Label CreateFieldLabel(string text) => new()
    {
        Text = text,
        AutoSize = true,
        Anchor = AnchorStyles.Left,
        ForeColor = Color.FromArgb(183, 195, 214),
        Margin = new Padding(0, 8, 12, 8)
    };

    private static void ConfigureTextBox(TextBox textBox)
    {
        textBox.Dock = DockStyle.Fill;
        textBox.BackColor = Color.FromArgb(31, 40, 56);
        textBox.ForeColor = Color.White;
        textBox.BorderStyle = BorderStyle.FixedSingle;
        textBox.Margin = new Padding(0, 4, 10, 4);
    }

    private static void ConfigurePrinterCombo(ComboBox combo)
    {
        combo.DropDownStyle = ComboBoxStyle.DropDownList;
        combo.Dock = DockStyle.Fill;
        combo.BackColor = Color.FromArgb(31, 40, 56);
        combo.ForeColor = Color.White;
        combo.Margin = new Padding(0, 4, 10, 4);
    }

    private static Button CreateButton(string text, Color color)
    {
        var button = new Button();
        ConfigureButton(button, text, color);
        return button;
    }

    private static void ConfigureButton(Button button, string text, Color color)
    {
        button.Text = text;
        button.AutoSize = true;
        button.MinimumSize = new Size(110, 36);
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderSize = 0;
        button.BackColor = color;
        button.ForeColor = Color.White;
        button.Cursor = Cursors.Hand;
        button.Margin = new Padding(4);
    }

    private void Ui(Action action)
    {
        if (IsDisposed || Disposing) return;
        if (InvokeRequired)
        {
            try { BeginInvoke(action); } catch { }
            return;
        }
        action();
    }

    private static void ShowError(string message) =>
        MessageBox.Show(message, "Zorbas Bridge", MessageBoxButtons.OK, MessageBoxIcon.Error);

    private static void OpenUrl(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception error) { ShowError(error.Message); }
    }

    private static void OpenFolder(string path)
    {
        try
        {
            Directory.CreateDirectory(path);
            Process.Start(new ProcessStartInfo("explorer.exe", path) { UseShellExecute = true });
        }
        catch (Exception error) { ShowError(error.Message); }
    }
}
