; Custom NSIS macros for 0xKudoSec installer
; Creates pre-authorized scheduled tasks for Fluent Bit start/stop so the
; tray menu can control the service without triggering UAC on each click.

!macro customInstall
  ; Create scheduled task: Start Fluent Bit
  nsExec::ExecToLog 'schtasks /Create /F /TN "0xKudoSec-FluentBit-Start" /TR "sc start fluent-bit" /SC ONDEMAND /RU SYSTEM /RL HIGHEST'
  ; Create scheduled task: Stop Fluent Bit
  nsExec::ExecToLog 'schtasks /Create /F /TN "0xKudoSec-FluentBit-Stop" /TR "sc stop fluent-bit" /SC ONDEMAND /RU SYSTEM /RL HIGHEST'
!macroend

!macro customUnInstall
  ; Remove scheduled tasks on uninstall
  nsExec::ExecToLog 'schtasks /Delete /F /TN "0xKudoSec-FluentBit-Start"'
  nsExec::ExecToLog 'schtasks /Delete /F /TN "0xKudoSec-FluentBit-Stop"'
!macroend
