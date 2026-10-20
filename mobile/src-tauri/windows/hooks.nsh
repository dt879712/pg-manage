!macro NSIS_HOOK_PREINSTALL
  ; Close any leftover Dev Hostel process so an update/relaunch is never
  ; blocked by a stale "already running" guard (e.g. a WebView2 child process
  ; still alive after the window was closed).
  nsExec::Exec 'taskkill /F /IM "Dev Hostel.exe" /T'
  Pop $0
  Sleep 600
!macroend
