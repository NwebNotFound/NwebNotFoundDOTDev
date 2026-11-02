<#
.SYNOPSIS
    Watchdog for the ai.nwebnotfound.dev origin: proxy, dashboard and Cloudflare tunnel.

.DESCRIPTION
    Three things must run on this PC for the panel to work:

      AIPanel_proxy      node proxy.mjs        (loopback :8650, injects the Hermes credentials)
      AIPanel_dashboard  Hermes dashboard      (loopback :9119, binds the dashboard API)
      AIPanel_tunnel     cloudflared           (the only way in from Cloudflare)

    Scheduled tasks with RestartCount/RestartInterval restart them when they die; this script is
    what those tasks run, and it can also install them.

    It never contains a secret: the proxy reads its own .env, the tunnel its own token file.

.PARAMETER Service
    Which service to run in the foreground and supervise: proxy | dashboard | tunnel.
    The scheduled task calls this, so the task's exit code is the child's exit code.

.PARAMETER Install
    Register the three scheduled tasks (per user, AtLogOn, restart on failure). Needs one
    confirmation per task; run it yourself, nothing is registered automatically.

.PARAMETER Check
    One-shot health check of all three services; restarts a task whose process is gone.

.PARAMETER Status
    Print what is running and which ports answer. Changes nothing.

.PARAMETER OriginDir
    Where proxy.mjs / the run-*.ps1 wrappers live. Default C:\Users\nilsw\ai-panel-origin.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File watchdog.ps1 -Status
    powershell -ExecutionPolicy Bypass -File watchdog.ps1 -Check
    powershell -ExecutionPolicy Bypass -File watchdog.ps1 -Install
#>
[CmdletBinding(DefaultParameterSetName = "Status")]
param(
  [Parameter(ParameterSetName = "Run", Mandatory = $true)]
  [ValidateSet("proxy", "dashboard", "tunnel")]
  [string]$Service,

  [Parameter(ParameterSetName = "Install", Mandatory = $true)]
  [switch]$Install,

  [Parameter(ParameterSetName = "Check", Mandatory = $true)]
  [switch]$Check,

  [Parameter(ParameterSetName = "Status")]
  [switch]$Status,

  [string]$OriginDir = "C:\Users\nilsw\ai-panel-origin"
)

$ErrorActionPreference = "Stop"
$LogDir = Join-Path $env:LOCALAPPDATA "ai-panel\logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# TaskName -> what it runs. `Port` 0 means "no local listener to probe" (cloudflared).
$Services = @(
  @{ Name = "proxy";     Task = "AIPanel_proxy";     Port = 8650; RunScript = "run-proxy.ps1";     Command = "node";   Arguments = "proxy.mjs";                 Log = "proxy.log" },
  @{ Name = "dashboard"; Task = "AIPanel_dashboard"; Port = 9119; RunScript = "run-dashboard.ps1"; Command = "python"; Arguments = "-m hermes_cli.web_server";  Log = "dashboard.log" },
  @{ Name = "tunnel";    Task = "AIPanel_tunnel";    Port = 0;    RunScript = "run-tunnel.ps1";    Command = "cloudflared.exe"; Arguments = "tunnel run"; Log = "tunnel.log" }
)

function Get-ServiceEntry {
  param([string]$Name)
  return $Services | Where-Object { $_.Name -eq $Name } | Select-Object -First 1
}

function Resolve-Launch {
  <#
    Prefer the run-*.ps1 wrapper in the origin directory (that file already knows the exact
    arguments and environment), then fall back to the documented command.
  #>
  param($Entry)
  $wrapper = Join-Path $OriginDir $Entry.RunScript
  if (Test-Path $wrapper) {
    return @{ File = "powershell.exe"; Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$wrapper`"" }
  }
  $exe = Join-Path $OriginDir $Entry.Command
  if (-not (Test-Path $exe)) {
    $found = Get-Command $Entry.Command -ErrorAction SilentlyContinue
    if (-not $found) { throw "neither $($Entry.RunScript) nor $($Entry.Command) found in $OriginDir" }
    $exe = $found.Source
  }
  return @{ File = $exe; Arguments = $Entry.Arguments }
}

function Test-Port {
  param([int]$Port)
  if ($Port -le 0) { return $null }
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $task = $client.ConnectAsync("127.0.0.1", $Port)
    if ($task.Wait(700) -and $client.Connected) { return $true }
    return $false
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Get-ServiceState {
  param($Entry)
  $task = Get-ScheduledTask -TaskName $Entry.Task -ErrorAction SilentlyContinue
  $info = Get-ScheduledTaskInfo -TaskName $Entry.Task -ErrorAction SilentlyContinue
  $port = Test-Port -Port $Entry.Port
  return [pscustomobject]@{
    Service       = $Entry.Name
    Task          = $Entry.Task
    Registered    = [bool]$task
    TaskState     = if ($task) { $task.State } else { "not registered" }
    LastResult    = if ($info) { $info.LastTaskResult } else { $null }
    Port          = $Entry.Port
    Listening     = $port
  }
}

function Start-Foreground {
  param($Entry)
  $launch = Resolve-Launch -Entry $Entry
  $log = Join-Path $LogDir $Entry.Log
  "[$(Get-Date -Format o)] starting $($Entry.Name): $($launch.File) $($launch.Arguments)" |
    Out-File -FilePath $log -Append -Encoding utf8
  Push-Location $OriginDir
  try {
    # -PassThru + WaitForExit: the task counts as running while the service lives, so Task
    # Scheduler's RestartCount/RestartInterval can act when the process dies non-zero.
    $proc = Start-Process -FilePath $launch.File -ArgumentList $launch.Arguments -NoNewWindow -PassThru `
      -RedirectStandardOutput $log -RedirectStandardError "$log.err"
    $proc.WaitForExit()
    $code = $proc.ExitCode
    "[$(Get-Date -Format o)] $($Entry.Name) exited with $code" | Out-File -FilePath $log -Append -Encoding utf8
    exit $code
  } finally {
    Pop-Location
  }
}

function Install-Tasks {
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -MultipleInstances IgnoreNew `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)
  # AtLogOn with a short delay: the desktop session exists before node/cloudflared bind ports.
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $trigger.Delay = "PT20S"
  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

  foreach ($entry in $Services) {
    $launch = Resolve-Launch -Entry $entry
    $argLine = "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\watchdog.ps1`" -Service $($entry.Name) -OriginDir `"$OriginDir`""
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argLine -WorkingDirectory $OriginDir
    Write-Host "Registering $($entry.Task) -> $($launch.File) $($launch.Arguments)"
    Register-ScheduledTask -TaskName $entry.Task -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  }
  Write-Host "Registered AIPanel_proxy, AIPanel_dashboard, AIPanel_tunnel (AtLogOn, restart 1 min)."
  Write-Host "Logs: $LogDir"
}

switch ($PSCmdlet.ParameterSetName) {
  "Run" { Start-Foreground -Entry (Get-ServiceEntry -Name $Service) }
  "Install" { Install-Tasks }
  "Check" {
    $failed = 0
    foreach ($entry in $Services) {
      $state = Get-ServiceState -Entry $entry
      if ($state.Listening -eq $false) {
        $failed++
        Write-Warning "$($entry.Task): port $($entry.Port) not listening - restarting the task"
        if ($state.Registered) { Start-ScheduledTask -TaskName $entry.Task }
        else { Write-Warning "$($entry.Task) is not registered; run -Install once." }
      }
    }
    exit ([int]($failed -gt 0))
  }
  default {
    foreach ($entry in $Services) { Get-ServiceState -Entry $entry | Format-List }
  }
}
