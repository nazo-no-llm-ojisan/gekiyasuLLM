param(
  [string]$EnvFile = "",
  [ValidateSet("dev", "start")]
  [string]$NpmScript = "dev",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
  $EnvFile = Join-Path $RepoRoot "packages\proxy\.env"
}

function ConvertFrom-DotenvLine {
  param([string]$Line)

  $trimmed = $Line.Trim()
  if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) {
    return $null
  }

  $equalsAt = $trimmed.IndexOf("=")
  if ($equalsAt -le 0) {
    return $null
  }

  $name = $trimmed.Substring(0, $equalsAt).Trim()
  $value = $trimmed.Substring($equalsAt + 1).Trim()

  if ($value.Length -ge 2) {
    $first = $value.Substring(0, 1)
    $last = $value.Substring($value.Length - 1, 1)
    if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
      $value = $value.Substring(1, $value.Length - 2)
    }
  }

  return [pscustomobject]@{
    Name = $name
    Value = $value
  }
}

if (Test-Path -LiteralPath $EnvFile) {
  foreach ($line in Get-Content -LiteralPath $EnvFile -Encoding UTF8) {
    $entry = ConvertFrom-DotenvLine -Line $line
    if ($null -ne $entry) {
      [Environment]::SetEnvironmentVariable($entry.Name, $entry.Value, "Process")
    }
  }
}

if ($DryRun) {
  [pscustomobject]@{
    envFile = $EnvFile
    envFileExists = Test-Path -LiteralPath $EnvFile
    upstreamBaseUrlSet = -not [string]::IsNullOrWhiteSpace($env:GEKIYASU_UPSTREAM_BASE_URL)
    upstreamKeySet = -not (
      [string]::IsNullOrWhiteSpace($env:GEKIYASU_UPSTREAM_API_KEY) -and
      [string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)
    )
    proxyTokenRequired = -not [string]::IsNullOrWhiteSpace($env:GEKIYASU_PROXY_TOKEN)
    npmScript = $NpmScript
  } | ConvertTo-Json -Compress
  exit 0
}

Set-Location -LiteralPath $RepoRoot
& npm --prefix packages/proxy run $NpmScript
exit $LASTEXITCODE
