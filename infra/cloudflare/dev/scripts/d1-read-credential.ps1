# Local masked credential entry. Never writes the credential to a file/history or command argument.
param([switch]$InputOnly, [switch]$MigrationRunner)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$diagnosticDirectory = Split-Path -Parent $PSScriptRoot
$evidenceDirectory = Join-Path $diagnosticDirectory $(if ($MigrationRunner) { '.wrangler\safe-d1-development' } else { '.wrangler\phase2c4' })
[void][System.IO.Directory]::CreateDirectory($evidenceDirectory)
$statusFile = Join-Path $evidenceDirectory 'status.json'
function Write-DiagnosticStatus([string]$State) {
    @{ phase = '2C.4'; state = $State; time = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json -Compress | Set-Content -LiteralPath $statusFile -Encoding UTF8
}
$form = $null
$tokenBox = $null
$plainToken = $null
$startInfo = $null
$childProcess = $null
try {
    $attemptMarker = if ($MigrationRunner) { 'operation.lock' } else { 'attempt.lock' }
    if (Test-Path -LiteralPath (Join-Path $evidenceDirectory $attemptMarker)) { Write-DiagnosticStatus 'existing_attempt_do_not_repeat'; exit 2 }
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [System.Windows.Forms.Application]::EnableVisualStyles()
    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'Kuwago - Diagnostico D1 SOLO LECTURA'
    $form.ClientSize = New-Object System.Drawing.Size(650, 330)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.TopMost = $true
    $form.ShowInTaskbar = $true
    $description = New-Object System.Windows.Forms.Label
    $description.Location = New-Object System.Drawing.Point(20, 16)
    $description.Size = New-Object System.Drawing.Size(610, 68)
    $description.Text = "Introduce SOLO la credencial temporal D1 Read (sin Edit).`nEl token queda oculto y solo se entrega al proceso local de diagnostico.`nNo se guarda en archivos, argumentos, historial ni en Codex."
    $form.Controls.Add($description)
    $accountLabel = New-Object System.Windows.Forms.Label
    $accountLabel.Location = New-Object System.Drawing.Point(20, 90)
    $accountLabel.Size = New-Object System.Drawing.Size(610, 40)
    $accountLabel.Text = 'Cuenta: 7a8bcd7992a3de359d2aff87df2fb693'
    $form.Controls.Add($accountLabel)
    $databaseLabel = New-Object System.Windows.Forms.Label
    $databaseLabel.Location = New-Object System.Drawing.Point(20, 126)
    $databaseLabel.Size = New-Object System.Drawing.Size(610, 42)
    $databaseLabel.Text = "D1: kuwago-admin-db-development`nUUID: c5cfbe44-4fd0-4c2a-83c1-b833935534ba"
    $form.Controls.Add($databaseLabel)
    $tokenBox = New-Object System.Windows.Forms.TextBox
    $tokenBox.Location = New-Object System.Drawing.Point(20, 183)
    $tokenBox.Size = New-Object System.Drawing.Size(610, 28)
    $tokenBox.UseSystemPasswordChar = $true
    $tokenBox.MaxLength = 256
    $tokenBox.AccessibleName = 'Token temporal D1 Read - campo oculto local'
    $form.Controls.Add($tokenBox)
    $run = New-Object System.Windows.Forms.Button
    $run.Text = 'Ejecutar solo lectura'
    $run.Location = New-Object System.Drawing.Point(260, 260)
    $run.Size = New-Object System.Drawing.Size(200, 35)
    $run.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Controls.Add($run)
    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Text = 'Cancelar'
    $cancel.Location = New-Object System.Drawing.Point(480, 260)
    $cancel.Size = New-Object System.Drawing.Size(150, 35)
    $cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $form.Controls.Add($cancel)
    $form.AcceptButton = $run
    $form.CancelButton = $cancel
    if ($MigrationRunner) {
        $description.Text = "Fase 2C.5R: ejecutor de migraciones preparado solo para pruebas locales.`nLa ejecucion remota no esta autorizada en esta version.`nNo introduzcas una credencial de escritura todavia."
        $run.Text = 'Migraciones remotas bloqueadas'
        $run.Enabled = $false
        $form.AcceptButton = $null
    }
    if ($InputOnly) {
        $description.Text = "Modo captura local: NO se ejecutara ninguna consulta remota.`nIntroduce personalmente el token en el campo oculto; permanece solo en memoria.`nAl cerrar o cancelar se descarta. No se guarda ni se imprime."
        $run.Text = 'Consulta remota deshabilitada'
        $run.Enabled = $false
        $form.AcceptButton = $null
    }
    Write-DiagnosticStatus $(if ($MigrationRunner) { 'migration_remote_execution_locked' } elseif ($InputOnly) { 'awaiting_local_masked_credential_no_execution' } else { 'awaiting_local_masked_credential' })
    if ($form.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { Write-DiagnosticStatus 'cancelled'; exit 2 }
    if ($InputOnly -or $MigrationRunner) { Write-DiagnosticStatus 'capture_closed_no_execution'; exit 0 }
    $plainToken = $tokenBox.Text.Trim()
    $tokenBox.Clear()
    $form.Dispose()
    if ($plainToken -notmatch '^[-_A-Za-z0-9]{20,256}$') { Write-DiagnosticStatus 'invalid_credential_format'; exit 2 }
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = @(Get-Command node.exe -CommandType Application -ErrorAction Stop)[0].Source
    $entryScript = if ($MigrationRunner) { 'd1-safe-migrate.mjs' } else { 'd1-read-diagnostic.mjs' }
    $startInfo.Arguments = '"' + (Join-Path $PSScriptRoot $entryScript) + '"'
    $startInfo.WorkingDirectory = $diagnosticDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.EnvironmentVariables['CLOUDFLARE_API_TOKEN'] = $plainToken
    $startInfo.EnvironmentVariables['CLOUDFLARE_ACCOUNT_ID'] = '7a8bcd7992a3de359d2aff87df2fb693'
    $startInfo.EnvironmentVariables['KUWAGO_D1_DATABASE_ID'] = 'c5cfbe44-4fd0-4c2a-83c1-b833935534ba'
    Write-DiagnosticStatus 'running_readonly_diagnostic'
    $childProcess = [System.Diagnostics.Process]::Start($startInfo)
    $startInfo.EnvironmentVariables.Remove('CLOUDFLARE_API_TOKEN')
    $plainToken = $null
    # Never echo captured stdout/stderr. The Node script writes only sanitized evidence.
    [void]$childProcess.StandardOutput.ReadToEnd()
    [void]$childProcess.StandardError.ReadToEnd()
    $childProcess.WaitForExit()
    if ($childProcess.ExitCode -eq 0) { Write-DiagnosticStatus 'completed' } else { Write-DiagnosticStatus 'completed_with_failure' }
} catch {
    Write-DiagnosticStatus 'local_input_or_process_failure'
} finally {
    if ($null -ne $startInfo) { $startInfo.EnvironmentVariables.Remove('CLOUDFLARE_API_TOKEN') }
    $plainToken = $null
    if ($null -ne $tokenBox -and -not $tokenBox.IsDisposed) { $tokenBox.Clear() }
    if ($null -ne $form -and -not $form.IsDisposed) { $form.Dispose() }
    if ($null -ne $childProcess) { $childProcess.Dispose() }
    Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
}
