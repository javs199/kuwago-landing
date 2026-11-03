#Requires -Version 7.0
# Existing masked Windows Forms/private stdin pattern. No secrets in arguments.
param([ValidateSet('stage-four','stage-six','current-admin')][string]$BackupProfile = 'stage-four')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$authorizationId = $null
$executionApproved = $false
$form = $null
$tokenBox = $null
$keyBox = $null
$state = @{ Busy = $false; ExitCode = 2 }
try {
    if (-not $IsWindows -or [Threading.Thread]::CurrentThread.ApartmentState -ne 'STA' -or $args.Count) { throw 'windows_sta_required' }
    # Read the same non-secret plan as the CLI; no duplicated approval flag/ID.
    $planStart = [Diagnostics.ProcessStartInfo]::new()
    $planStart.FileName = @(Get-Command node.exe -CommandType Application -ErrorAction Stop)[0].Source
    $planScript = if ($BackupProfile -in @('stage-six','current-admin')) { if ($BackupProfile -eq 'current-admin') { 'd1-backup-current-status.mjs' } else { 'd1-backup-six-status.mjs' } } else { 'd1-backup-once-status.mjs' }
    $runnerScript = if ($BackupProfile -in @('stage-six','current-admin')) { if ($BackupProfile -eq 'current-admin') { 'd1-backup-current-private.mjs' } else { 'd1-backup-six-private.mjs' } } else { 'd1-backup-once.mjs' }
    $planStart.ArgumentList.Add((Join-Path $PSScriptRoot $planScript))
    $planStart.UseShellExecute = $false
    $planStart.CreateNoWindow = $true
    $planStart.RedirectStandardOutput = $true
    $planStart.RedirectStandardError = $true
    $planStart.Environment.Clear()
    $planStart.Environment['SystemRoot'] = $env:SystemRoot
    $planStart.Environment['PATH'] = $env:PATH
    $planChild = [Diagnostics.Process]::Start($planStart)
    try {
        if (-not $planChild.WaitForExit(10000) -or $planChild.ExitCode -ne 0) { throw 'local_plan_failed' }
        $plan = $planChild.StandardOutput.ReadToEnd() | ConvertFrom-Json
    } finally { if (-not $planChild.HasExited) { $planChild.Kill($true) }; $planChild.Dispose() }
    if ($plan.authorizationId -cnotmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' -or $plan.intendedPermission -cne 'D1 Read + D1 Write' -or $plan.target.name -cne 'kuwago-admin-db-development' -or $plan.target.id -cne 'c5cfbe44-4fd0-4c2a-83c1-b833935534ba' -or $plan.target.account -cne '7a8bcd7992a3de359d2aff87df2fb693') { throw 'local_plan_invalid' }
    if ($plan.alreadyUsed) { throw 'authorization_used' }
    $expectedStage = if ($BackupProfile -in @('stage-six','current-admin')) { 6 } else { 4 }
    $expectedTables = if ($BackupProfile -in @('stage-six','current-admin')) { 32 } else { 26 }
    $expectedHistory = '0001_admin_catalog.sql|0002_integrity_guards.sql|0003_access_rbac.sql|0004_catalog_operations.sql'
    if ($BackupProfile -in @('stage-six','current-admin')) { $expectedHistory += '|0005_publication_resilience.sql|0006_media_lifecycle.sql' }
    if ($plan.expectedStage -ne $expectedStage -or $plan.applicationTables -ne $expectedTables -or (@($plan.expectedHistory) -join '|') -cne $expectedHistory) { throw 'backup_profile_invalid' }
    $authorizationId = $plan.authorizationId
    $executionApproved = ($plan.executionApproved -eq $true)
    Import-Module (Join-Path $PSScriptRoot 'recovery-key-core.psm1') -Force -DisableNameChecking
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $form = [Windows.Forms.Form]::new()
    $form.Text = "Kuwago - Respaldo actual antes de cambios DEV (etapa $expectedStage)"
    $form.ClientSize = [Drawing.Size]::new(770, 460)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.ShowInTaskbar = $true
    $form.TopMost = $true
    $intro = [Windows.Forms.Label]::new()
    $intro.SetBounds(22, 18, 726, 130)
    $intro.Text = "Destino fijo: kuwago-admin-db-development.`nCuenta: 7a8bcd7992a3de359d2aff87df2fb693; UUID: c5cfbe44-4fd0-4c2a-83c1-b833935534ba.`nPermisos previstos: D1 Read + D1 Write. El token puede escribir fuera de esta herramienta.`nEste flujo solo permite lecturas y un export; PROHIBE SQL remoto de escritura,`nmigraciones, restauracion remota y deploy. El export puede bloquear consultas.`nEl alcance real del token debe revisarse aparte; la herramienta no lo certifica.`nNo compartas credenciales ni capturas. Sin reintentos automaticos."
    $form.Controls.Add($intro)
    $tokenLabel = [Windows.Forms.Label]::new()
    $tokenLabel.SetBounds(22, 160, 726, 24)
    $tokenLabel.Text = 'Token temporal D1 Read + D1 Write, cuenta autorizada (entrada oculta)'
    $form.Controls.Add($tokenLabel)
    $tokenBox = [Windows.Forms.TextBox]::new()
    $tokenBox.SetBounds(22, 186, 726, 28)
    $tokenBox.UseSystemPasswordChar = $true
    $tokenBox.MaxLength = 256
    $tokenBox.AccessibleName = 'Token temporal D1 Read + D1 Write, entrada oculta local'
    $tokenBox.Enabled = $executionApproved
    $form.Controls.Add($tokenBox)
    $keyLabel = [Windows.Forms.Label]::new()
    $keyLabel.SetBounds(22, 230, 726, 24)
    $keyLabel.Text = "Etapa ${expectedStage}: $expectedTables tablas + historial exacto. Clave EXISTENTE (entrada oculta)"
    $form.Controls.Add($keyLabel)
    $keyBox = [Windows.Forms.TextBox]::new()
    $keyBox.SetBounds(22, 256, 726, 28)
    $keyBox.UseSystemPasswordChar = $true
    $keyBox.MaxLength = 44
    $keyBox.AccessibleName = 'Clave existente de recuperacion, entrada oculta local'
    $keyBox.Enabled = $executionApproved
    $form.Controls.Add($keyBox)
    $run = [Windows.Forms.Button]::new()
    $run.SetBounds(22, 310, 400, 38)
    $run.Text = if ($executionApproved) { 'Ejecutar el unico respaldo autorizado' } else { 'Ejecucion remota pendiente de autorizacion' }
    $run.Enabled = $executionApproved
    $form.Controls.Add($run)
    $cancel = [Windows.Forms.Button]::new()
    $cancel.SetBounds(445, 310, 200, 38)
    $cancel.Text = 'Cancelar y cerrar'
    $cancel.Add_Click({ $form.Close() })
    $form.Controls.Add($cancel)
    $status = [Windows.Forms.Label]::new()
    $status.SetBounds(22, 365, 726, 75)
    $status.Text = if ($executionApproved) { 'Unico intento autorizado. Ambos secretos viajan solo por un pipe privado local.' } else { "PREPARACION LOCAL: no introduzcas credenciales. Ejecucion bloqueada.`nID nuevo: $authorizationId. Requiere autorizacion explicita posterior."
    }
    $form.Controls.Add($status)
    $form.Add_FormClosing({ param($sender, $eventArgs) if ($state.Busy) { $eventArgs.Cancel = $true } })
    $run.Add_Click({
        if (-not $executionApproved) { return }
        if ($tokenBox.Text -cnotmatch '^[-_A-Za-z0-9]{20,256}$' -or $keyBox.Text -cnotmatch '^[A-Za-z0-9+/]{43}=$') { $status.Text = 'Formato incompleto. Revisa los campos en privado, sin enviarlos a Codex.'; return }
        $state.Busy = $true
        $run.Enabled = $false
        $cancel.Enabled = $false
        $status.Text = 'Ejecutando una sola vez. No cierres esta ventana. Los resultados se guardan depurados.'
        $form.Refresh()
        $token = $null
        $key = $null
        $request = $null
        $child = $null
        $started = $false
        $ok = $false
        try {
            $token = $tokenBox.Text
            $key = $keyBox.Text
            $tokenBox.Clear()
            $keyBox.Clear()
            $start = [Diagnostics.ProcessStartInfo]::new()
            $start.FileName = @(Get-Command node.exe -CommandType Application -ErrorAction Stop)[0].Source
            $start.ArgumentList.Add((Join-Path $PSScriptRoot $runnerScript))
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
            $request = @{ token = $token; recoverySecretBase64 = $key } | ConvertTo-Json -Compress
            $child.StandardInput.Write($request)
            $child.StandardInput.Close()
            # Best-effort removal of matching clipboard copies, never relayed to Codex.
            $null = Clear-KuwagoOwnedClipboard -ExpectedText $token -ReadText { [Windows.Forms.Clipboard]::GetText() } -Clear { [Windows.Forms.Clipboard]::Clear() }
            $null = Clear-KuwagoOwnedClipboard -ExpectedText $key -ReadText { [Windows.Forms.Clipboard]::GetText() } -Clear { [Windows.Forms.Clipboard]::Clear() }
            $request = $null
            $token = $null
            $key = $null
            if (-not $child.WaitForExit(600000)) { $child.Kill($true); throw 'timeout' }
            $summary = $child.StandardOutput.ReadToEnd() | ConvertFrom-Json
            $ok = ($child.ExitCode -eq 0 -and $summary.status -ceq 'PASS' -and $summary.authorizationId -ceq $authorizationId)
        } catch { $ok = $false }
        finally {
            $request = $null
            $token = $null
            $key = $null
            $tokenBox.Clear()
            $keyBox.Clear()
            if ($null -ne $child) {
                if ($started -and -not $child.HasExited) { $child.Kill($true) }
                $child.Dispose()
            }
            $state.Busy = $false
        }
        $state.ExitCode = if ($ok) { 0 } else { 2 }
        $message = if ($ok) { 'PASS: respaldo cifrado y restauracion local verificados. No se ejecutaran migraciones.' } else { 'FAIL: la ejecucion se detuvo. Codex revisara solo el error depurado. No se reintentara ni ampliaran permisos.' }
        [void][Windows.Forms.MessageBox]::Show($form, $message, 'Kuwago - Resultado sin secretos', [Windows.Forms.MessageBoxButtons]::OK, [Windows.Forms.MessageBoxIcon]::Information)
        $form.Close()
    })
    [void]$form.ShowDialog()
} catch { $state.ExitCode = 2 }
finally {
    if ($null -ne $tokenBox) { $tokenBox.Clear() }
    if ($null -ne $keyBox) { $keyBox.Clear() }
    if ($null -ne $form) { $form.Dispose() }
}
exit $state.ExitCode

