#Requires -Version 7.0
# Same WinForms/hidden fields/private stdin/owned clipboard cleanup as the
# existing verification and backup forms. Calls the reviewed executor unchanged.
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$executionId = '264309c0-5461-41ed-b4c0-d89604a69f9b'
$custodyRoot = 'C:\Users\JV\AppData\Local\Kuwago\D1Backups\development'
$prefix = Join-Path $custodyRoot ('bootstrap-' + $executionId)
$form = $null
$tokenBox = $null
$jwtBox = $null
$state = @{ Busy = $false; ExitCode = 2 }
function Write-CaptureEvidence([string]$Suffix, [object]$Value) {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Depth 4 -Compress))
    $stream = [IO.FileStream]::new(($prefix + '.' + $Suffix + '.json'), [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
}
try {
    if (-not $IsWindows -or [Threading.Thread]::CurrentThread.ApartmentState -ne 'STA' -or $args.Count) { throw 'windows_sta_required' }
    $plan = Get-Content -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) 'next-stage\bootstrap-authorization.json') -Raw | ConvertFrom-Json
    if (-not $plan.approved -or $plan.executionId -cne $executionId -or $plan.maximumBatches -ne 1 -or $plan.target.id -cne 'c5cfbe44-4fd0-4c2a-83c1-b833935534ba' -or $plan.target.account -cne '7a8bcd7992a3de359d2aff87df2fb693' -or $plan.target.name -cne 'kuwago-admin-db-development') { throw 'scope_invalid' }
    foreach ($suffix in @('attempt','result','closed','capture-started','capture-result')) { if (Test-Path -LiteralPath ($prefix + '.' + $suffix + '.json')) { throw 'execution_already_started' } }
    Import-Module (Join-Path $PSScriptRoot 'recovery-key-core.psm1') -Force -DisableNameChecking
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $form = [Windows.Forms.Form]::new()
    $form.Text = 'Kuwago DEV - Primer Super Admin - Un solo lote'
    $form.ClientSize = [Drawing.Size]::new(800, 440)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.TopMost = $true
    $form.ShowInTaskbar = $true
    $intro = [Windows.Forms.Label]::new()
    $intro.SetBounds(20, 15, 760, 95)
    $intro.Text = "Solo Kuwago DEV: primer Super Admin Jesus Vargas, ch.jesus.99@gmail.com.`nActor tecnico deshabilitado y sin roles; auditoria de operador unico.`nID: $executionId. Un lote; sin migraciones, export, Access o deploy.`nIntroduce token D1 y JWT VIGENTE de esta app. No se necesita clave de recuperacion.`nNo pegues secretos en Codex. El portapapeles puede tener historial o sincronizacion."
    $form.Controls.Add($intro)
    $tokenLabel = [Windows.Forms.Label]::new()
    $tokenLabel.SetBounds(20, 125, 760, 25)
    $tokenLabel.Text = 'Token temporal D1 Read + D1 Write (oculto)'
    $form.Controls.Add($tokenLabel)
    $tokenBox = [Windows.Forms.TextBox]::new()
    $tokenBox.SetBounds(20, 155, 760, 28)
    $tokenBox.UseSystemPasswordChar = $true
    $tokenBox.MaxLength = 256
    $form.Controls.Add($tokenBox)
    $jwtLabel = [Windows.Forms.Label]::new()
    $jwtLabel.SetBounds(20, 200, 760, 25)
    $jwtLabel.Text = 'JWT Access fresco de kuwago-admin-api-development (oculto)'
    $form.Controls.Add($jwtLabel)
    $jwtBox = [Windows.Forms.TextBox]::new()
    $jwtBox.SetBounds(20, 230, 760, 28)
    $jwtBox.UseSystemPasswordChar = $true
    $jwtBox.MaxLength = 16384
    $form.Controls.Add($jwtBox)
    $run = [Windows.Forms.Button]::new()
    $run.SetBounds(20, 290, 455, 38)
    $run.Text = 'Ejecutar el unico bootstrap autorizado'
    $form.Controls.Add($run)
    $cancel = [Windows.Forms.Button]::new()
    $cancel.SetBounds(500, 290, 230, 38)
    $cancel.Text = 'Cancelar y cerrar'
    $cancel.Add_Click({ $form.Close() })
    $form.Controls.Add($cancel)
    $status = [Windows.Forms.Label]::new()
    $status.SetBounds(20, 355, 760, 65)
    $status.Text = 'Solo se inicia cuando pulses el boton. Ante una diferencia se detiene sin reintento.'
    $form.Controls.Add($status)
    $form.Add_Shown({ $form.Activate(); $form.BringToFront() })
    $form.Add_FormClosing({ param($sender, $eventArgs) if ($state.Busy) { $eventArgs.Cancel = $true } })
    $run.Add_Click({
        if ($tokenBox.Text -cnotmatch '^[-_A-Za-z0-9]{20,256}$' -or $jwtBox.Text -cnotmatch '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$') { $status.Text = 'Revisa privadamente el formato. No envies los valores a Codex.'; return }
        $state.Busy = $true
        $run.Enabled = $false
        $cancel.Enabled = $false
        $status.Text = 'Verificacion JWT, respaldo, preflight y un solo lote si todo coincide.'
        $form.Refresh()
        $token = $null
        $jwt = $null
        $request = $null
        $child = $null
        $started = $false
        $summary = $null
        $outcome = 'UNKNOWN_REVIEW_REQUIRED'
        try {
            Write-CaptureEvidence 'capture-started' @{ executionId=$executionId; sourceSetSha256=$plan.sourceSetSha256; batchSha256=$plan.batchSha256; authorizationReference=$plan.authorizationReference; startedAt=[DateTime]::UtcNow.ToString('o'); maximumBatches=1 }
            $token = $tokenBox.Text
            $jwt = $jwtBox.Text
            $tokenBox.Clear()
            $jwtBox.Clear()
            $start = [Diagnostics.ProcessStartInfo]::new()
            $start.FileName = @(Get-Command node.exe -CommandType Application -ErrorAction Stop)[0].Source
            $start.ArgumentList.Add((Join-Path $PSScriptRoot 'd1-bootstrap-private.mjs'))
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
            $request = @{ token=$token; jwt=$jwt } | ConvertTo-Json -Compress
            $child.StandardInput.Write($request)
            $child.StandardInput.Close()
            $null = Clear-KuwagoOwnedClipboard -ExpectedText $token -ReadText { [Windows.Forms.Clipboard]::GetText() } -Clear { [Windows.Forms.Clipboard]::Clear() }
            $null = Clear-KuwagoOwnedClipboard -ExpectedText $jwt -ReadText { [Windows.Forms.Clipboard]::GetText() } -Clear { [Windows.Forms.Clipboard]::Clear() }
            $request = $null
            $token = $null
            $jwt = $null
            if (-not $child.WaitForExit(600000)) { $child.Kill($true); throw 'outcome_unknown' }
            $summary = $child.StandardOutput.ReadToEnd() | ConvertFrom-Json
            if ($summary.status -ceq 'PASS' -and $summary.executionId -ceq $executionId -and $summary.durablyClosed -eq $true -and $child.ExitCode -eq 0) { $outcome = 'PASS' }
            elseif ($summary.status -cin @('STOPPED','STOPPED_BEFORE_SEND','UNCERTAIN_OR_POSTFLIGHT_FAILED')) { $outcome = $summary.status }
        } catch { $outcome = 'UNKNOWN_REVIEW_REQUIRED' }
        finally {
            $request = $null
            $token = $null
            $jwt = $null
            $tokenBox.Clear()
            $jwtBox.Clear()
            if ($null -ne $child) { if ($started -and -not $child.HasExited) { $child.Kill($true) }; $child.Dispose() }
            $state.Busy = $false
        }
        try { Write-CaptureEvidence 'capture-result' @{ executionId=$executionId; status=$outcome; childStarted=$started; credentialsReleased=$true; finishedAt=[DateTime]::UtcNow.ToString('o') } } catch { $outcome = 'UNKNOWN_REVIEW_REQUIRED' }
        $state.ExitCode = if ($outcome -ceq 'PASS') { 0 } else { 2 }
        $message = if ($outcome -ceq 'PASS') { 'PASS: bootstrap y cierre durable confirmados. Sin deploy ni otras operaciones.' } else { 'Detenido. No repetir. Se revisara la evidencia depurada y, si hace falta, solo lectura.' }
        [void][Windows.Forms.MessageBox]::Show($form,$message,'Kuwago - Resultado sin secretos',[Windows.Forms.MessageBoxButtons]::OK,[Windows.Forms.MessageBoxIcon]::Information)
        $form.Close()
    })
    [void]$form.ShowDialog()
} catch { $state.ExitCode = 2 }
finally { if ($null -ne $tokenBox) { $tokenBox.Clear() }; if ($null -ne $jwtBox) { $jwtBox.Clear() }; if ($null -ne $form) { $form.Dispose() } }
exit $state.ExitCode
