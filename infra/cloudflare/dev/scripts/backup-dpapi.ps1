# Pipe-only binary key wrapping. No credential arguments/files/history, no external error messages.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$plain=$null;$wrapped=$null
try {
    if([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne 'S-1-5-21-1786902297-2290887561-850712940-1001'){throw 'identity'}
    Add-Type -AssemblyName System.Security
    $inputText=[Console]::In.ReadToEnd()
    if($inputText.Length -gt 16384){throw 'input'}
    $request=$inputText|ConvertFrom-Json;$inputText=$null
    $plain=[Convert]::FromBase64String($request.data)
    $entropy=[Text.Encoding]::UTF8.GetBytes('Kuwago:D1Backup:1:c5cfbe44-4fd0-4c2a-83c1-b833935534ba')
    if($request.action -eq 'protect'){
        if($plain.Length -ne 32){throw 'key_length'}
        $wrapped=[Security.Cryptography.ProtectedData]::Protect($plain,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    } elseif($request.action -eq 'unprotect'){
        $wrapped=[Security.Cryptography.ProtectedData]::Unprotect($plain,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        if($wrapped.Length -ne 32){throw 'key_length'}
    } else {throw 'action'}
    @{ok=$true;data=[Convert]::ToBase64String($wrapped)}|ConvertTo-Json -Compress
} catch { @{ok=$false}|ConvertTo-Json -Compress;exit 2 }
finally {if($null -ne $plain){[Array]::Clear($plain,0,$plain.Length)};if($null -ne $wrapped){[Array]::Clear($wrapped,0,$wrapped.Length)};$request=$null}
