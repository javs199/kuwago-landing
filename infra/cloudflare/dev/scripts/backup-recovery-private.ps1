#Requires -Version 7.0
# Run personally in a private local terminal, never through Codex or transcript.
# Only the encrypted backup path is an argument; no key argument is accepted.
param([Parameter(Mandatory = $true)][string]$BackupFile)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$secret = $null
$pointer = [IntPtr]::Zero
$plain = $null
$request = $null
$child = $null
$started = $false
try {
    $file = (Resolve-Path -LiteralPath $BackupFile).Path
    $node = @(Get-Command node -CommandType Application -ErrorAction Stop)[0].Source
    $secret = Read-Host 'Clave de recuperacion desde tu custodia externa (Base64, entrada oculta)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ($plain -cnotmatch '^[A-Za-z0-9+/]{43}=$') { throw 'invalid' }
    $request = @{ recoverySecretBase64 = $plain } | ConvertTo-Json -Compress
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $node
    $start.ArgumentList.Add((Join-Path $PSScriptRoot 'd1-backup-portable-verify.mjs'))
    $start.ArgumentList.Add($file)
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.Environment.Clear()
    $start.Environment['SystemRoot'] = $env:SystemRoot
    $start.Environment['PATH'] = $env:PATH
    $child = [Diagnostics.Process]::new()
    $child.StartInfo = $start
    [void]$child.Start()
    $started = $true
    $child.StandardInput.Write($request)
    $child.StandardInput.Close()
    $request = $null
    $plain = $null
    if (-not $child.WaitForExit(20000)) { $child.Kill($true); throw 'timeout' }
    # Never relay raw child errors or unvalidated output.
    if ($child.ExitCode -ne 0) { throw 'verification_failed' }
    $result = $child.StandardOutput.ReadToEnd() | ConvertFrom-Json
    if ($result.status -ne 'verified_portable_recovery' -or $result.dpapiUsed -ne $false -or $result.restoreVerified -ne $true) { throw 'invalid_result' }
    @{ status = 'verified_portable_recovery'; operationId = $result.operationId; encryptedSha256 = $result.encryptedSha256; tables = $result.tables; rows = $result.rows; dpapiUsed = $false; externalCustodyVerified = $false } | ConvertTo-Json -Compress
} catch {
    Write-Output '{"status":"portable_recovery_failed","externalCustodyVerified":false}'
    exit 2
} finally {
    if ($null -ne $child) { if ($started -and -not $child.HasExited) { $child.Kill($true) }; $child.Dispose() }
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($null -ne $secret) { $secret.Dispose() }
    $plain = $null
    $request = $null
}
