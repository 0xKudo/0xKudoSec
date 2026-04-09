; installer.nsh — 0xKudo Security Toolkit custom NSIS installer logic
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER

Var FluentBitAlreadyInstalled
Var FluentBitCheckbox
Var InstallFluentBit
Var Dialog

!macro customPageAfterChangeDir
  Page custom FluentBitPageCreate FluentBitPageLeave
!macroend

Function FluentBitPageCreate
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\fluent-bit" "DisplayName"
  StrCpy $FluentBitAlreadyInstalled "0"
  ${If} $0 != ""
    StrCpy $FluentBitAlreadyInstalled "1"
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 50u "Install Fluent Bit log shipper?$\n$\nFluent Bit forwards your Windows Event Logs to 0xKudo Security Toolkit. You can skip this and install Fluent Bit later using the Setup instructions in Configuration."
  Pop $0

  ${NSD_CreateCheckbox} 0 60u 100% 12u "Install Fluent Bit (recommended)"
  Pop $FluentBitCheckbox
  ${NSD_SetState} $FluentBitCheckbox ${BST_CHECKED}

  nsDialogs::Show
FunctionEnd

Function FluentBitPageLeave
  ${NSD_GetState} $FluentBitCheckbox $InstallFluentBit
FunctionEnd

!macro customInstall
  ${If} $InstallFluentBit == ${BST_CHECKED}
  ${AndIf} $FluentBitAlreadyInstalled == "0"
    ExecWait '"$INSTDIR\resources\assets\fluent-bit-installer.exe" /S' $0
    CreateDirectory "C:\Program Files\fluent-bit\conf"
    nsExec::ExecToLog 'icacls "C:\Program Files\fluent-bit\conf" /grant "Users:(OI)(CI)M" /T'
  ${EndIf}
!macroend

!endif ; BUILD_UNINSTALLER
