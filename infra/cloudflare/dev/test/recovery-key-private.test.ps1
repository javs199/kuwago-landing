#Requires -Version 7.0
# Deterministic synthetic vectors only. Never imports or opens the generator UI.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$bytes = [byte[]](0..31)
$text = $null
$checks = 0
function Assert-PrivateTest([bool]$Condition) {
    if (-not $Condition) { throw 'synthetic_test_failed' }
    $script:checks++
}
try {
    Import-Module (Join-Path $PSScriptRoot '../scripts/recovery-key-core.psm1') -Force -DisableNameChecking
    $text = ConvertTo-KuwagoRecoveryText -Bytes $bytes
    Assert-PrivateTest ($text.Length -eq 44 -and $text.EndsWith('='))
    Assert-PrivateTest ([Convert]::ToHexString([Convert]::FromBase64String($text)) -ceq [Convert]::ToHexString($bytes))
    Assert-PrivateTest (Test-KuwagoRecoveryWithVerifier -Text $text)
    Assert-PrivateTest (-not (Test-KuwagoRecoveryWithVerifier -Text ($text + "`n")))
    Assert-PrivateTest (-not (Test-KuwagoRecoveryWithVerifier -Text (('A' * 42) + 'B=')))
    foreach ($length in @(31, 33)) {
        $rejected = $false
        try { $null = ConvertTo-KuwagoRecoveryText -Bytes ([byte[]]::new($length)) } catch { $rejected = $true }
        Assert-PrivateTest $rejected
    }
    $clipboard = @{ Text = $text; Clears = 0 }
    $result = Clear-KuwagoOwnedClipboard -ExpectedText $text -ReadText { $clipboard.Text } -Clear { $clipboard.Text = ''; $clipboard.Clears++ }
    Assert-PrivateTest ($result -ceq 'cleared' -and $clipboard.Clears -eq 1 -and $clipboard.Text -ceq '')
    $clipboard.Text = 'another synthetic clipboard item'
    $result = Clear-KuwagoOwnedClipboard -ExpectedText $text -ReadText { $clipboard.Text } -Clear { $clipboard.Clears++ }
    Assert-PrivateTest ($result -ceq 'changed' -and $clipboard.Clears -eq 1)
    $result = Clear-KuwagoOwnedClipboard -ExpectedText $text -ReadText { throw 'simulated clipboard lock' } -Clear { $clipboard.Clears++ }
    Assert-PrivateTest ($result -ceq 'unavailable' -and $clipboard.Clears -eq 1)
    $result = Clear-KuwagoOwnedClipboard -ExpectedText $null -ReadText { throw 'must not read' } -Clear { throw 'must not clear' }
    Assert-PrivateTest ($result -ceq 'not_owned')
    foreach ($file in @('../scripts/recovery-key-generator.ps1', '../scripts/recovery-key-core.psm1')) {
        $tokens = $null
        $errors = $null
        $null = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $file), [ref]$tokens, [ref]$errors)
        Assert-PrivateTest ($errors.Count -eq 0)
    }
    @{ status = 'synthetic_private_tests_passed'; checks = $checks; windowOpened = $false; productionGeneratorCalled = $false } | ConvertTo-Json -Compress
} catch {
    @{ status = 'synthetic_private_tests_failed'; checks = $checks; line = $_.InvocationInfo.ScriptLineNumber; errorType = $_.Exception.GetType().Name } | ConvertTo-Json -Compress
    exit 2
} finally {
    [Array]::Clear($bytes, 0, $bytes.Length)
    $text = $null
}
