# Installs this repository's self-hosted GitHub Actions runner on a Windows
# PC in one go: downloads the runner, installs the tools the jobs need
# (setup-windows-runner.ps1), and registers the runner as a Windows service
# under your own account, so it sees your PATH and the browser.
#
# 1. GitHub -> the repository's Settings -> Actions -> Runners -> New
#    self-hosted runner -> Windows, x64. Copy the token shown after
#    "--token" (it is good for an hour).
# 2. In an administrator PowerShell, from a checkout of this repository:
#
#      powershell -ExecutionPolicy Bypass -File scripts\ci\install-windows-runner.ps1 -Token <the token>
#
#    It asks once for your Windows password, for the service.
#
# Running it again is safe: an already registered runner is left as it is
# (the token is then unused), the tools are refreshed and the service restarted.
# To register afresh, run C:\actions-runner\config.cmd remove first.

param(
  [string] $Token,
  [string] $Repository = "clifftaylor2325/wow-forever-ui",
  [string] $Folder = "C:\actions-runner",
  [string] $Name = $env:COMPUTERNAME
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Stops with a message unless this shell is elevated: the service install needs it.
function Assert-Admin {
  $identity = [Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
  if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this in an administrator PowerShell (right-click PowerShell -> Run as administrator)."
  }
}

# The download URL of the latest runner release for 64-bit Windows.
function Get-RunnerUrl {
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/actions/runner/releases/latest" -UseBasicParsing
  $asset = $release.assets | Where-Object { $_.name -like "actions-runner-win-x64-*.zip" } | Select-Object -First 1
  if (-not $asset) { throw "no win-x64 runner asset in release $($release.tag_name)" }
  return $asset.browser_download_url
}

# Downloads and unpacks the runner into $Folder unless config.cmd is already there.
function Install-Runner {
  if (Test-Path "$Folder\config.cmd") { Write-Host "runner files are in $Folder"; return }
  New-Item -ItemType Directory -Force -Path $Folder | Out-Null
  $url = Get-RunnerUrl
  $zip = "$env:TEMP\actions-runner.zip"
  Write-Host "downloading $(Split-Path $url -Leaf)"
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $Folder -Force
}

Assert-Admin
Install-Runner

# The tools the jobs call, machine-wide (git, node, luacheck, luac5.1, Playwright's Chromium).
& "$PSScriptRoot\setup-windows-runner.ps1"

# Registers the runner with GitHub and installs it as a service under this
# account, unless it is registered already (the .runner file config.cmd
# writes): then a rerun only refreshes the tools and restarts the service
# (which stops a job it is running; GitHub then shows that run as failed).
# config.cmd asks for the account's password itself, so it never appears on
# a command line.
$account = "$env:USERDOMAIN\$env:USERNAME"
Write-Host ""
if (Test-Path "$Folder\.runner") {
  Write-Host "the runner is already registered; restarting its service so it sees the tools' PATH"
  Get-Service -Name "actions.runner.*" | Restart-Service
} else {
  if (-not $Token) { throw "The runner is not registered yet: pass -Token <the token from Settings -> Actions -> Runners -> New self-hosted runner>." }
  Write-Host "registering runner '$Name' for $Repository as a service under $account"
  Push-Location $Folder
  try {
    & .\config.cmd --url "https://github.com/$Repository" --token $Token --name $Name --replace --runasservice --windowslogonaccount $account
    if ($LASTEXITCODE -ne 0) { throw "config.cmd failed with exit code $LASTEXITCODE" }
  } finally { Pop-Location }
}

$service = Get-Service -Name "actions.runner.*" -ErrorAction SilentlyContinue | Select-Object -First 1
Write-Host ""
if ($service) {
  Write-Host "service $($service.Name) is $($service.Status)."
  Write-Host "The runner should show as Idle under Settings -> Actions -> Runners, and queued runs start by themselves."
} else {
  Write-Host "No runner service found; start the runner by hand with $Folder\run.cmd, or check config.cmd's output above."
}
