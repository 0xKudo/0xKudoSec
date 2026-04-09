; installer.nsh — 0xKudo Security Toolkit custom NSIS installer logic

; ── Variables ────────────────────────────────────────────────────────────────
Var FluentBitAlreadyInstalled
Var FluentBitCheckbox
Var InstallFluentBit
Var Dialog

; ── Check if Fluent Bit is already installed ──────────────────────────────────
!macro CheckFluentBitInstalled
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\fluent-bit" "DisplayName"
  StrCmp $0 "" fluent_bit_not_found fluent_bit_found
  fluent_bit_found:
    StrCpy $FluentBitAlreadyInstalled "1"
    Goto fluent_bit_check_done
  fluent_bit_not_found:
    StrCpy $FluentBitAlreadyInstalled "0"
  fluent_bit_check_done:
!macroend

; ── Optional Fluent Bit install page ─────────────────────────────────────────
; Shown after the main install directory page. Skipped if Fluent Bit is already installed.
Function FluentBitPage
  !insertmacro CheckFluentBitInstalled
  StrCmp $FluentBitAlreadyInstalled "1" fluent_bit_page_skip

  nsDialogs::Create 1018
  Pop $Dialog
  StrCmp $Dialog "error" fluent_bit_page_skip

  ${NSD_CreateLabel} 0 0 100% 50u "Install Fluent Bit log shipper?$\n$\nFluent Bit forwards your Windows Event Logs to 0xKudo Security Toolkit. You can skip this and install Fluent Bit later using the Setup instructions in Configuration."
  Pop $0

  ${NSD_CreateCheckbox} 0 58u 100% 12u "Install Fluent Bit (recommended)"
  Pop $FluentBitCheckbox
  ${NSD_SetState} $FluentBitCheckbox ${BST_CHECKED}

  nsDialogs::Show
  fluent_bit_page_skip:
FunctionEnd

Function FluentBitPageLeave
  ${NSD_GetState} $FluentBitCheckbox $0
  StrCpy $InstallFluentBit $0
FunctionEnd

; ── Silent Fluent Bit install (runs after main app files are written) ─────────
Section "Fluent Bit" SecFluentBit
  ; Skip if user unchecked the option
  StrCmp $InstallFluentBit ${BST_CHECKED} 0 fluent_bit_install_skip
  ; Skip if already installed
  StrCmp $FluentBitAlreadyInstalled "1" fluent_bit_install_skip

  ; Copy bundled installer from app resources
  SetOutPath "$TEMP"
  File /oname=fluent-bit-installer.exe "$INSTDIR\resources\assets\fluent-bit-installer.exe"

  ; Run silent install — Fluent Bit uses NSIS /S flag
  ExecWait '"$TEMP\fluent-bit-installer.exe" /S' $0
  Delete "$TEMP\fluent-bit-installer.exe"

  ; If install succeeded, create conf directory and grant write access to all users
  ; so the app can write cybertools.conf without requiring admin elevation
  StrCmp $0 0 fluent_bit_acl_grant fluent_bit_install_skip

  fluent_bit_acl_grant:
    CreateDirectory "C:\Program Files\fluent-bit\conf"
    ; icacls is built into Windows — grant Users group modify access on the conf dir
    nsExec::ExecToLog 'icacls "C:\Program Files\fluent-bit\conf" /grant "Users:(OI)(CI)M" /T'

  fluent_bit_install_skip:
SectionEnd

; ── Register pages with electron-builder's page flow ─────────────────────────
; electron-builder injects its own pages; we append ours after the directory page.
!macro customInstallPage
  Page custom FluentBitPage FluentBitPageLeave
!macroend
