#Requires -Version 7.0
# Reuses the hidden WinForms + redirected stdin + owned clipboard cleanup pattern.
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$form = $null
$jwtBox = $null
$state = @{ Busy = $false; ExitCode = 2 }
try {
    if (-not $IsWindows -or [Threading.Thread]::CurrentThread.ApartmentState -ne 'STA' -or $args.Count) { throw 'windows_sta_required' }
    Import-Module (Join-Path $PSScriptRoot 'recovery-key-core.psm1') -Force -DisableNameChecking
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $form = [Windows.Forms.Form]::new()
    $form.Text = 'Kuwago - Verificar identidad Access (sin escrituras)'
    $form.ClientSize = [Drawing.Size]::new(780, 350)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.TopMost = $true
    $form.ShowInTaskbar = $true
    $intro = [Windows.Forms.Label]::new()
    $intro.SetBounds(20, 15, 740, 105)
    $intro.Text = "Solo JWT de la aplicacion Kuwago DEV ya autenticada.`nVerifica firma, issuer, AUD, fechas, subject y correo designados.`nUnicamente consulta JWKS publico del equipo. No consulta ni escribe D1.`nNo acepta tokens API D1. Nunca pegues JWT/cookies/codigos en Codex.`nEl portapapeles puede ser observado o sincronizado por otras aplicaciones."
    $form.Controls.Add($intro)
    $jwtBox = [Windows.Forms.TextBox]::new()
    $jwtBox.SetBounds(20, 135, 740, 28)
    $jwtBox.UseSystemPasswordChar = $true
    $jwtBox.MaxLength = 16384
    $jwtBox.AccessibleName = 'JWT vigente de Kuwago DEV, campo oculto local'
    $form.Controls.Add($jwtBox)
    $run = [Windows.Forms.Button]::new()
    $run.SetBounds(20, 190, 370, 38)
    $run.Text = 'Verificar identidad sin escrituras'
    $form.Controls.Add($run)
    $cancel = [Windows.Forms.Button]::new()
    $cancel.SetBounds(425, 190, 250, 38)
    $cancel.Text = 'Cancelar y cerrar'
    $cancel.Add_Click({ $form.Close() })
    $form.Controls.Add($cancel)
    $status = [Windows.Forms.Label]::new()
    $status.SetBounds(20, 255, 740, 65)
    $status.Text = 'Nada se verifica hasta pulsar el boton. Al terminar se conserva solo evidencia depurada.'
    $form.Controls.Add($status)
    $form.Add_Shown({ $form.Activate(); $form.BringToFront() })
    $form.Add_FormClosing({ param($sender, $eventArgs) if ($state.Busy) { $eventArgs.Cancel = $true } })
    $run.Add_Click({
        if ($jwtBox.Text -cnotmatch '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$') { $status.Text = 'Formato no valido. Revisa privadamente, sin enviar el contenido al chat.'; return }
        $state.Busy = $true
        $run.Enabled = $false
        $cancel.Enabled = $false
        $status.Text = 'Verificando JWT con JWKS del equipo. Sin D1 ni bootstrap.'
        $form.Refresh()
        $jwt = $null
        $request = $null
        $child = $null
        $started = $false
        $ok = $false
        try {
            $jwt = $jwtBox.Text
            $jwtBox.Clear()
            $start = [Diagnostics.ProcessStartInfo]::new()
            $start.FileName = @(Get-Command node.exe -CommandType Application -ErrorAction Stop)[0].Source
            $start.ArgumentList.Add((Join-Path $PSScriptRoot 'verify-bootstrap-jwt-private.mjs'))
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
            $request = @{ jwt = $jwt } | ConvertTo-Json -Compress
            $child.StandardInput.Write($request)
            $child.StandardInput.Close()
            $null = Clear-KuwagoOwnedClipboard -ExpectedText $jwt -ReadText { [Windows.Forms.Clipboard]::GetText() } -Clear { [Windows.Forms.Clipboard]::Clear() }
            $request = $null
            $jwt = $null
            if (-not $child.WaitForExit(45000)) { $child.Kill($true); throw 'identity_not_confirmed' }
            $summary = $child.StandardOutput.ReadToEnd() | ConvertFrom-Json
            $ok = ($child.ExitCode -eq 0 -and $summary.status -ceq 'PASS')
        } catch { $ok = $false }
        finally {
            $jwt = $null
            $request = $null
            $jwtBox.Clear()
            if ($null -ne $child) { if ($started -and -not $child.HasExited) { $child.Kill($true) }; $child.Dispose() }
            $state.Busy = $false
        }
        $state.ExitCode = if ($ok) { 0 } else { 2 }
        $message = if ($ok) { 'PASS: firma e identidad verificadas. Evidencia sin token; ninguna escritura habilitada.' } else { 'FAIL: identidad no confirmada. No repetir automaticamente ni enviar el JWT al chat.' }
        [void][Windows.Forms.MessageBox]::Show($form, $message, 'Kuwago - Resultado sin secretos', [Windows.Forms.MessageBoxButtons]::OK, [Windows.Forms.MessageBoxIcon]::Information)
        $form.Close()
    })
    [void]$form.ShowDialog()
} catch { $state.ExitCode = 2 }
finally { if ($null -ne $jwtBox) { $jwtBox.Clear() }; if ($null -ne $form) { $form.Dispose() } }
exit $state.ExitCode
