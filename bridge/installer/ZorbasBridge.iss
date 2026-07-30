#define MyAppName "Zorbas Bridge"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "SoulFlame"
#define MyAppExeName "ZorbasBridge.exe"

[Setup]
AppId={{2A9E9409-CE1A-4786-9348-CC7B31ED0C62}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL=https://soulflame-twins.vercel.app/
AppSupportURL=https://zorbas-seven.vercel.app/
DefaultDirName={autopf}\SoulFlame\Zorbas Bridge
DefaultGroupName=SoulFlame
DisableProgramGroupPage=yes
OutputDir=..\artifacts\installer
OutputBaseFilename=Zorbas-Bridge-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
SetupLogging=yes
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "autostart"; Description: "Стартирай Zorbas Bridge автоматично с Windows"; GroupDescription: "Автоматично стартиране:"; Flags: checkedonce
Name: "desktopicon"; Description: "Създай икона на работния плот"; GroupDescription: "Икони:"; Flags: unchecked

[Files]
Source: "..\artifacts\win-x64\ZorbasBridge.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Zorbas Bridge"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\Zorbas Bridge"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{userstartup}\Zorbas Bridge"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: autostart

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Стартирай Zorbas Bridge"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{cmd}"; Parameters: "/C taskkill /IM ZorbasBridge.exe /F"; Flags: runhidden; RunOnceId: "StopZorbasBridge"
