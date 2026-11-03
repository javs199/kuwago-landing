param([ValidateSet('Inspect','Prepare','Verify')][string]$Mode='Verify')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root='C:\Users\JV\AppData\Local\Kuwago\D1Backups\development'
$operatorSid='S-1-5-21-1786902297-2290887561-850712940-1001'
$systemSid='S-1-5-18'
try {
    $current=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    if($current -ne $operatorSid){throw 'operator_mismatch'}
    if(([System.IO.DriveInfo]::new('C:\')).DriveFormat -ne 'NTFS'){throw 'ntfs_required'}
    $walk=$root
    while($walk){
        if(Test-Path -LiteralPath $walk){if(((Get-Item -LiteralPath $walk -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'reparse_forbidden'}}
        $walk=Split-Path -Parent $walk
    }
    foreach($name in @('OneDrive','OneDriveConsumer','OneDriveCommercial')){
        $sync=[Environment]::GetEnvironmentVariable($name)
        if($sync -and ($root -eq $sync -or $root.StartsWith($sync.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase))){throw 'sync_location_forbidden'}
    }
    foreach($share in @(Get-CimInstance Win32_Share -ErrorAction Stop)){
        if($share.Type -eq 0 -and $share.Path -and ($root -eq $share.Path -or $root.StartsWith($share.Path.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase))){throw 'ordinary_share_forbidden'}
    }
    $parent=$root
    while(-not (Test-Path -LiteralPath $parent)){$parent=Split-Path -Parent $parent}
    if($Mode -eq 'Inspect'){
        $acl=Get-Acl -LiteralPath $parent
        @{ok=$true;path=$root;exists=(Test-Path -LiteralPath $root);nearestParent=$parent;parentSddl=$acl.Sddl;operatorSid=$current}|ConvertTo-Json -Compress
        exit 0
    }
    $parentBefore=(Get-Acl -LiteralPath $parent).Sddl
    $created=$false
    if($Mode -eq 'Prepare' -and -not (Test-Path -LiteralPath $root)){
        [void][IO.Directory]::CreateDirectory($root);$created=$true
        $acl=New-Object Security.AccessControl.DirectorySecurity
        $acl.SetOwner([Security.Principal.SecurityIdentifier]::new($operatorSid))
        $acl.SetAccessRuleProtection($true,$false)
        foreach($sid in @($operatorSid,$systemSid)){
            $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
            $acl.AddAccessRule($rule)
        }
        Set-Acl -LiteralPath $root -AclObject $acl
    }
    if(-not (Test-Path -LiteralPath $root -PathType Container)){throw 'custody_missing'}
    $actual=Get-Acl -LiteralPath $root
    if(-not $actual.AreAccessRulesProtected -or $actual.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $operatorSid){throw 'custody_acl_unsafe'}
    $rules=@($actual.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
    if($rules.Count -ne 2){throw 'custody_acl_unsafe'}
    foreach($sid in @($operatorSid,$systemSid)){
        $matching=@($rules|Where-Object {$_.IdentityReference.Value -eq $sid -and $_.AccessControlType -eq 'Allow' -and -not $_.IsInherited -and $_.FileSystemRights -eq [Security.AccessControl.FileSystemRights]::FullControl -and $_.InheritanceFlags -eq [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'})
        if($matching.Count -ne 1){throw 'custody_acl_unsafe'}
    }
    $unchanged=($parent -eq $root) -or ((Get-Acl -LiteralPath $parent).Sddl -eq $parentBefore)
    if(-not $unchanged){throw 'parent_acl_changed'}
    @{ok=$true;path=$root;operatorSid=$current;aclProtected=$true;allowedSids=@($operatorSid,$systemSid);created=$created;parentAclUnchanged=$unchanged;ntfs=$true;knownSyncPathsExcluded=$true;ordinarySharesExcluded=$true}|ConvertTo-Json -Compress
} catch { @{ok=$false;status='custody_not_verified';line=$_.InvocationInfo.ScriptLineNumber;errorType=$_.Exception.GetType().Name}|ConvertTo-Json -Compress;exit 2 }
