; Instalador de PokéSurvivor para Windows (Inno Setup 6, https://jrsoftware.org/isinfo.php).
; Empaqueta la app de Rust ya hecha por empaquetar.cjs (dist/PokeSurvivor/).
; Lo compila instalador.cjs:
;   ISCC /DVersion=X.Y.Z /DOrigen=dist\PokeSurvivor /Odist instalador.iss
; → dist/PokeSurvivor-Windows-Setup.exe
;
; - Para el usuario, sin pedir administrador (%LOCALAPPDATA%\Programs\PokeSurvivor);
;   al empezar deja elegir «para todos los usuarios» (Archivos de programa, pide administrador).
; - Instalar encima de una versión anterior la actualiza (mismo AppId, misma carpeta).
; - La partida (%APPDATA%\PokeSurvivor\, también el perfil de WebView2) no la toca
;   ni al actualizar ni al desinstalar: el instalador sólo escribe en la carpeta del programa.

#ifndef Version
  #define Version "0.0.0"
#endif
#ifndef Origen
  #define Origen "dist\PokeSurvivor"
#endif

[Setup]
; No cambiar nunca el AppId: es lo que hace que una versión nueva actualice a la anterior.
AppId={{E7B347D2-92C7-4D57-A1D2-7A8260D4F733}
AppName=PokéSurvivor
AppVersion={#Version}
AppVerName=PokéSurvivor {#Version}
AppPublisher=PokéSurvivor (proyecto de fan sin ánimo de lucro)
AppPublisherURL=https://paulprade05.github.io/pokesurvivor/
AppSupportURL=https://github.com/Paulprade05/pokesurvivor/issues
AppUpdatesURL=https://github.com/Paulprade05/pokesurvivor/releases/latest
AppCopyright=Proyecto de fan sin ánimo de lucro. Pokémon © Nintendo/Creatures/GAME FREAK.
VersionInfoVersion={#Version}
VersionInfoProductName=PokéSurvivor
VersionInfoDescription=PokéSurvivor Setup
DefaultDirName={autopf}\PokeSurvivor
DisableProgramGroupPage=yes
DisableWelcomePage=no
DisableReadyPage=no
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputBaseFilename=PokeSurvivor-Windows-Setup
SetupIconFile=icono.ico
UninstallDisplayIcon={app}\PokeSurvivor.exe
UninstallDisplayName=PokéSurvivor
WizardStyle=modern
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes
; Si el juego está abierto, el asistente pide cerrarlo (y el desinstalador también).
CloseApplications=yes
RestartApplications=no
AppMutex=Local\PokeSurvivor.unica
ShowLanguageDialog=auto

[Languages]
; El primero es el de reserva si Windows no está en español.
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[CustomMessages]
en.Accesos=Shortcuts:
es.Accesos=Accesos directos:
en.MenuInicio=Create a &Start menu shortcut
es.MenuInicio=Crear un acceso directo en el menú &Inicio

; En [Messages] no se pueden usar {cm:...}: el texto va entero.
[Messages]
en.WelcomeLabel2=This will install [name/ver] on your computer.%n%nYour save stays in %APPDATA%\PokeSurvivor: installing a new version or uninstalling doesn't delete it.%n%nIf the game is open, close it before continuing.
es.WelcomeLabel2=Se instalará [name/ver] en tu equipo.%n%nTu partida se guarda en %APPDATA%\PokeSurvivor: instalar una versión nueva o desinstalar no la borra.%n%nSi el juego está abierto, ciérralo antes de continuar.

[Tasks]
Name: "menuinicio"; Description: "{cm:MenuInicio}"; GroupDescription: "{cm:Accesos}"
Name: "escritorio"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:Accesos}"

[InstallDelete]
; Al actualizar, fuera el juego viejo: así no se quedan archivos que la versión nueva ya no trae.
Type: filesandordirs; Name: "{app}\www"

[Files]
Source: "{#Origen}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\PokéSurvivor"; Filename: "{app}\PokeSurvivor.exe"; Tasks: menuinicio
Name: "{autodesktop}\PokéSurvivor"; Filename: "{app}\PokeSurvivor.exe"; Tasks: escritorio

[Run]
Filename: "{app}\PokeSurvivor.exe"; Description: "{cm:LaunchProgram,PokéSurvivor}"; Flags: nowait postinstall skipifsilent
