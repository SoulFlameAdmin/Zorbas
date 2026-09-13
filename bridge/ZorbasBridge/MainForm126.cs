using System.Diagnostics;

namespace SoulFlame.ZorbasBridge;

internal sealed class MainForm : Form
{
    private const string BorkoTestUrl = "https://soulflame-twins.vercel.app/frontend/FRONTEND/restaurant-os/borko-test.html";
    private const string RestaurantOsUrl = "https://soulflame-twins.vercel.app/frontend/FRONTEND/restaurant-os/dashboard.html";

    private readonly SettingsStore _store = new();
    private readonly BridgeSettings _settings;
    private readonly BridgeLog _log;
    private readonly SupabaseBridgeClient _client = new();
    private readonly WindowsPrinterService _printers = new();
    private readonly BridgeEngine _engine;

    private readonly Label _restaurant = new();
    private readonly Label _connection = new();
    private readonly Label _activity = new();
    private readonly TextBox _code = new();
    private readonly ComboBox _staff = new();
    private readonly ComboBox _kitchen = new();
    private readonly Button _pair = new();
    private readonly Button _start = new();
    private readonly Button _stop = new();
    private readonly RichTextBox _logBox = new();
    private readonly NotifyIcon _tray = new();
    private bool _allowExit;
    private bool _booted;

    public MainForm()
    {
        _settings = _store.Load();
        _log = new BridgeLog(_store.DirectoryPath);
        _engine = new BridgeEngine(_settings,_store,_client,_printers,_log);

        Text = "SoulFlame Restaurant Bridge";
        Width = 900; Height = 700; MinimumSize = new Size(760,600);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(9,15,25); ForeColor = Color.WhiteSmoke;
        Font = new Font("Segoe UI",10f);

        BuildUi();
        BuildTray();
        Wire();
    }

    protected override async void OnShown(EventArgs e)
    {
        base.OnShown(e);
        if (_booted) return; _booted=true;
        RefreshPrinters();
        _code.Text=_settings.RestaurantCode;
        UpdateIdentity();
        if (_settings.IsPaired && !string.IsNullOrWhiteSpace(_store.GetDeviceToken(_settings)))
        {
            await StartSafe();
            if (_settings.StartMinimized) HideToTray(false);
        }
        else SetConnection(false,"Въведи pairing code от Restaurant OS.");
    }

    private void BuildUi()
    {
        var root=new TableLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(18),ColumnCount=1,RowCount=7,BackColor=BackColor};
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        root.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        Controls.Add(root);

        var title=new Label{AutoSize=true,Text="SOULFLAME RESTAURANT BRIDGE",Font=new Font(Font.FontFamily,19f,FontStyle.Bold),ForeColor=Color.White,Margin=new Padding(0,0,0,10)};
        root.Controls.Add(title,0,0);

