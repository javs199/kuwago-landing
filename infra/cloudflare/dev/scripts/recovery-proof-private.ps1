#Requires -Version 7.0
param([Parameter(Mandatory = $true)][ValidateSet('Encrypt', 'Restore')][string]$Stage,
      [Parameter(Mandatory = $true)][ValidatePattern('^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')][string]$OperationId)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$form = $null
$keyBox = $null
$state = @{ ExitCode = 2; Busy = $false }
try {
    if (-not $IsWindows -or [Threading.Thread]::CurrentThread.ApartmentState -ne 'STA') { throw 'windows_sta_required' }
    Import-Module (Join-Path $PSScriptRoot 'recovery-key-core.psm1') -Force -DisableNameChecking
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $form = [Windows.Forms.Form]::new()
    $form.Text = if ($Stage -eq 'Encrypt') { 'Kuwago - Sesion 1: cifrar prueba sintetica' } else { 'Kuwago - Sesion 2: recuperar desde el gestor' }
    $form.ClientSize = [Drawing.Size]::new(710, 340)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.ShowInTaskbar = $true
    $form.TopMost = $true
    $label = [Windows.Forms.Label]::new()
    $label.SetBounds(22, 20, 666, 82)
    $label.Text = if ($Stage -eq 'Encrypt') {
        "Introduce la clave YA guardada en tu gestor. No se generara una nueva.`nSolo se cifraran datos sinteticos, sin informacion real ni Cloudflare.`nEntrada oculta: no captures la ventana ni pegues la clave en Codex."
    } else {
        "La primera sesion ha terminado. Recupera DE NUEVO la entrada del gestor.`nIntroduce la misma clave: restauracion SQLite aislada, sin DPAPI ni red.`nNo reutilices una copia del primer proceso. No compartas el secreto."
    }
    $form.Controls.Add($label)
    $keyBox = [Windows.Forms.TextBox]::new()
    $keyBox.SetBounds(22, 110, 666, 28)
    $keyBox.UseSystemPasswordChar = $true
    $keyBox.MaxLength = 44
    $keyBox.AccessibleName = 'Clave de recuperacion desde el gestor, entrada oculta'
    $form.Controls.Add($keyBox)
    $confirm = [Windows.Forms.CheckBox]::new()
    $confirm.SetBounds(22, 150, 666, 38)
    $confirm.Text = if ($Stage -eq 'Encrypt') { 'Esta es mi clave existente, recuperada de la entrada del gestor.' } else { 'He recuperado nuevamente la clave desde el gestor para esta segunda sesion.' }
    $form.Controls.Add($confirm)
    $run = [Windows.Forms.Button]::new()
    $run.SetBounds(22, 200, 310, 36)
    $run.Text = if ($Stage -eq 'Encrypt') { 'Cifrar prueba y cerrar esta sesion' } else { 'Restaurar y verificar datos sinteticos' }
    $form.Controls.Add($run)
    $close = [Windows.Forms.Button]::new()
    $close.SetBounds(355, 200, 220, 36)
    $close.Text = 'Cancelar y cerrar'
    $close.Add_Click({ $form.Close() })
    $form.Controls.Add($close)
    $status = [Windows.Forms.Label]::new()
    $status.SetBounds(22, 250, 666, 70)
    $status.Text = 'Una sola ejecucion. No se imprime ni guarda la clave. La copia coincidente del portapapeles se limpiara al enviar.'
    $form.Controls.Add($status)
    $form.Add_FormClosing({ param($sender, $eventArgs) if ($state.Busy) { $eventArgs.Cancel = $true } })
    $run.Add_Click({
        if (-not $confirm.Checked -or $keyBox.Text.Length -ne 44) { $status.Text = 'Introduce la clave completa y confirma su procedencia; no la generes nuevamente.'; return }
        $run.Enabled = $false
        $close.Enabled = $false
        $state.Busy = $true
        $privateText = $null
        $request = $null
        $child = $null
        $started = $false
        $ok = $false
        try {
            $privateText = $keyBox.Text
            $keyBox.Clear()
            $start = [Diagnostics.ProcessStartInfo]::new()
            $start.FileName = @(Get-Command node -CommandType Application -ErrorAction Stop)[0].Source
            $start.ArgumentList.Add((Join-Path $PSScriptRoot 'd1-recovery-proof-stage.mjs'))
            $start.ArgumentList.Add($Stage)
            $start.ArgumentList.Add($OperationId)
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
            $request = @{ recoverySecretBase64 = $privateText } | ConvertTo-Json -Compress
            $child.StandardInput.Write($request)
            $child.StandardInput.Close()
            $request = $null
            if (-not $child.WaitForExit(30000)) { $child.Kill($true); throw 'timeout' }
            if ($child.ExitCode -ne 0) { throw 'verification_failed' }
            $result = $child.StandardOutput.ReadToEnd() | ConvertFrom-Json
            $expected = if ($Stage -eq 'Encrypt') { 'ENCRYPTED' } else { 'PASS' }
            if ($result.status -cne $expected -or $result.operationId -cne $OperationId -or $result.stage -cne $Stage) { throw 'result_invalid' }
            $ok = $true
        } catch {
            $status.Text = 'FAIL: no se completo esta etapa. No hay reintento automatico. Cierra para revisar el resultado depurado.'
        } finally {
            $cleanup = Clear-KuwagoOwnedClipboard -ExpectedText $privateText -ReadText { [Windows.Forms.Clipboard]::GetText() } -Clear { [Windows.Forms.Clipboard]::Clear() }
            if ($cleanup -eq 'unavailable') { $ok = $false; $status.Text = 'No se confirmo limpieza del portapapeles. Limpialo personalmente y cancela; no se abrira la siguiente sesion.' }
            $request = $null
            $privateText = $null
            $keyBox.Clear()
            if ($null -ne $child) {
                if ($started -and -not $child.HasExited) { $child.Kill($true) }
                $child.Dispose()
            }
            $state.Busy = $false
            $close.Enabled = $true
        }
        if ($ok) {
            $state.ExitCode = 0
            $message = if ($Stage -eq 'Encrypt') { 'Cifrado sintetico creado. Esta sesion se cerrara antes de pedir nuevamente la clave desde el gestor.' } else { 'PASS: descifrado y restauracion exacta de una tabla y dos filas sinteticas, sin DPAPI.' }
            [void][Windows.Forms.MessageBox]::Show($form, $message, 'Kuwago - Resultado sin secretos', [Windows.Forms.MessageBoxButtons]::OK, [Windows.Forms.MessageBoxIcon]::Information)
            $form.Close()
        }
    })
    [void]$form.ShowDialog()
} catch {
    # No raw exception, input, clipboard, or key output.
    $state.ExitCode = 2
} finally {
    if ($null -ne $keyBox) { $keyBox.Clear() }
    if ($null -ne $form) { $form.Dispose() }
}
exit $state.ExitCode
