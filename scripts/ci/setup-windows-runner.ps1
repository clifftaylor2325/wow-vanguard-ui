# One-time setup of a Windows PC as this repository's self-hosted GitHub
# Actions runner: the tools the verify workflow needs, installed for every
# account on the machine. Run in an administrator PowerShell:
#
#   powershell -ExecutionPolicy Bypass -File scripts\ci\setup-windows-runner.ps1
#
# install-windows-runner.ps1 runs this as part of the one-command install;
# on its own it only installs the tools (register the runner separately:
# GitHub -> Settings -> Actions -> Runners -> New self-hosted runner).
# Safe to run again: everything already in place is skipped.

$ErrorActionPreference = "Stop"
$tools = "C:\tools\lua"

# Installs a winget package unless its command is already on PATH.
function Install-IfMissing($command, $packageId) {
  if (Get-Command $command -ErrorAction SilentlyContinue) { Write-Host "$command is installed"; return }
  Write-Host "installing $packageId"
  winget install --id $packageId --exact --silent --accept-package-agreements --accept-source-agreements
}

# Downloads a file to $file and checks its SHA-256; a file already there with
# the right hash is kept. A wrong hash deletes the download and stops, so a
# rerun starts clean. The user agent is wget's: SourceForge answers a
# browser-like one (PowerShell's default) with its "your download will
# start" HTML page instead of the file.
function Get-Verified($url, $file, $sha256) {
  $name = Split-Path $file -Leaf
  if ((Test-Path $file) -and (Get-FileHash $file -Algorithm SHA256).Hash.ToLower() -eq $sha256) { Write-Host "$name is present"; return }
  Write-Host "downloading $name"
  Invoke-WebRequest -Uri $url -OutFile $file -UseBasicParsing -UserAgent "Wget/1.21"
  $hash = (Get-FileHash $file -Algorithm SHA256).Hash.ToLower()
  if ($hash -ne $sha256) {
    Remove-Item $file -Force
    throw "$name has an unexpected SHA-256 ($hash, expected $sha256); the download was deleted. Run the script again, or download $url in a browser to $file."
  }
}

# Adds a folder to the machine PATH (for the runner service, whatever account it runs as) and to this session.
function Add-MachinePath($folder) {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  if (($machine -split ";") -notcontains $folder) {
    [Environment]::SetEnvironmentVariable("Path", "$machine;$folder", "Machine")
    Write-Host "added $folder to the machine PATH"
  }
  if (($env:Path -split ";") -notcontains $folder) { $env:Path = "$env:Path;$folder" }
}

Install-IfMissing "git" "Git.Git"
Install-IfMissing "node" "OpenJS.NodeJS.LTS"
# The installers add themselves to the machine PATH; pick that up without a new shell.
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

New-Item -ItemType Directory -Force -Path $tools | Out-Null

# luacheck: the standalone Windows build from the lunarmodules releases (v1.2.0).
Get-Verified "https://github.com/lunarmodules/luacheck/releases/download/v1.2.0/luacheck.exe" "$tools\luacheck.exe" "0f1c69c4d09f1ebb4d8df14c215e4553e2e639bd4cb7bf3c639b0daa6198317b"

# Lua 5.1 (the game's Lua) from LuaBinaries: the whole zip goes into the
# folder, since luac5.1.exe needs lua5.1.dll and the Visual C++ 2005 runtime
# (the Microsoft.VC80.CRT folder) next to it.
$zip = "$env:TEMP\lua-5.1.5_Win64_bin.zip"
if (-not (Test-Path "$tools\Microsoft.VC80.CRT")) {
  Get-Verified "https://sourceforge.net/projects/luabinaries/files/5.1.5/Tools%20Executables/lua-5.1.5_Win64_bin.zip/download" $zip "5f34cf7d40a20a587ea351482a4207d93b92ef6f1983e910a13338253819fe93"
  Expand-Archive -Path $zip -DestinationPath $tools -Force
  Write-Host "installed luac5.1.exe"
} else { Write-Host "luac5.1.exe is present" }

Add-MachinePath $tools

# The preview job's browser: Playwright (the version the workflow pins) and Chromium.
if (-not (Get-Command playwright -ErrorAction SilentlyContinue)) { npm install -g playwright@1.56.1 }
playwright install chromium

# The repository keeps LF line endings; the checkout must not turn them into CRLF.
git config --global core.autocrlf false

Write-Host ""
Write-Host "git        $(git --version)"
Write-Host "node       $(node --version)"
Write-Host "luacheck   $(luacheck --version)"
Write-Host "luac5.1    $(luac5.1 -v)"
Write-Host "playwright $(playwright --version)"
Write-Host ""
Write-Host "Done. If the runner service was already running, restart it so it sees the new PATH:"
Write-Host "  Restart-Service -Name 'actions.runner.*'"
