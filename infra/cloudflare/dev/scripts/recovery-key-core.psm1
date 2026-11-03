Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function ConvertTo-KuwagoRecoveryText {
    param([Parameter(Mandatory = $true)][byte[]]$Bytes)
    if ($Bytes.Length -ne 32) { throw 'recovery_length_invalid' }
    $text = [Convert]::ToBase64String($Bytes)
    if ($text.Length -ne 44 -or $text -cnotmatch '^[A-Za-z0-9+/]{43}=$') { throw 'recovery_format_invalid' }
    return $text
}

function Test-KuwagoRecoveryWithVerifier {
    param([Parameter(Mandatory = $true)][string]$Text)
    # Private stdin only, same pattern as backup-recovery-private.ps1.
    $child = $null
    $started = $false
    $request = $null
    try {
        $start = [Diagnostics.ProcessStartInfo]::new()
        $start.FileName = @(Get-Command node -CommandType Application -ErrorAction Stop)[0].Source
        $start.ArgumentList.Add((Join-Path $PSScriptRoot 'd1-recovery-key-validate.mjs'))
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
        $request = @{ recoverySecretBase64 = $Text } | ConvertTo-Json -Compress
        $child.StandardInput.Write($request)
        $child.StandardInput.Close()
        $request = $null
        if (-not $child.WaitForExit(10000)) { $child.Kill($true); return $false }
        if ($child.ExitCode -ne 0) { return $false }
        $result = $child.StandardOutput.ReadToEnd() | ConvertFrom-Json
        return ($result.accepted -eq $true -and $result.bytes -eq 32 -and $result.format -ceq 'base64-standard-canonical')
    } catch { return $false }
    finally {
        $request = $null
        $Text = $null
        if ($null -ne $child) {
            if ($started -and -not $child.HasExited) { $child.Kill($true) }
            $child.Dispose()
        }
    }
}

function Clear-KuwagoOwnedClipboard {
    param([AllowNull()][string]$ExpectedText, [Parameter(Mandatory = $true)][scriptblock]$ReadText, [Parameter(Mandatory = $true)][scriptblock]$Clear)
    # Do not erase a newer clipboard item belonging to another application.
    if ([string]::IsNullOrEmpty($ExpectedText)) { return 'not_owned' }
    $current = $null
    try {
        $current = & $ReadText
        if ($current -cne $ExpectedText) { return 'changed' }
        & $Clear | Out-Null
        return 'cleared'
    } catch { return 'unavailable' }
    finally { $current = $null; $ExpectedText = $null }
}

Export-ModuleMember -Function ConvertTo-KuwagoRecoveryText, Test-KuwagoRecoveryWithVerifier, Clear-KuwagoOwnedClipboard