        var status=new TableLayoutPanel{Dock=DockStyle.Top,AutoSize=true,ColumnCount=3,Padding=new Padding(12),BackColor=Color.FromArgb(19,27,41),Margin=new Padding(0,0,0,12)};
        status.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,40)); status.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,25)); status.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,35));
        _restaurant.AutoSize=true; _restaurant.Text="Ресторант: —";
        _connection.AutoSize=true; _connection.Text="● Офлайн"; _connection.ForeColor=Color.FromArgb(255,145,145);
        _activity.AutoSize=true; _activity.Text="Очаква pairing"; _activity.ForeColor=Color.FromArgb(174,188,210);
        status.Controls.Add(_restaurant,0,0); status.Controls.Add(_connection,1,0); status.Controls.Add(_activity,2,0);
        root.Controls.Add(status,0,1);

        var pairBox=Group("1. Pairing");
        var pairLayout=new TableLayoutPanel{Dock=DockStyle.Fill,AutoSize=true,ColumnCount=3,Padding=new Padding(10)};
        pairLayout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize)); pairLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100)); pairLayout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        pairLayout.Controls.Add(Field("Restaurant pairing code"),0,0);
        Input(_code); _code.PlaceholderText="sf-xxxxxxxxxxxx"; pairLayout.Controls.Add(_code,1,0);
        ButtonStyle(_pair,"СВЪРЖИ",Color.FromArgb(32,115,78)); pairLayout.Controls.Add(_pair,2,0);
        var hint=new Label{AutoSize=true,Text="Кодът свързва този Windows компютър само с конкретния Restaurant OS tenant.",ForeColor=Color.FromArgb(145,160,183),Margin=new Padding(3,8,3,0)};
        pairLayout.SetColumnSpan(hint,3); pairLayout.Controls.Add(hint,0,1); pairBox.Controls.Add(pairLayout); root.Controls.Add(pairBox,0,2);

        var printBox=Group("2. Windows принтери");
        var printLayout=new TableLayoutPanel{Dock=DockStyle.Fill,AutoSize=true,ColumnCount=3,RowCount=3,Padding=new Padding(10)};
        printLayout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize)); printLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100)); printLayout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        printLayout.Controls.Add(Field("Сервитьори"),0,0); Combo(_staff); printLayout.Controls.Add(_staff,1,0);
        var staffTest=Btn("LOCAL TEST",Color.FromArgb(51,93,145)); staffTest.Click+=async(_,_)=>await LocalTest("staff"); printLayout.Controls.Add(staffTest,2,0);
        printLayout.Controls.Add(Field("Кухня"),0,1); Combo(_kitchen); printLayout.Controls.Add(_kitchen,1,1);
        var kitchenTest=Btn("LOCAL TEST",Color.FromArgb(51,93,145)); kitchenTest.Click+=async(_,_)=>await LocalTest("kitchen"); printLayout.Controls.Add(kitchenTest,2,1);
        var refresh=Btn("Открий Windows принтерите наново",Color.FromArgb(67,75,92)); refresh.Click+=(_,_)=>RefreshPrinters(); printLayout.SetColumnSpan(refresh,3); printLayout.Controls.Add(refresh,0,2);
        printBox.Controls.Add(printLayout); root.Controls.Add(printBox,0,3);

        var actions=new FlowLayoutPanel{Dock=DockStyle.Top,AutoSize=true,WrapContents=true,Margin=new Padding(0,0,0,10)};
        ButtonStyle(_start,"СТАРТИРАЙ BRIDGE",Color.FromArgb(32,115,78)); ButtonStyle(_stop,"СПРИ BRIDGE",Color.FromArgb(129,80,37));
        var open=Btn("ОТВОРИ RESTAURANT OS",Color.FromArgb(51,93,145)); open.Click+=(_,_)=>OpenRestaurantOs();
        var legacy=Btn("ВЪРНИ СТАРАТА СИСТЕМА",Color.FromArgb(150,48,48)); legacy.Click+=async(_,_)=>await SetLegacy();
        actions.Controls.Add(_start); actions.Controls.Add(_stop); actions.Controls.Add(open); actions.Controls.Add(legacy); root.Controls.Add(actions,0,4);

        var logGroup=Group("Диагностика"); logGroup.Height=250; _logBox.Dock=DockStyle.Fill; _logBox.ReadOnly=true; _logBox.BackColor=Color.FromArgb(7,11,18); _logBox.ForeColor=Color.FromArgb(190,211,199); _logBox.BorderStyle=BorderStyle.None; _logBox.Font=new Font(FontFamily.GenericMonospace,8.5f); logGroup.Controls.Add(_logBox); root.Controls.Add(logGroup,0,5);

        var footer=new Label{AutoSize=true,Text=$"SoulFlame Restaurant Bridge v{Application.ProductVersion} · Fresh installs contain no restaurant/printer defaults.",ForeColor=Color.FromArgb(125,143,169)}; root.Controls.Add(footer,0,6);
    }

    private void Wire()
    {
        _pair.Click+=async(_,_)=>await PairSafe(); _start.Click+=async(_,_)=>await StartSafe(); _stop.Click+=async(_,_)=>await StopSafe();
        _staff.SelectedIndexChanged+=(_,_)=>SavePrinters(); _kitchen.SelectedIndexChanged+=(_,_)=>SavePrinters();
        _engine.ConnectionChanged+=(online,message)=>Ui(()=>SetConnection(online,message));
        _engine.ActivityChanged+=message=>Ui(()=>_activity.Text=message);
        _engine.ConfigChanged+=config=>Ui(()=>{_settings.RestaurantCode=config.Restaurant.Code;_settings.RestaurantName=config.Restaurant.Name;_store.Save(_settings);UpdateIdentity();});
        _log.LineWritten+=line=>Ui(()=>{_logBox.AppendText(line+Environment.NewLine);_logBox.SelectionStart=_logBox.TextLength;_logBox.ScrollToCaret();});
        Resize+=(_,_)=>{if(WindowState==FormWindowState.Minimized)HideToTray(false);};
        FormClosing+=(_,e)=>{if(!_allowExit){e.Cancel=true;HideToTray(true);}};
    }

    private async Task PairSafe()
    {
        var code=_code.Text.Trim().ToLowerInvariant(); if(string.IsNullOrWhiteSpace(code)){Error("Въведи pairing code.");return;}
        _pair.Enabled=false;
        try
        {
            await _engine.StopAsync();
            using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(20));
            var result=await _client.PairAsync(code,_settings.DeviceId,Environment.MachineName,Application.ProductVersion,timeout.Token);
            if(!result.Ok||string.IsNullOrWhiteSpace(result.DeviceToken))throw new InvalidOperationException("Pairing failed.");
            _settings.RestaurantCode=result.RestaurantCode;_settings.RestaurantName=result.RestaurantName;_store.SetDeviceToken(_settings,result.DeviceToken);_store.Save(_settings);UpdateIdentity();
            _log.Info($"Paired → {result.RestaurantName} ({result.RestaurantCode})"); await StartSafe();
        }
        catch(Exception ex){_log.Error(ex.Message);Error(ex.Message);} finally{_pair.Enabled=true;}
    }

    private async Task StartSafe()
    {
        SavePrinters();
        if(!_settings.IsPaired||string.IsNullOrWhiteSpace(_store.GetDeviceToken(_settings))){Error("Първо свържи Restaurant OS pairing code.");return;}
        try{await _engine.StartAsync();}catch(Exception ex){_log.Error(ex.Message);Error(ex.Message);}
    }

    private async Task StopSafe(){try{await _engine.StopAsync();}catch(Exception ex){_log.Error(ex.Message);}}

    private async Task LocalTest(string destination)
    {
        SavePrinters();
        try{await _engine.PrintTestAsync(destination);MessageBox.Show("TEST е изпратен към избрания физически принтер.","SoulFlame Restaurant Bridge",MessageBoxButtons.OK,MessageBoxIcon.Information);}
        catch(Exception ex){_log.Error(ex.Message);Error(ex.Message);}
    }

    private async Task SetLegacy()
    {
        if(MessageBox.Show("Да спрем ли SoulFlame queue и да върнем legacy mode?","Legacy mode",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return;
        try{await _engine.SetOperatingModeAsync(BridgeModes.Legacy);_activity.Text="Legacy mode е активен.";}catch(Exception ex){Error(ex.Message);}
    }

    private void RefreshPrinters()
    {
        var list=_printers.GetInstalledPrinters(); Fill(_staff,list,_settings.StaffPrinterName); Fill(_kitchen,list,_settings.KitchenPrinterName); _log.Info($"Открити Windows принтери: {list.Count}");
    }

    private static void Fill(ComboBox combo,IReadOnlyList<string> list,string selected)
    {
        combo.BeginUpdate();combo.Items.Clear();foreach(var p in list)combo.Items.Add(p);if(!string.IsNullOrWhiteSpace(selected)&&combo.Items.Contains(selected))combo.SelectedItem=selected;else if(combo.Items.Count==1)combo.SelectedIndex=0;combo.EndUpdate();
    }

    private void SavePrinters(){_settings.StaffPrinterName=_staff.SelectedItem?.ToString()??string.Empty;_settings.KitchenPrinterName=_kitchen.SelectedItem?.ToString()??string.Empty;_store.Save(_settings);}
    private void UpdateIdentity(){_restaurant.Text=string.IsNullOrWhiteSpace(_settings.RestaurantName)?"Ресторант: —":$"Ресторант: {_settings.RestaurantName} ({_settings.RestaurantCode})";}
    private void SetConnection(bool online,string message){_connection.Text=online?"● Онлайн":"● Офлайн";_connection.ForeColor=online?Color.FromArgb(105,225,150):Color.FromArgb(255,145,145);_activity.Text=message;}

    private void OpenRestaurantOs()
    {
        var url=_settings.RestaurantCode=="sf-borko-test"?BorkoTestUrl:$"{RestaurantOsUrl}?restaurant={Uri.EscapeDataString(_settings.RestaurantCode)}";
        try{Process.Start(new ProcessStartInfo(url){UseShellExecute=true});}catch(Exception ex){Error(ex.Message);}
    }

    private void BuildTray()
    {
        var menu=new ContextMenuStrip();menu.Items.Add("Отвори",null,(_,_)=>Restore());menu.Items.Add("Изход",null,async(_,_)=>{_allowExit=true;await _engine.StopAsync();_tray.Visible=false;Close();});
        _tray.Icon=SystemIcons.Application;_tray.Text="SoulFlame Restaurant Bridge";_tray.ContextMenuStrip=menu;_tray.Visible=true;_tray.DoubleClick+=(_,_)=>Restore();
    }
    private void HideToTray(bool balloon){Hide();ShowInTaskbar=false;if(balloon){_tray.BalloonTipTitle="SoulFlame Bridge работи";_tray.BalloonTipText="Bridge продължава да слуша за Restaurant OS задачи.";_tray.ShowBalloonTip(2200);}}
    private void Restore(){ShowInTaskbar=true;Show();WindowState=FormWindowState.Normal;Activate();}
    protected override void OnFormClosed(FormClosedEventArgs e){_tray.Visible=false;_tray.Dispose();_client.Dispose();_engine.DisposeAsync().AsTask().GetAwaiter().GetResult();base.OnFormClosed(e);}

    private static GroupBox Group(string title)=>new(){Text=title,Dock=DockStyle.Fill,Height=112,ForeColor=Color.FromArgb(215,225,239),BackColor=Color.FromArgb(15,22,34),Padding=new Padding(8),Margin=new Padding(0,0,0,10)};
    private static Label Field(string text)=>new(){Text=text,AutoSize=true,Anchor=AnchorStyles.Left,ForeColor=Color.FromArgb(183,195,214),Margin=new Padding(0,8,12,8)};
    private static void Input(TextBox box){box.Dock=DockStyle.Fill;box.BackColor=Color.FromArgb(31,40,56);box.ForeColor=Color.White;box.BorderStyle=BorderStyle.FixedSingle;box.Margin=new Padding(0,4,10,4);}
    private static void Combo(ComboBox combo){combo.DropDownStyle=ComboBoxStyle.DropDownList;combo.Dock=DockStyle.Fill;combo.BackColor=Color.FromArgb(31,40,56);combo.ForeColor=Color.White;combo.Margin=new Padding(0,4,10,4);}
    private static Button Btn(string text,Color color){var b=new Button();ButtonStyle(b,text,color);return b;}
    private static void ButtonStyle(Button b,string text,Color color){b.Text=text;b.AutoSize=true;b.MinimumSize=new Size(110,36);b.FlatStyle=FlatStyle.Flat;b.FlatAppearance.BorderSize=0;b.BackColor=color;b.ForeColor=Color.White;b.Cursor=Cursors.Hand;b.Margin=new Padding(4);}
    private void Ui(Action a){if(IsDisposed||Disposing)return;if(InvokeRequired){try{BeginInvoke(a);}catch{}return;}a();}
    private static void Error(string message)=>MessageBox.Show(message,"SoulFlame Restaurant Bridge",MessageBoxButtons.OK,MessageBoxIcon.Error);
}
