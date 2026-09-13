#define MyAppName "SoulFlame Restaurant Bridge"
#define MyAppVersion "1.2.6"
#define MyAppPublisher "SoulFlame"
#define MyAppExeName "ZorbasBridge.exe"

[Setup]
AppId={{2A9E9409-CE1A-4786-9348-CC7B31ED0C62}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL=https://soulflame-twins.vercel.app/
AppSupportURL=https://soulflame-twins.vercel.app/
DefaultDirName={autopf}\SoulFlame\Restaurant Bridge
DefaultGroupName=SoulFlame
DisableProgramGroupPage=yes
OutputDir=..\artifacts\installer
OutputBaseFilename=SoulFlame-Restaurant-Bridge-Setup
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
Name: "autostart"; Description: "Стартирай SoulFlame Restaurant Bridge автоматично с Windows"; GroupDescription: "Автоматично стартиране:"; Flags: checkedonce
Name: "desktopicon"; Description: "Създай икона на работния плот"; GroupDescription: "Икони:"; Flags: unchecked

[Files]
Source: "..\artifacts\win-x64\ZorbasBridge.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\SoulFlame Restaurant Bridge"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\SoulFlame Restaurant Bridge"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{userstartup}\SoulFlame Restaurant Bridge"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: autostart

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Стартирай SoulFlame Restaurant Bridge"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{cmd}"; Parameters: "/C taskkill /IM ZorbasBridge.exe /F"; Flags: runhidden; RunOnceId: "StopSoulFlameRestaurantBridge"
