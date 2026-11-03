#Requires -Version 7.0
# Manual launch only: pwsh -NoProfile -STA -File ./scripts/recovery-key-generator.ps1
# No automatic generation: only the explicit Generate button calls the OS CSPRNG.
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$form = $null
$keyBox = $null
$revealTimer = $null
$clipboardTimer = $null
$state = @{ Key = $null; Copied = $false; Streams = @() }

try {
    if (-not $IsWindows -or [Threading.Thread]::CurrentThread.ApartmentState -ne 'STA' -or $args.Count -ne 0) { throw 'windows_sta_required' }
    Import-Module (Join-Path $PSScriptRoot 'recovery-key-core.psm1') -Force -DisableNameChecking
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [Windows.Forms.Application]::EnableVisualStyles()
    $form = [Windows.Forms.Form]::new()
    $form.Text = 'Kuwago - Clave privada de recuperacion D1'
    $form.ClientSize = [Drawing.Size]::new(740, 490)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.AutoScaleMode = 'Dpi'
    $form.ShowInTaskbar = $true

    $intro = [Windows.Forms.Label]::new()
    $intro.SetBounds(24, 20, 690, 72)
    $intro.Text = "Operacion exclusivamente local. No guarda archivos ni conecta a Cloudflare.`nGenera una sola clave de 32 bytes aleatorios, Base64 estandar (44 caracteres).`nGuardala personalmente en tu gestor cifrado; no la compartas con Codex."
    $form.Controls.Add($intro)
    $generate = [Windows.Forms.Button]::new()
    $generate.SetBounds(24, 99, 220, 36)
    $generate.Text = 'Generar clave privada'
    $generate.AccessibleName = 'Generar una clave mediante el sistema operativo'
    $form.Controls.Add($generate)
    $keyBox = [Windows.Forms.TextBox]::new()
    $keyBox.SetBounds(24, 154, 690, 30)
    $keyBox.ReadOnly = $true
    $keyBox.UseSystemPasswordChar = $true
    $keyBox.ShortcutsEnabled = $false
    $keyBox.AccessibleName = 'Clave de recuperacion, oculta por defecto'
    $keyBox.Font = [Drawing.Font]::new('Consolas', 12)
    $form.Controls.Add($keyBox)
    $reveal = [Windows.Forms.Button]::new()
    $reveal.SetBounds(24, 197, 220, 34)
    $reveal.Text = 'Mostrar durante 15 segundos'
    $reveal.Enabled = $false
    $form.Controls.Add($reveal)
    $warning = [Windows.Forms.Label]::new()
    $warning.SetBounds(24, 246, 690, 56)
    $warning.Text = "El portapapeles puede ser leido por otras aplicaciones o sincronizarse.`nDesactiva historial/sincronizacion y cualquier grabacion antes de copiar."
    $form.Controls.Add($warning)
    $consent = [Windows.Forms.CheckBox]::new()
    $consent.SetBounds(24, 306, 690, 30)
    $consent.Text = 'Entiendo el riesgo; pegare la clave solo en mi gestor de contrasenas.'
    $form.Controls.Add($consent)
    $copy = [Windows.Forms.Button]::new()
    $copy.SetBounds(24, 344, 210, 36)
    $copy.Text = 'Copiar al gestor'
    $copy.Enabled = $false
    $form.Controls.Add($copy)
    $clear = [Windows.Forms.Button]::new()
    $clear.SetBounds(249, 344, 230, 36)
    $clear.Text = 'Borrar mi clave del portapapeles'
    $clear.Enabled = $false
    $form.Controls.Add($clear)
    $close = [Windows.Forms.Button]::new()
    $close.SetBounds(494, 344, 220, 36)
    $close.Text = 'Finalizar y cerrar'
    $form.Controls.Add($close)
    $status = [Windows.Forms.Label]::new()
    $status.SetBounds(24, 400, 690, 66)
    $status.Text = 'No se ha generado ninguna clave. Esta ventana no acredita custodia externa.'
    $status.AccessibleName = 'Estado de la operacion local'
    $form.Controls.Add($status)

    $revealTimer = [Windows.Forms.Timer]::new()
    $revealTimer.Interval = 15000
    $clipboardTimer = [Windows.Forms.Timer]::new()
    $clipboardTimer.Interval = 45000
    function Hide-RecoveryText {
        $revealTimer.Stop()
        $keyBox.UseSystemPasswordChar = $true
        $reveal.Text = 'Mostrar durante 15 segundos'
    }
    function Clear-OwnedRecoveryClipboard {
        $clipboardTimer.Stop()
        if (-not $state.Copied) { return 'not_owned' }
        $result = Clear-KuwagoOwnedClipboard -ExpectedText $state.Key -ReadText { [Windows.Forms.Clipboard]::GetText() } -Clear { [Windows.Forms.Clipboard]::Clear() }
        if ($result -ne 'unavailable') {
            $state.Copied = $false
            foreach ($stream in $state.Streams) { $stream.Dispose() }
            $state.Streams = @()
            $clear.Enabled = $false
        }
        return $result
    }
    $generate.Add_Click({
        if ($null -ne $state.Key) { return }
        $bytes = [byte[]]::new(32)
        $candidate = $null
        $rng = $null
        try {
            # OS-backed .NET CSPRNG, never System.Random/Get-Random or a phrase.
            $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
            $rng.GetBytes($bytes)
            $candidate = ConvertTo-KuwagoRecoveryText -Bytes $bytes
            if (-not (Test-KuwagoRecoveryWithVerifier -Text $candidate)) { throw 'verifier_rejected' }
            $state.Key = $candidate
            $keyBox.Text = $state.Key
            $generate.Enabled = $false
            $reveal.Enabled = $true
            $copy.Enabled = $consent.Checked
            $status.Text = 'Formato aceptado por el validador compartido. Aun no se ha guardado ni verificado custodia externa.'
        } catch {
            $state.Key = $null
            $keyBox.Clear()
            $status.Text = 'No se pudo generar o validar la clave. No se guardo ni copio ningun valor.'
        } finally {
            [Array]::Clear($bytes, 0, $bytes.Length)
            $candidate = $null
            if ($null -ne $rng) { $rng.Dispose() }
        }
    })
    $reveal.Add_Click({
        if ($null -eq $state.Key) { return }
        if (-not $keyBox.UseSystemPasswordChar) { Hide-RecoveryText; return }
        $keyBox.UseSystemPasswordChar = $false
        $reveal.Text = 'Ocultar ahora'
        $revealTimer.Start()
    })
    $revealTimer.Add_Tick({ Hide-RecoveryText })
    $form.Add_Deactivate({ Hide-RecoveryText })
    $consent.Add_CheckedChanged({ $copy.Enabled = ($consent.Checked -and $null -ne $state.Key) })
    $copy.Add_Click({
        if (-not $consent.Checked -or $null -eq $state.Key) { return }
        try {
            # Keep metadata streams alive until clipboard ownership ends.
            $data = [Windows.Forms.DataObject]::new()
            $data.SetText($state.Key, [Windows.Forms.TextDataFormat]::UnicodeText)
            $history = [IO.MemoryStream]::new([byte[]]@(0, 0, 0, 0))
            $cloud = [IO.MemoryStream]::new([byte[]]@(0, 0, 0, 0))
            $data.SetData('CanIncludeInClipboardHistory', $history)
            $data.SetData('CanUploadToCloudClipboard', $cloud)
            # Do not persist after exit; no automatic clipboard-write retries.
            [Windows.Forms.Clipboard]::SetDataObject($data, $false, 0, 0)
            foreach ($old in $state.Streams) { $old.Dispose() }
            $state.Streams = @($history, $cloud)
            $state.Copied = $true
            $clear.Enabled = $true
            $clipboardTimer.Stop()
            $clipboardTimer.Start()
            Hide-RecoveryText
            $status.Text = 'Copia temporal lista. Pegala en el campo secreto del gestor y borra el portapapeles. Borrado previsto en 45 s.'
        } catch {
            $status.Text = 'No se pudo confirmar la copia. Revisa y borra el portapapeles antes de finalizar.'
            # A partial native operation may have changed clipboard contents.
            $state.Copied = $true
            $clear.Enabled = $true
        }
    })
    $clear.Add_Click({
        $result = Clear-OwnedRecoveryClipboard
        $status.Text = switch ($result) {
            'cleared' { 'La copia actual de la clave se borro del portapapeles. Comprueba por separado el guardado en el gestor.' }
            'changed' { 'El portapapeles ya contiene otro elemento; no se borro ese contenido.' }
            'unavailable' { 'Portapapeles ocupado: no se confirma el borrado. Cierra la aplicacion que lo bloquea e intenta borrar de nuevo.' }
            default { 'Esta ventana no tiene una copia pendiente en el portapapeles.' }
        }
    })
    $clipboardTimer.Add_Tick({
        $result = Clear-OwnedRecoveryClipboard
        $status.Text = if ($result -eq 'unavailable') { 'No se pudo borrar automaticamente. Usa Borrar mi clave del portapapeles antes de cerrar.' } else { 'Finalizo la copia temporal. No se ha comprobado el guardado en el gestor.' }
    })
    $close.Add_Click({ $form.Close() })
    $form.Add_FormClosing({
        param($sender, $eventArgs)
        Hide-RecoveryText
        if ($null -ne $state.Key) {
            $answer = [Windows.Forms.MessageBox]::Show($form, 'Cerrar descarta esta copia en memoria. Confirma que la guardaste en tu gestor o que deseas descartarla.', 'Finalizar operacion privada', [Windows.Forms.MessageBoxButtons]::OKCancel, [Windows.Forms.MessageBoxIcon]::Warning)
            if ($answer -ne [Windows.Forms.DialogResult]::OK) { $eventArgs.Cancel = $true; return }
        }
        if ((Clear-OwnedRecoveryClipboard) -eq 'unavailable') {
            $eventArgs.Cancel = $true
            $status.Text = 'No se pudo limpiar el portapapeles. Libera el bloqueo y usa el boton de borrado antes de cerrar.'
            return
        }
        $keyBox.Clear()
        $state.Key = $null
    })
    [void]$form.ShowDialog()
} catch {
    # Sanitized failure only; no exception details or key on stdout/stderr.
    Write-Output 'Generador no iniciado o cerrado con error. Requiere Windows, PowerShell 7 STA y Node local.'
    exit 2
} finally {
    if ($null -ne $revealTimer) { $revealTimer.Stop(); $revealTimer.Dispose() }
    if ($null -ne $clipboardTimer) { $clipboardTimer.Stop(); $clipboardTimer.Dispose() }
    if ($state.Copied -and $null -ne $state.Key) {
        try { if ([Windows.Forms.Clipboard]::GetText() -ceq $state.Key) { [Windows.Forms.Clipboard]::Clear() } } catch { }
    }
    foreach ($stream in $state.Streams) { $stream.Dispose() }
    $state.Streams = @()
    if ($null -ne $keyBox) { $keyBox.Clear() }
    $state.Key = $null
    if ($null -ne $form) { $form.Dispose() }
}
