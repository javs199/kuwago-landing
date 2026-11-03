#Requires -Version 7.0
param([Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')][string]$OperationId)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$events = @()
try {
    $pwsh = @(Get-Command pwsh -CommandType Application -ErrorAction Stop)[0].Source
    $ui = Join-Path $PSScriptRoot 'recovery-proof-private.ps1'
    foreach ($stage in @('Encrypt', 'Restore')) {
        $child = Start-Process -FilePath $pwsh -ArgumentList @('-NoProfile', '-STA', '-WindowStyle', 'Hidden', '-File', ('"' + $ui + '"'), '-Stage', $stage, '-OperationId', $OperationId) -WindowStyle Hidden -PassThru
        # Do not start the next UI until the entire previous PowerShell exits.
        $child.WaitForExit()
        $events += @{ stage = $stage; processId = $child.Id; exitCode = $child.ExitCode; endedAt = [DateTime]::UtcNow.ToString('o') }
        $exitCode = $child.ExitCode
        $child.Dispose()
        if ($exitCode -ne 0) { break }
    }
    $dir = Join-Path 'C:\Users\JV\AppData\Local\Kuwago\D1Backups\development' ('recovery-proof-' + $OperationId)
    # This directory was created by the validated Node stage; never create it here.
    if (Test-Path -LiteralPath $dir -PathType Container) {
        $record = @{ operationId = $OperationId; stages = $events; status = $(if ($events.Count -eq 2 -and $events[1].exitCode -eq 0) { 'PASS' } else { 'INCOMPLETE_OR_FAILED' }) }
        $file = Join-Path $dir 'sessions.json'
        $stream = [IO.File]::Open($file, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $bytes = [Text.Encoding]::UTF8.GetBytes(($record | ConvertTo-Json -Depth 5)); $stream.Write($bytes); $stream.Flush($true) } finally { $stream.Dispose() }
    }
} catch { exit 2 }
