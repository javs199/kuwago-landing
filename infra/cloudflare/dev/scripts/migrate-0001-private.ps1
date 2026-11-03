#Requires -Version 7.0
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$authorizationId = '3e3bc6b0-b6dd-41be-98be-7e5910494a92'
$form = $null
$tokenBox = $null
$state = @{ Busy = $false; ExitCode = 2 }
try {
    if (-not $IsWindows -or [Threading.Thread]::CurrentThread.ApartmentState -ne 'STA' -or $args.Count) { throw 'windows_sta_required' }
    $root = 'C:\Users\JV\AppData\Local\Kuwago\D1Backups\development'
    foreach ($suffix in @('attempt', 'result')) { if (Test-Path -LiteralPath (Join-Path $root ('migration-0001-' + $authorizationId + '.' + $suffix + '.json'))) { throw 'already_attempted' } }
    Import-Module (Join-Path $PSScriptRoot 'recovery-key-core.psm1') -Force -DisableNameChecking
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $form = [Windows.Forms.Form]::new()
    $form.Text = 'Kuwago - Aplicar exclusivamente migracion 0001'
    $form.ClientSize = [Drawing.Size]::new(760, 355)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.TopMost = $true
    $form.ShowInTaskbar = $true
    $intro = [Windows.Forms.Label]::new()
    $intro.SetBounds(22, 18, 716, 110)
    $intro.Text = "Solo kuwago-admin-db-development y 0001_admin_catalog.sql.`nBaseline fresco revisado: dos snapshots, fingerprint, bookmarks y respaldo original.`nUn unico lote: 0001 y su registro de migracion. Sin 0002-0006 ni Super Admin.`nToken temporal D1 Read + D1 Write, entrada oculta. Sin reintentos ni deploy.`nSe conserva el bookmark historico cifrado. No necesitas introducir tu clave."
    $form.Controls.Add($intro)
    $tokenBox = [Windows.Forms.TextBox]::new()
    $tokenBox.SetBounds(22, 145, 716, 28)
    $tokenBox.UseSystemPasswordChar = $true
    $tokenBox.MaxLength = 256
    $tokenBox.AccessibleName = 'Token temporal D1 Read y D1 Write, entrada privada'
    $form.Controls.Add($tokenBox)
    $run = [Windows.Forms.Button]::new()
    $run.SetBounds(22, 205, 410, 38)
    $run.Text = 'Aplicar 0001 una sola vez y verificar'
    $form.Controls.Add($run)
    $cancel = [Windows.Forms.Button]::new()
    $cancel.SetBounds(460, 205, 210, 38)
    $cancel.Text = 'Cancelar y cerrar'
    $cancel.Add_Click({ $form.Close() })
    $form.Controls.Add($cancel)
    $status = [Windows.Forms.Label]::new()
    $status.SetBounds(22, 265, 716, 65)
    $status.Text = 'Nada se envia hasta pulsar el boton. Nunca pegues el token en Codex.'
    $form.Controls.Add($status)
    $form.Add_FormClosing({ param($sender, $eventArgs) if ($state.Busy) { $eventArgs.Cancel = $true } })
    $run.Add_Click({
        if ($tokenBox.Text -cnotmatch '^[-_A-Za-z0-9]{20,256}$') { $status.Text = 'Revisa el formato privadamente; no envies el token al chat.'; return }
        $state.Busy = $true
        $run.Enabled = $false
        $cancel.Enabled = $false
        $status.Text = 'Validando y ejecutando exclusivamente 0001. Sin reintentos.'
        $form.Refresh()
        $token = $null
        $request = $null
        $child = $null
        $started = $false
        $ok = $false
        try {
            $token = $tokenBox.Text
            $tokenBox.Clear()
            $start = [Diagnostics.ProcessStartInfo]::new()
            $start.FileName = @(Get-Command node.exe -CommandType Application -ErrorAction Stop)[0].Source
            $start.ArgumentList.Add((Join-Path $PSScriptRoot 'd1-migrate-0001.mjs'))
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
            $request = @{ token = $token } | ConvertTo-Json -Compress
            $child.StandardInput.Write($request)
            $child.StandardInput.Close()
            $null = Clear-KuwagoOwnedClipboard -ExpectedText $token -ReadText { [Windows.Forms.Clipboard]::GetText() } -Clear { [Windows.Forms.Clipboard]::Clear() }
            $request = $null
            $token = $null
            if (-not $child.WaitForExit(600000)) { $child.Kill($true); throw 'outcome_unknown' }
            $summary = $child.StandardOutput.ReadToEnd() | ConvertFrom-Json
            $ok = ($child.ExitCode -eq 0 -and $summary.status -ceq 'PASS' -and $summary.authorizationId -ceq $authorizationId)
        } catch { $ok = $false }
        finally {
            $token = $null
            $request = $null
            $tokenBox.Clear()
            if ($null -ne $child) { if ($started -and -not $child.HasExited) { $child.Kill($true) }; $child.Dispose() }
            $state.Busy = $false
        }
        $state.ExitCode = if ($ok) { 0 } else { 2 }
        $message = if ($ok) { 'PASS: solo 0001 aplicada y esquema/historial verificados. No se continuara a 0002.' } else { 'Detenido: revisaremos evidencia depurada. No repetir ni continuar a otras migraciones.' }
        [void][Windows.Forms.MessageBox]::Show($form, $message, 'Kuwago - Resultado sin secretos', [Windows.Forms.MessageBoxButtons]::OK, [Windows.Forms.MessageBoxIcon]::Information)
        $form.Close()
    })
    [void]$form.ShowDialog()
} catch { $state.ExitCode = 2 }
finally { if ($null -ne $tokenBox) { $tokenBox.Clear() }; if ($null -ne $form) { $form.Dispose() } }
exit $state.ExitCode
