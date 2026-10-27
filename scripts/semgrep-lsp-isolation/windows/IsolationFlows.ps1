# 적용·검증·복구의 본문. 진입 스크립트(Initialize-Isolation / Test-IsolationEffect / Remove-Isolation)는 파라미터만 받아 이 함수를 부르고 종료 코드로 끝난다.
# 본문을 함수로 둔 이유: 모의 시스템(tests/MockSystem.ps1) 위에서 세 진입 경로를 실제 Windows 를 바꾸지 않고 끝까지 시험하기 위해서다.
# 이 파일도 불러오는 것만으로는 시스템 상태를 바꾸지 않는다. 변경 호출은 Invoke-Mutation 안에서만 한다(Test-IsolationScripts.ps1 이 구조로 검사한다).
# 각 함수는 exit 하지 않고 @{ exitCode = <정수>; ... } 를 돌려준다.
Set-StrictMode -Version 2.0
$Script:IsoScriptDir = $PSScriptRoot
$Script:IsoProbeArtifacts = @('parent-self.json', 'parent-child.json', 'parent-done.json', 'child-result.json', 'control-result.json', 'targets.json', 'control-targets.json', 'venv-python.txt')

function New-IsoRefusal {
    param([string]$Message)
    Write-IsoLog -Level 'REFUSED' -Message $Message
    @{ exitCode = 30; reason = $Message }
}

# ══ 적용 ═════════════════════════════════════════════════════════════════════
# 종료 코드: 0 정상(dry-run 포함) / 20 적용 중 실패(되돌림 완료) / 21 적용 중 실패(되돌림도 불완전) / 30 거부
function Invoke-IsoApply {
    param(
        [Parameter(Mandatory)][string]$PreflightDir, [string]$ConfirmSnapshot, [bool]$Apply = $false,
        [string[]]$GrantReadExecute = @(), [string]$RemoteScope = 'NonLoopback'
    )
    $Script:IsoRunDir = (Resolve-Path -LiteralPath $PreflightDir).Path
    $Script:ApplyMode = $Apply
    # powershell.exe -File 로 부르면 배열 인자가 쉼표로 붙은 문자열 하나로 들어온다. 경로에 쉼표를 쓰지 않는다는 전제로 나눈다.
    $GrantReadExecute = @($GrantReadExecute | ForEach-Object { $_ -split ',' } | Where-Object { $_ -and $_.Trim() } | ForEach-Object { $_.Trim() })
    $pfFile = Join-Path $Script:IsoRunDir 'preflight.json'
    if (-not (Test-Path -LiteralPath $pfFile)) { return (New-IsoRefusal 'preflight.json 이 없다. Invoke-IsolationPreflight.ps1 을 먼저 실행한다.') }
    $pf = Read-IsoJson -Path $pfFile
    $runId = [string]$pf.runId
    $names = Get-IsoNames -RunId $runId
    $manifestFile = Join-Path $Script:IsoRunDir 'resources.json'
    $modeText = 'DRY-RUN(계획만, 아무것도 바꾸지 않음)'; if ($Apply) { $modeText = 'APPLY(실제 적용)' }
    Write-IsoLog -Level 'INFO' -Message ("모드: {0}  runId={1}" -f $modeText, $runId)

    if ($Apply) {
        if (-not (Test-IsElevated)) { return (New-IsoRefusal '관리자 권한이 필요하다.') }
        if (@($pf.applyBlockers).Count -gt 0) { return (New-IsoRefusal ('사전 점검의 적용 차단 항목이 남아 있다: ' + (@($pf.applyBlockers) -join ', '))) }
        $hash = Get-FileSha256Hex -Path $pfFile
        if (-not $ConfirmSnapshot -or $ConfirmSnapshot.Length -lt 12 -or -not $hash.StartsWith($ConfirmSnapshot, [StringComparison]::OrdinalIgnoreCase)) {
            return (New-IsoRefusal "ConfirmSnapshot 이 preflight.json 의 SHA-256 앞부분과 다르다(검토한 스냅숏이 아니다). 기대 앞 12자리: $($hash.Substring(0, 12))")
        }
        if (Test-Path -LiteralPath $manifestFile) { return (New-IsoRefusal 'resources.json 이 이미 있다. 이 RunId 는 한 번만 적용한다. 새 사전 점검을 하거나 Remove-Isolation.ps1 로 정리한다.') }
        # 사전 점검 이후 상태가 바뀌었는지 다시 본다: 이름이 겹치는 자원이 없어야 한다.
        if (Get-NetFirewallRule -Name $names.RuleName -ErrorAction SilentlyContinue) { return (New-IsoRefusal "같은 이름의 방화벽 규칙이 이미 있다: $($names.RuleName)") }
        if (Get-LocalUser -Name $names.UserName -ErrorAction SilentlyContinue) { return (New-IsoRefusal "같은 이름의 계정이 이미 있다: $($names.UserName)") }
        if (Test-Path -LiteralPath $names.WorkDir) { return (New-IsoRefusal "같은 이름의 작업 폴더가 이미 있다: $($names.WorkDir)") }
    }
    $winDir = [IO.Path]::GetFullPath($env:WINDIR).TrimEnd('\')
    foreach ($g in $GrantReadExecute) {
        if (-not (Test-Path -LiteralPath $g)) { return (New-IsoRefusal "권한을 줄 경로가 없다: $g") }
        $full = [IO.Path]::GetFullPath($g).TrimEnd('\')
        if ($full.Length -le 3 -or $full.StartsWith($winDir, [StringComparison]::OrdinalIgnoreCase)) { return (New-IsoRefusal "드라이브 루트나 Windows 폴더에는 권한을 주지 않는다: $g") }
    }

    $remote = @('Any')
    if ($RemoteScope -eq 'NonLoopback') { $remote = @('0.0.0.0-126.255.255.255', '128.0.0.0-255.255.255.255', '::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff') }
    Write-IsoLog -Level 'INFO' -Message "만들 이름: 계정=$($names.UserName) 규칙=$($names.RuleName) 작업폴더=$($names.WorkDir)"
    Write-IsoLog -Level 'INFO' -Message ("차단 범위(RemoteAddress): {0}  — 루프백(127.0.0.0/8, ::1)은 차단 대상에서 뺀다. 이 범위 문법의 수용 여부와 실제 효과는 적용 뒤 읽기·관측으로 확인한다" -f ($remote -join ', '))

    $manifest = New-IsoManifest -RunId $runId
    $manifest.status = 'applying'
    $manifest.names = $names
    Save-IsoManifest

    $sid = '<새 계정 SID>'
    $sidObj = $null
    try {
        # 1) 계정
        $userStep = Add-IsoStep -Kind 'user' -Name $names.UserName -Detail @{ marker = $names.Marker }
        $pw = New-IsoRandomPassword
        $secure = ConvertTo-SecureString -String $pw -AsPlainText -Force
        $pw = $null
        $u = Invoke-Mutation -Description "로컬 계정 만들기(Users 그룹만, 만든 직후 비활성화): $($names.UserName)" -Action {
            $acct = New-LocalUser -Name $names.UserName -Password $secure -Description $names.Marker -PasswordNeverExpires -UserMayNotChangePassword -AccountNeverExpires -ErrorAction Stop
            Add-LocalGroupMember -SID ([Security.Principal.SecurityIdentifier]$Script:SidUsers) -Member $acct.Name -ErrorAction Stop
            Disable-LocalUser -Name $acct.Name -ErrorAction Stop
            $acct
        }
        if ($Apply) {
            $sid = $u.SID.Value
            $sidObj = New-Object Security.Principal.SecurityIdentifier($sid)
            Complete-IsoStep -Step $userStep -Extra @{ sid = $sid; enabled = $false }
            # 암호는 현재 사용자의 DPAPI 로만 보관한다(다른 계정·다른 PC 에서는 풀리지 않는다).
            Invoke-Mutation -Description '전용 계정 암호를 DPAPI 로 보관: credential.dpapi' -Action {
                [IO.File]::WriteAllText((Join-Path $Script:IsoRunDir 'credential.dpapi'), ($secure | ConvertFrom-SecureString))
            } | Out-Null
            Write-IsoLog -Level 'INFO' -Message "계정 SID=$sid"
        }

        # 2) 작업 폴더 + ACL
        $workStep = Add-IsoStep -Kind 'workDir' -Name $names.WorkDir -Detail @{ rootExisted = (Test-Path -LiteralPath (Get-IsoWorkRoot)) }
        Invoke-Mutation -Description "작업 폴더 만들기와 ACL(상속 끊음, SYSTEM·Administrators 전체, 전용 계정 수정): $($names.WorkDir)" -Action {
            [void][IO.Directory]::CreateDirectory((Join-Path $names.WorkDir 'work'))
            [IO.File]::WriteAllText((Join-Path $names.WorkDir '.owner'), $names.Marker)
            $acl = New-Object Security.AccessControl.DirectorySecurity
            $acl.SetAccessRuleProtection($true, $false)
            foreach ($idStr in 'S-1-5-18', 'S-1-5-32-544') {
                $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($idStr)), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
            }
            $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sidObj, 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
            Set-Acl -LiteralPath $names.WorkDir -AclObject $acl
        } | Out-Null
        if ($Apply) {
            # 설정한 ACL 을 다시 읽어 확인한다: 상속이 끊겼고, 새 계정 ACE 가 있고, Users·Everyone·Authenticated Users 가 없어야 한다.
            $wacl = Get-Acl -LiteralPath $names.WorkDir
            $sidsOf = @($wacl.Access | ForEach-Object { try { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } catch { [string]$_.IdentityReference } })
            $broad = @($sidsOf | Where-Object { $_ -eq $Script:SidUsers -or $_ -eq $Script:SidEveryone -or $_ -eq $Script:SidAuthenticatedUsers })
            if (-not $wacl.AreAccessRulesProtected -or $sidsOf -notcontains $sid -or $broad.Count -gt 0) { throw "작업 폴더 ACL 을 읽어 보니 의도와 다르다(보호=$($wacl.AreAccessRulesProtected), 넓은 그룹=$($broad -join ','))." }
        }
        Complete-IsoStep -Step $workStep

        # 3) 선택: 경로 읽기·실행 권한(새 계정 SID 한 건만 추가, 기존 ACE 는 건드리지 않는다)
        foreach ($g in $GrantReadExecute) {
            $isDir = (Get-Item -LiteralPath $g).PSIsContainer
            $inherit = 'None'; if ($isDir) { $inherit = 'ContainerInherit,ObjectInherit' }
            $gs = Add-IsoStep -Kind 'aclGrant' -Name $g -Detail @{ sid = $sid; rights = 'ReadAndExecute'; inheritance = $inherit }
            Invoke-Mutation -Description "ACL 에 새 계정 SID 의 읽기·실행 한 건 추가: $g ($inherit)" -Action {
                $acl = Get-Acl -LiteralPath $g
                $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sidObj, 'ReadAndExecute', $inherit, 'None', 'Allow')))
                Set-Acl -LiteralPath $g -AclObject $acl
            } | Out-Null
            Complete-IsoStep -Step $gs
        }
        if ($Apply -and $GrantReadExecute.Count -gt 0) {
            # 하위 파일까지 전파됐는지 대표 파일로 확인한다. 안 됐으면 실패로 보고 되돌린다.
            foreach ($g in $GrantReadExecute) {
                if ((Get-Item -LiteralPath $g).PSIsContainer) {
                    $probe = Get-ChildItem -LiteralPath $g -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
                    if ($probe) {
                        $has = @((Get-Acl -LiteralPath $probe.FullName).Access | Where-Object { try { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -eq $sid } catch { $false } }).Count
                        if ($has -lt 1) { throw "ACL 이 하위 파일로 전파되지 않았다: $($probe.FullName)" }
                    }
                }
            }
        }

        # 4) 방화벽 규칙: 꺼진 채로 만들고 → 범위(LocalUser)를 다시 읽어 확인 → 켠다.
        $ruleStep = Add-IsoStep -Kind 'firewallRule' -Name $names.RuleName -Detail @{ marker = $names.Marker; remoteAddress = $remote; localUserSddl = "D:(A;;CC;;;$sid)" }
        Invoke-Mutation -Description "방화벽 규칙 만들기(꺼진 상태): Outbound Block, LocalUser=$sid, RemoteAddress=$($remote -join ',')" -Action {
            $p = @{
                Name = $names.RuleName; DisplayName = "bosang semgrep isolation outbound block ($runId)"; Group = $Script:IsoPrefix
                Description = $names.Marker; Direction = 'Outbound'; Action = 'Block'; Profile = 'Any'; Enabled = 'False'
                LocalUser = "D:(A;;CC;;;$sid)"; RemoteAddress = $remote
            }
            New-NetFirewallRule @p -ErrorAction Stop | Out-Null
        } | Out-Null
        if ($Apply) {
            $r = Get-NetFirewallRule -Name $names.RuleName -ErrorAction Stop
            $sf = $r | Get-NetFirewallSecurityFilter
            $af = $r | Get-NetFirewallAddressFilter
            $okScope = ([string]$sf.LocalUser).Contains($sid)
            $okBasic = ($r.Direction -eq 'Outbound' -and $r.Action -eq 'Block' -and $r.Description -eq $names.Marker)
            $ruleStep.detail['readback'] = @{ localUser = [string]$sf.LocalUser; remoteAddress = @($af.RemoteAddress | ForEach-Object { [string]$_ }); enabled = [string]$r.Enabled }
            if (-not ($okScope -and $okBasic)) { throw "규칙을 읽어 보니 계정 범위나 기본 속성이 기대와 다르다(LocalUser=$($sf.LocalUser)). 켜지 않고 되돌린다." }
            $want = @($remote | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object)
            $got = @($af.RemoteAddress | ForEach-Object { ([string]$_).ToLowerInvariant() } | Sort-Object)
            if (($want -join ',') -ne ($got -join ',')) { Write-IsoLog -Level 'WARN' -Message ("RemoteAddress 읽은 값이 요청과 다르다(표기 차이일 수 있음): 요청=" + ($want -join ',') + " 읽음=" + ($got -join ',')); $ruleStep.detail['remoteAddressMismatch'] = $true }
        }
        Invoke-Mutation -Description "방화벽 규칙 켜기: $($names.RuleName)" -Action { Set-NetFirewallRule -Name $names.RuleName -Enabled True -ErrorAction Stop } | Out-Null
        Complete-IsoStep -Step $ruleStep -Extra @{ enabledByRun = $true }

        $manifest.status = 'applied'
        Save-IsoManifest
    } catch {
        Write-IsoLog -Level 'FAIL' -Message ('적용 중 실패: ' + $_.Exception.Message)
        if (-not $Apply) { return @{ exitCode = 20; reason = $_.Exception.Message } }
        $manifest.status = 'apply-failed'
        Save-IsoManifest
        Write-IsoLog -Level 'INFO' -Message '이 실행이 만든 것만 되돌린다.'
        $rec = Invoke-IsoRecover -RunDir $Script:IsoRunDir -RunId $runId -Apply $true
        $code = 20; if ($rec.exitCode -ne 0) { $code = 21; Write-IsoLog -Level 'FAIL' -Message '되돌림도 불완전하다. Remove-Isolation.ps1 의 결과를 사람이 확인한다.' }
        return @{ exitCode = $code; reason = $_.Exception.Message; recover = $rec }
    }

    Write-Host ''
    if ($Apply) {
        Write-Host '적용 완료. 이것은 "만들었다"는 뜻이고, 격리 효과가 확인되었다는 뜻이 아니다. 효과는 Test-IsolationEffect.ps1 -Execute 의 관측으로만 말한다.'
        Write-Host "다음: .\Test-IsolationEffect.ps1 -RunDir `"$($Script:IsoRunDir)`" -Execute"
        Write-Host "되돌리기: .\Remove-Isolation.ps1 -RunDir `"$($Script:IsoRunDir)`" -Apply"
    } else {
        Write-Host 'dry-run 이라 아무것도 만들지 않았다. 위 [PLAN] 줄이 -Apply 때 실행될 일이다.'
    }
    @{ exitCode = 0 }
}

# ══ 검증 ═════════════════════════════════════════════════════════════════════
# 종료 코드: 0 프로브 관측 + 정리 완료 / 50 사전 조건 실패 / 60 관측 안 됨(정리는 완료) / 70 정리 불완전(관측 결과와 무관)
# 보고서에는 프로브 관측 결과(verdict)와 정리 결과(cleanup)가 따로 남는다. 최종 상태(finalStatus)는 둘을 합쳐 한 줄로 요약할 뿐이다.
function Invoke-IsoVerify {
    param(
        [Parameter(Mandatory)][string]$RunDir, [bool]$Execute = $false, [string]$VenvPython, [bool]$IncludeSelfAddressProbe = $false,
        [bool]$IncludeProcessCreationAudit = $false, [int]$ConnectTimeoutSec = 3, [int]$HoldSeconds = 3,
        [int]$LaunchTimeoutSec = 30, [int]$ResultExtraSec = 20, [int]$DoneTimeoutSec = 10
    )
    if (-not (Test-Path -LiteralPath $RunDir)) { Write-Host "RunDir 가 없다: $RunDir"; return @{ exitCode = 30 } }
    $Script:IsoRunDir = (Resolve-Path -LiteralPath $RunDir).Path
    $Script:ApplyMode = $Execute
    $manifestFile = Join-Path $Script:IsoRunDir 'resources.json'
    if (-not (Test-Path -LiteralPath $manifestFile)) { Write-Host '실행 기록(resources.json)이 없다. Initialize-Isolation.ps1 -Apply 가 먼저 필요하다.'; return @{ exitCode = 50 } }
    $m = Import-IsoManifest -Path $manifestFile
    $runId = [string]$m.runId
    $names = Get-IsoNames -RunId $runId
    $stamp = [DateTime]::UtcNow.ToString("yyyyMMdd'T'HHmmss'Z'")

    # ── 사전 조건(읽기) ──
    $pre = New-Object System.Collections.ArrayList
    $addPre = {
        param([string]$Id, [bool]$Ok, [string]$Detail)
        [void]$pre.Add([ordered]@{ id = $Id; ok = $Ok; detail = $Detail })
        $lv = 'FAIL'; if ($Ok) { $lv = 'PASS' }
        Write-IsoLog -Level $lv -Message "$Id $Detail"
    }
    & $addPre 'T01' ($m.status -eq 'applied') "실행 기록 상태가 applied 인가 (현재 $($m.status))"
    if ($Execute) { & $addPre 'T02' (Test-IsElevated) '관리자 권한(Security 로그·감사 정책·계정 사용 켜기)' }
    $userStep = @($m.steps | Where-Object { $_.kind -eq 'user' }) | Select-Object -First 1
    $sid = $null; if ($userStep) { $sid = [string](Get-IsoProp $userStep.detail 'sid') }
    $acct = Get-LocalUser -Name $names.UserName -ErrorAction SilentlyContinue
    & $addPre 'T03' ([bool]($acct -and $acct.Description -eq $names.Marker -and $sid -and $acct.SID.Value -eq $sid)) '전용 계정이 있고 표식·SID 가 기록과 같은가'
    $rule = Get-NetFirewallRule -Name $names.RuleName -ErrorAction SilentlyContinue
    $ruleOk = $false; $ruleScope = $null
    if ($rule) {
        $sf = $rule | Get-NetFirewallSecurityFilter
        $ruleScope = [string]$sf.LocalUser
        $ruleOk = ($rule.Description -eq $names.Marker -and [string]$rule.Enabled -eq 'True' -and [string]$rule.Action -eq 'Block' -and [string]$rule.Direction -eq 'Outbound' -and $sid -and $ruleScope.Contains($sid))
    }
    & $addPre 'T04' ([bool]$ruleOk) "방화벽 규칙이 켜져 있고 Block/Outbound/계정 범위가 기록과 같은가 (LocalUser=$ruleScope)"
    & $addPre 'T05' ((Test-Path -LiteralPath (Join-Path $names.WorkDir '.owner')) -and (Test-Path -LiteralPath (Join-Path $Script:IsoRunDir 'credential.dpapi'))) '작업 폴더(.owner)와 암호 파일이 있는가'
    $sl0 = Get-SecurityLogState
    & $addPre 'T06' ([bool]$sl0.ok) "Security 로그를 읽을 수 있는가 ($($sl0.error))"
    $preFail = @($pre | Where-Object { -not $_.ok })
    if ($preFail.Count -gt 0) {
        Write-Host ('사전 조건 실패: ' + (($preFail | ForEach-Object { $_.id }) -join ', ') + ' — 실행하지 않는다.') -ForegroundColor Yellow
        return @{ exitCode = 50 }
    }

    $workDir = Join-Path $names.WorkDir 'work'
    $selfIp = $null
    if ($IncludeSelfAddressProbe) {
        $selfIp = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { $_.IPAddress }) | Select-Object -First 1
        if (-not $selfIp) { Write-IsoLog -Level 'WARN' -Message '비루프백 IPv4 주소가 없어 self-address 프로브를 건너뛴다(SKIPPED_NO_ADDRESS).' }
    }

    $modeText = 'DRY-RUN(계획만)'; if ($Execute) { $modeText = 'EXECUTE(실제 프로브 실행)' }
    Write-IsoLog -Level 'INFO' -Message ("모드: {0}" -f $modeText)
    if (-not $Execute) {
        Write-IsoLog -Level 'PLAN' -Message '감사 창 열기(Filtering Platform Connection 실패 감사) → 로그 기준점 기록 → 전용 계정 사용 켜기 → 이전 프로브 파일 지우기 → 루프백 수신기 열기'
        Write-IsoLog -Level 'PLAN' -Message "전용 계정으로 부모→자식 powershell.exe 실행(이번 실행의 토큰으로 연결): loopback(허용 기대), external-reserved 192.0.2.1:9(차단 기대)$(if ($selfIp) { ', self-address ' + $selfIp })"
        Write-IsoLog -Level 'PLAN' -Message '부모·자식 신원 교차 확인(CIM 기록 ↔ 자기 보고 ↔ 부모→자식 관계 ↔ 전용 계정 SID) → 5157 이벤트를 PID·실행 파일 경로·시각 구간으로 대조 → 판정'
        Write-IsoLog -Level 'PLAN' -Message '정리(각각 독립 실행·읽어서 확인): 수신기 정지, 남은 프로브 종료, 계정 비활성화, 감사 값 복구'
        Write-Host 'dry-run 이라 아무것도 실행하지 않았다. 판정: NOT_EXECUTED'
        return @{ exitCode = 0 }
    }

    # ── 실행 ──
    $runToken = [guid]::NewGuid().ToString('N')
    $probeVerdict = 'NOT_ESTABLISHED'
    $report = [ordered]@{
        schema = 2; runId = $runId; runToken = $runToken; startedUtc = [DateTime]::UtcNow.ToString('o'); verdict = $null; finalStatus = $null
        scope = 'powershell.exe 5.1 부모→자식의 TCP 연결 두 종류(loopback, 192.0.2.1:9)만 관측한다. semgrep·semgrep-core·가상환경 python·UDP·ICMP·IPv6·DNS 는 관측하지 않았다.'
        preconditions = $pre; identity = $null; processes = $null; connectionAttempts = $null; unverifiedProbeReports = $null
        loopbackReceiver = $null; osBlockObservation = $null; probeVerdicts = $null; controlSelfAddress = $null; venvPythonAccess = $null
        cleanup = $null; auditWindows = $null; notes = (New-Object System.Collections.ArrayList); error = $null
    }
    $auditSteps = New-Object System.Collections.ArrayList
    $accountTouched = $false
    $listeners = @()
    $knownPids = New-Object System.Collections.ArrayList
    try {
        # 1) 감사 창: 단계가 설정 시도 전에 $auditSteps 에 들어가므로, 중간에 실패해도 아래 finally 가 복구한다.
        Open-IsoAuditWindow -Guid $Script:AuditGuid.FilteringPlatformConnection -EnableSuccess $false -EnableFailure $true -Registry $auditSteps -Why '5157(차단된 연결) 기록용, 이 실행 동안만' | Out-Null
        if ($IncludeProcessCreationAudit) { Open-IsoAuditWindow -Guid $Script:AuditGuid.ProcessCreation -EnableSuccess $true -EnableFailure $false -Registry $auditSteps -Why '4688(프로세스 만들기) 기록용, 이 실행 동안만' | Out-Null }

        # 2) 로그 기준점, 계정 켜기(켜기를 시도하기 전에 표시해 두어 실패해도 끄기를 시도한다)
        $base = Get-SecurityLogState
        if (-not $base.ok) { throw "실행 직전 Security 로그 기준점을 읽지 못했다: $($base.error)" }
        $accountTouched = $true
        Invoke-Mutation -Description "전용 계정 사용 켜기(끝나면 다시 끈다): $($names.UserName)" -Action { Enable-LocalUser -Name $names.UserName -ErrorAction Stop } | Out-Null
        $secure = ConvertTo-SecureString -String ([IO.File]::ReadAllText((Join-Path $Script:IsoRunDir 'credential.dpapi')).Trim())
        $cred = New-Object System.Management.Automation.PSCredential(('.\' + $names.UserName), $secure)

        # 3) 이전 실행의 프로브 파일을 지우고, 프로브 스크립트를 복사하고, 수신기를 연다
        foreach ($a in $Script:IsoProbeArtifacts) {
            $ap = Join-Path $workDir $a
            if (Test-Path -LiteralPath $ap) { Invoke-Mutation -Description "이전 실행의 프로브 파일 삭제: $a" -Action { Remove-Item -LiteralPath $ap -Force -ErrorAction Stop } | Out-Null }
        }
        foreach ($f in 'probe-parent.ps1', 'probe-child.ps1') {
            $src = Join-Path $Script:IsoScriptDir $f
            Invoke-Mutation -Description "프로브 스크립트를 작업 폴더로 복사: $f" -Action { Copy-Item -LiteralPath $src -Destination (Join-Path $workDir $f) -Force -ErrorAction Stop } | Out-Null
        }
        $l1 = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0); $l1.Start(); $listeners += $l1
        $l1Port = ([Net.IPEndPoint]$l1.LocalEndpoint).Port
        $targets = @(
            [ordered]@{ name = 'loopback'; address = '127.0.0.1'; port = $l1Port; expectation = 'allowed' },
            [ordered]@{ name = 'external-reserved'; address = '192.0.2.1'; port = 9; expectation = 'blocked' }
        )
        $l2 = $null
        if ($selfIp) {
            $l2 = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Parse($selfIp), 0); $l2.Start(); $listeners += $l2
            $targets += [ordered]@{ name = 'self-address'; address = $selfIp; port = ([Net.IPEndPoint]$l2.LocalEndpoint).Port; expectation = 'blocked' }
        }
        $targetsFile = Join-Path $workDir 'targets.json'
        $targetsDoc = [ordered]@{ runToken = $runToken; targets = $targets }
        Invoke-Mutation -Description '프로브 대상 목록 쓰기: targets.json(이번 실행의 토큰 포함)' -Action { [IO.File]::WriteAllText($targetsFile, ($targetsDoc | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false))) } | Out-Null

        # 4) 전용 계정으로 부모→자식 실행
        $argList = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f (Join-Path $workDir 'probe-parent.ps1')), '-Dir', ('"{0}"' -f $workDir), '-TargetsFile', ('"{0}"' -f $targetsFile), '-RunToken', $runToken, '-HoldSeconds', $HoldSeconds, '-TimeoutSec', $ConnectTimeoutSec)
        $launchedUtc = [DateTime]::UtcNow
        $parent = Invoke-Mutation -Description "전용 계정으로 부모 프로브 실행: $($Script:Ps51)" -Action { Start-Process -FilePath $Script:Ps51 -ArgumentList $argList -Credential $cred -WorkingDirectory $workDir -LoadUserProfile -PassThru -WindowStyle Hidden }
        $parentPid = [int]$parent.Id
        [void]$knownPids.Add($parentPid)
        $parentCim = Get-ProcessRecord -ProcessId $parentPid -Role 'parent'

        # 이번 실행의 토큰이 든 파일만 받는다. 파일이 있다는 것만으로는 준비 완료로 보지 않는다.
        $link = Wait-IsoRunFile -Path (Join-Path $workDir 'parent-child.json') -Token $runToken -TimeoutSec $LaunchTimeoutSec
        $childCim = $null
        if ($link) {
            $childPidReported = Get-IsoProp $link 'childPid'
            if ($null -ne $childPidReported -and ([string]$childPidReported) -match '^\d+$') {
                [void]$knownPids.Add([int]$childPidReported)
                $childCim = Get-ProcessRecord -ProcessId ([int]$childPidReported) -Role 'child'
            }
        }
        $parentSelf = Wait-IsoRunFile -Path (Join-Path $workDir 'parent-self.json') -Token $runToken -TimeoutSec $DoneTimeoutSec
        $totalWait = $HoldSeconds + ($targets.Count * ($ConnectTimeoutSec + 2)) + $ResultExtraSec
        $childRes = Wait-IsoRunFile -Path (Join-Path $workDir 'child-result.json') -Token $runToken -TimeoutSec $totalWait
        $parentDone = Wait-IsoRunFile -Path (Join-Path $workDir 'parent-done.json') -Token $runToken -TimeoutSec $DoneTimeoutSec

        # 5) 신원 교차 확인. 통과한 경우에만 자기 보고의 시각·연결 결과를 사실로 쓴다.
        $identity = Test-ProbeIdentity -ExpectedSid $sid -ExpectedExe $Script:Ps51 -RunToken $runToken -LaunchedUtc $launchedUtc -ParentCim $parentCim -ChildCim $childCim -ParentSelf $parentSelf -ChildResult $childRes -Link $link -ParentDone $parentDone
        $report.identity = [ordered]@{
            ok = $identity.ok; failures = @($identity.failures)
            checked = @('부모·자식 CIM 기록 존재', '소유 SID = 전용 계정', '실행 파일 = 기대한 powershell.exe', '자식의 부모 PID = 부모 프로브', '부모가 보고한 자식 PID = CIM 자식', '자기 보고 PID·경로·SID·시작 시각 = CIM', '결과 파일의 실행 토큰', '자식 종료 시각의 타당성')
        }
        $procRecords = @()
        if ($identity.ok) {
            $parentCim.endUtc = $null; if ($parentDone) { $parentCim.endUtc = (ConvertTo-UtcDate (Get-IsoProp $parentDone 'endUtc')).ToString('o') }
            $childCim.endUtc = (ConvertTo-UtcDate (Get-IsoProp $childRes 'endUtc')).ToString('o')
            $procRecords = @($parentCim, $childCim)
            $report.processes = $procRecords
            $report.connectionAttempts = @(Get-IsoProp $childRes 'attempts')
        } else {
            [void]$report.notes.Add('신원 교차 확인에 실패해 프로브의 자기 보고(시각·연결 결과)를 검증된 사실로 쓰지 않는다. 진단용으로만 unverifiedProbeReports 에 남긴다.')
            $report.unverifiedProbeReports = [ordered]@{ parentCim = $parentCim; childCim = $childCim; parentSelf = $parentSelf; link = $link; childResult = $childRes; parentDone = $parentDone }
            $report.osBlockObservation = [ordered]@{ skipped = $true; reason = 'IDENTITY_UNVERIFIED'; matchedCount = $null; unidentifiedCount = $null }
        }

        # 6) 루프백 수신기: 관리자 쪽에서 직접 센 값. 신원이 확인되지 않으면 전용 계정이 한 것이라고 읽지 않는다.
        $hits = @()
        while ($l1.Pending()) { $c = $l1.AcceptTcpClient(); $hits += [string]$c.Client.RemoteEndPoint; $c.Close() }
        $report.loopbackReceiver = [ordered]@{ hits = $hits.Count; remoteEndpoints = $hits; listener = "127.0.0.1:$l1Port"; attributedToDedicatedAccount = [bool]$identity.ok; meaning = '루프백 주소로 온 연결만 센다. 외부 통신이 없었다는 뜻이 아니다.' }

        # 선택: self-address 대조군(관리자 계정의 같은 연결)
        if ($l2) {
            $selfHitsIsolated = 0; while ($l2.Pending()) { $c = $l2.AcceptTcpClient(); $selfHitsIsolated++; $c.Close() }
            $ctlTargets = Join-Path $workDir 'control-targets.json'
            $ctlDoc = [ordered]@{ runToken = $runToken; targets = @([ordered]@{ name = 'self-address-control'; address = $selfIp; port = ([Net.IPEndPoint]$l2.LocalEndpoint).Port }) }
            Invoke-Mutation -Description '대조군 대상 목록 쓰기' -Action { [IO.File]::WriteAllText($ctlTargets, ($ctlDoc | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false))) } | Out-Null
            $ctlArgs = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f (Join-Path $workDir 'probe-child.ps1')), '-Dir', ('"{0}"' -f $workDir), '-TargetsFile', ('"{0}"' -f $ctlTargets), '-RunToken', $runToken, '-ResultFile', 'control-result.json', '-HoldSeconds', 0, '-TimeoutSec', $ConnectTimeoutSec)
            Invoke-Mutation -Description '대조군: 관리자 계정으로 같은 연결 시도' -Action { Start-Process -FilePath $Script:Ps51 -ArgumentList $ctlArgs -Wait -WindowStyle Hidden } | Out-Null
            $selfHitsControl = 0; while ($l2.Pending()) { $c = $l2.AcceptTcpClient(); $selfHitsControl++; $c.Close() }
            $ctlRes = Wait-IsoRunFile -Path (Join-Path $workDir 'control-result.json') -Token $runToken -TimeoutSec 2
            $ctlOutcome = 'no-result'; if ($ctlRes) { $ctlOutcome = [string](@(Get-IsoProp $ctlRes 'attempts')[0]).outcome }
            $report.controlSelfAddress = [ordered]@{ listenerHitsFromIsolatedAccount = $selfHitsIsolated; listenerHitsFromControl = $selfHitsControl; controlOutcome = $ctlOutcome }
        }

        # 선택: 가상환경 python 접근 확인(semgrep 아님)
        if ($VenvPython) {
            $outFile = Join-Path $workDir 'venv-python.txt'
            $pyArgs = @('-I', '-c', ('"import sys; open(r\"{0}\",\"w\").write(sys.prefix)"' -f $outFile))
            $vp = $null; $vpErr = $null
            try { $vp = Invoke-Mutation -Description "전용 계정으로 가상환경 python 실행(접근 확인): $VenvPython" -Action { Start-Process -FilePath $VenvPython -ArgumentList $pyArgs -Credential $cred -WorkingDirectory $workDir -LoadUserProfile -PassThru -Wait -WindowStyle Hidden } } catch { $vpErr = $_.Exception.Message }
            $exitCodeVp = $null; if ($vp) { $exitCodeVp = $vp.ExitCode }
            $report.venvPythonAccess = [ordered]@{ python = $VenvPython; started = ($null -ne $vp); exitCode = $exitCodeVp; wroteOutput = (Test-Path -LiteralPath $outFile); error = $vpErr; meaning = 'semgrep 이 아니라 python -I 한 줄. ACL·실행 경로 확인용.' }
        }

        # 7) OS 차단 관측(신원이 확인된 경우에만 이벤트를 이번 실행에 귀속한다)
        $ev = $null
        if ($identity.ok) {
            Start-Sleep -Seconds 2
            $auditNow = Get-IsoAuditFailureState      # 증거를 읽는 지금 실패 감사가 켜져 있는가. 읽지 못하면 $null(꺼짐으로 바꾸지 않는다)
            $blockedProbes = @($targets | Where-Object { $_.expectation -eq 'blocked' } | ForEach-Object { [ordered]@{ name = $_.name; destAddress = $_.address; destPort = $_.port } })
            $ev = Get-BlockEvidence -Baseline @{ lastRecordId = $base.lastRecordId; oldestRecordNumber = $base.oldestRecordNumber } -Processes $procRecords -Probes $blockedProbes -AuditFailureEnabled $auditNow
            $report.osBlockObservation = $ev
        }

        # 8) 판정
        $pv = [ordered]@{}
        foreach ($t in $targets) {
            if (-not $identity.ok) { $pv[$t.name] = [ordered]@{ expectation = $t.expectation; attemptOutcome = $null; verdict = 'IDENTITY_UNVERIFIED' }; continue }
            $att = @($report.connectionAttempts | Where-Object { $_.name -eq $t.name }) | Select-Object -First 1
            $mc = $null; if ($null -ne $ev.matchedCount -and $ev.matchedCount.ContainsKey([string]$t.name)) { $mc = $ev.matchedCount[[string]$t.name] }
            $e = @{ collectionOk = [bool]$ev.collection.ok; auditFailureEnabled = $ev.collection.auditFailureEnabled; wrapped = $ev.collection.wrapped; processRecordsOk = [bool]$ev.processRecordsOk; matchedCount = $(if ($null -ne $mc) { [int]$mc } else { 0 }) }
            if ($att) { $pv[$t.name] = [ordered]@{ expectation = $t.expectation; attemptOutcome = $att.outcome; verdict = (Get-ProbeVerdict -Expectation $t.expectation -Connected ($att.outcome -eq 'connected') -Evidence $e) } }
            else { $pv[$t.name] = [ordered]@{ expectation = $t.expectation; attemptOutcome = $null; verdict = 'NO_ATTEMPT_RECORDED' } }
        }
        $report.probeVerdicts = $pv
        $established = ($identity.ok) -and ($pv['loopback'].verdict -eq 'ALLOWED_AS_EXPECTED') -and ($pv['external-reserved'].verdict -eq 'OS_BLOCK_OBSERVED') -and ($report.loopbackReceiver.hits -ge 1)
        if ($established) { $probeVerdict = 'PROBE_ISOLATION_OBSERVED' }
        if ($report.controlSelfAddress -and $pv.Contains('self-address')) {
            if ($pv['self-address'].verdict -eq 'NOT_BLOCKED') { [void]$report.notes.Add('self-address 연결이 차단되지 않았다: 이 PC 자신의 주소로 가는 연결은 이 규칙의 대상이 아닐 수 있다(관측). 이것만으로 외부 차단 판정을 바꾸지 않는다.') }
            if ($report.controlSelfAddress.listenerHitsFromControl -lt 1) { [void]$report.notes.Add('대조군(관리자 계정)의 self-address 연결이 수신기에 닿지 않았다. 이 프로브는 판별력이 없다.') }
        }
    } catch {
        $report.error = $_.Exception.Message
        Write-IsoLog -Level 'FAIL' -Message ('검증 중 오류: ' + $_.Exception.Message)
        $probeVerdict = 'NOT_ESTABLISHED'
    } finally {
        # ── 정리: 항목마다 독립 실행·결과 기록. 하나가 실패해도 나머지를 건너뛰지 않는다. ──
        $cleanup = New-Object System.Collections.ArrayList
        [void]$cleanup.Add((Invoke-IsoCleanupStep -Name 'listeners-stop' -Action { foreach ($l in $listeners) { $l.Stop() } }))
        [void]$cleanup.Add((Invoke-IsoCleanupStep -Name 'process-cleanup' -Action {
                    $stillAlive = @()
                    foreach ($procId in $knownPids) {
                        $left = Get-ProcessRecord -ProcessId $procId -Role 'cleanup'
                        if ($left -and $left.ownerSid -eq $sid) {
                            try { Invoke-Mutation -Description "남은 프로브 프로세스 종료: pid=$procId" -Action { Stop-Process -Id $procId -Force -ErrorAction Stop } | Out-Null } catch { }
                            if (Get-ProcessRecord -ProcessId $procId -Role 'cleanup') { $stillAlive += $procId }
                        }
                    }
                    $okP = ($stillAlive.Count -eq 0); $oc = 'NONE_LEFT'; if (-not $okP) { $oc = 'STILL_RUNNING' }
                    [ordered]@{ ok = $okP; outcome = $oc; error = $(if ($okP) { $null } else { '종료하지 못한 프로브 프로세스: ' + ($stillAlive -join ',') }) }
                }))
        if ($accountTouched) { [void]$cleanup.Add((Invoke-IsoCleanupStep -Name 'account-disable' -Action { Disable-IsoAccount -UserName $names.UserName })) }
        for ($i = $auditSteps.Count - 1; $i -ge 0; $i--) {
            $stp = $auditSteps[$i]
            [void]$cleanup.Add((Invoke-IsoCleanupStep -Name ('audit-restore ' + [string]$stp.name) -Action { Close-IsoAuditWindow -Step $stp }))
        }
        foreach ($ci in $cleanup) { if (-not $ci.ok) { Write-IsoLog -Level 'FAIL' -Message ("정리 실패: {0} → {1} {2}" -f $ci.name, $ci.outcome, $ci.error) } }
    }

    # 프로브 관측 결과(verdict)와 정리 결과(cleanup)는 따로 보존한다. 정리가 불완전하면 관측이 정상이어도 종료 코드 0 이 될 수 없다.
    $cleanupOk = (@($cleanup | Where-Object { -not $_.ok }).Count -eq 0)
    $report.cleanup = [ordered]@{ ok = $cleanupOk; items = @($cleanup) }
    $report.verdict = $probeVerdict
    $finalStatus = 'NOT_ESTABLISHED'; $exitCode = 60
    if ($probeVerdict -eq 'PROBE_ISOLATION_OBSERVED') { $finalStatus = 'PROBE_ISOLATION_OBSERVED'; $exitCode = 0 }
    if (-not $cleanupOk) { $finalStatus = 'CLEANUP_INCOMPLETE'; $exitCode = 70 }
    $report.finalStatus = $finalStatus
    $report.finishedUtc = [DateTime]::UtcNow.ToString('o')
    $report.auditWindows = @($auditSteps | ForEach-Object { [ordered]@{ guid = $_.name; state = $_.state; original = (Get-IsoProp $_.detail 'original'); set = (Get-IsoProp $_.detail 'set') } })
    $out = Join-Path $Script:IsoRunDir ("verification-$stamp.json")
    try { Write-IsoJson -Path $out -Object $report -Depth 12 } catch { Write-IsoLog -Level 'FAIL' -Message ('보고서를 쓰지 못했다: ' + $_.Exception.Message); $exitCode = 70; $out = $null }

    Write-Host ''
    Write-Host "프로브 판정: $probeVerdict   (이 프로브 두 종류에 한정. semgrep·python·UDP·IPv6·DNS 는 관측하지 않았다)"
    Write-Host ("정리 결과: {0}   최종 상태: {1}" -f $(if ($cleanupOk) { '완료' } else { '불완전(위 FAIL 줄과 보고서 cleanup 항목을 확인한다)' }), $finalStatus)
    if ($report.identity) { Write-Host ("  신원 교차 확인: {0}{1}" -f $(if ($report.identity.ok) { '통과' } else { '실패' }), $(if (-not $report.identity.ok) { ' [' + ((@($report.identity.failures) | ForEach-Object { $_.code }) -join ', ') + ']' } else { '' })) }
    if ($report.probeVerdicts) { $report.probeVerdicts.Keys | ForEach-Object { Write-Host ('  {0,-18} 시도={1,-14} 판정={2}' -f $_, $report.probeVerdicts[$_].attemptOutcome, $report.probeVerdicts[$_].verdict) } }
    if ($report.loopbackReceiver) { Write-Host ("  [B] 루프백 수신기 수신 건수: {0}  (OS 차단 관측과 별개)" -f $report.loopbackReceiver.hits) }
    if ($report.osBlockObservation -and -not (Get-IsoProp $report.osBlockObservation 'skipped')) {
        $o = $report.osBlockObservation
        $mcText = '수집 불가(0 아님)'; if ($o.matchedCount) { $mcText = (($o.matchedCount.Keys | ForEach-Object { "$_=$($o.matchedCount[$_])" }) -join ',') }
        $uiText = '수집 불가'; if ($null -ne $o.unidentifiedCount) { $uiText = [string]$o.unidentifiedCount }
        Write-Host ("  [C] OS 차단 관측: 수집 ok={0} 감사 켜짐={1} 로그 밀림={2}  이번 실행으로 맞춘 이벤트={3}  식별 불가 이벤트={4}" -f $o.collection.ok, $o.collection.auditFailureEnabled, $o.collection.wrapped, $mcText, $uiText)
    }
    if ($out) { Write-Host "결과 파일: $out" }
    @{ exitCode = $exitCode; report = $report; reportFile = $out }
}

# ══ 복구 ═════════════════════════════════════════════════════════════════════
# 종료 코드: 0 정상 / 30 거부 / 40 건드리지 않았거나 실패한 항목 있음
function Invoke-IsoRecover {
    param([string]$RunDir, [string]$RunId, [bool]$Apply = $false, [bool]$RemoveProfile = $false, [bool]$Discover = $false)
    $Script:ApplyMode = $Apply
    if ($Discover) {
        $rules = @(Get-NetFirewallRule | Where-Object { $_.Group -eq $Script:IsoPrefix -or $_.Name -like ($Script:IsoPrefix + '*') } | ForEach-Object { [ordered]@{ name = $_.Name; enabled = [string]$_.Enabled; description = $_.Description } })
        $users = @(Get-LocalUser | Where-Object { $_.Name -like 'bsi*' } | ForEach-Object { [ordered]@{ name = $_.Name; enabled = $_.Enabled; sid = $_.SID.Value; description = $_.Description } })
        $wr = Get-IsoWorkRoot
        $dirs = @(); if (Test-Path -LiteralPath $wr) { $dirs = @(Get-ChildItem -LiteralPath $wr -Directory | ForEach-Object { $_.FullName }) }
        $runs = @()
        $sr = Get-IsoStateRoot
        if (Test-Path -LiteralPath $sr) {
            $runs = @(Get-ChildItem -LiteralPath $sr -Directory | ForEach-Object {
                    $st = 'no-manifest'; $mf = Join-Path $_.FullName 'resources.json'
                    if (Test-Path -LiteralPath $mf) { try { $st = [string](Read-IsoJson -Path $mf).status } catch { $st = 'unreadable' } }
                    [ordered]@{ runDir = $_.FullName; status = $st }
                })
        }
        # 화면으로만 보낸다: 함수 출력으로 내보내면 반환값이 배열이 되어 호출자의 종료 코드 읽기가 깨진다(실제 Windows 에서 겪었다).
        Write-Host (([ordered]@{ firewallRules = $rules; localUsers = $users; workDirs = $dirs; runDirs = $runs }) | ConvertTo-Json -Depth 6)
        Write-Host '찾기만 했고 아무것도 지우지 않았다. 정리하려면 -RunDir 또는 -RunId 와 함께 -Apply 로 실행한다.'
        return @{ exitCode = 0 }
    }
    if (-not $RunDir -and -not $RunId) { Write-Host '-RunDir 또는 -RunId 가 필요하다(-Discover 로 먼저 찾을 수 있다).'; return @{ exitCode = 30 } }
    if ($RunDir) {
        if (-not (Test-Path -LiteralPath $RunDir)) { Write-Host "RunDir 가 없다: $RunDir"; return @{ exitCode = 30 } }
        $Script:IsoRunDir = (Resolve-Path -LiteralPath $RunDir).Path
        if (-not $RunId) { $RunId = Split-Path $Script:IsoRunDir -Leaf }
    }
    if ($Apply -and -not (Test-IsElevated)) { Write-Host '관리자 권한이 필요하다.'; return @{ exitCode = 30 } }
    $names = Get-IsoNames -RunId $RunId
    $manifestFile = $null; if ($Script:IsoRunDir) { $manifestFile = Join-Path $Script:IsoRunDir 'resources.json' }

    $steps = @()
    if ($manifestFile -and (Test-Path -LiteralPath $manifestFile)) {
        $m = Import-IsoManifest -Path $manifestFile
        $steps = @($m.steps)
        Write-IsoLog -Level 'INFO' -Message "실행 기록을 읽었다: status=$($m.status) 단계 $($steps.Count)개"
    } else {
        # 실행 기록이 없다(적용 도중 중단 등). 이름으로 정해지는 자원만 찾는다.
        $m = New-IsoManifest -RunId $RunId
        Write-IsoLog -Level 'WARN' -Message '실행 기록(resources.json)이 없다. 이름으로 정해지는 자원만 복구하고, 감사 정책·ACL 은 기록이 없어 복구하지 못한다.'
        $steps = @(
            [ordered]@{ kind = 'user'; name = $names.UserName; state = 'intent'; detail = [ordered]@{ marker = $names.Marker } },
            [ordered]@{ kind = 'workDir'; name = $names.WorkDir; state = 'intent'; detail = [ordered]@{ rootExisted = $true } },
            [ordered]@{ kind = 'firewallRule'; name = $names.RuleName; state = 'intent'; detail = [ordered]@{ marker = $names.Marker } }
        )
    }
    if ($Script:IsoRunDir) { $m.status = 'recovering' }
    $modeText = 'DRY-RUN(지울 것만 출력)'; if ($Apply) { $modeText = 'APPLY(실제 복구)' }
    Write-IsoLog -Level 'INFO' -Message ("모드: {0}  runId={1}" -f $modeText, $RunId)

    $results = New-Object System.Collections.ArrayList
    $addResult = {
        param([string]$Step, [string]$Result, [string]$Note)
        [void]$results.Add([ordered]@{ step = $Step; result = $Result; note = $Note })
        Write-IsoLog -Level $Result -Message ('{0} : {1}' -f $Step, $Note)
    }
    $okWord = 'DRYRUN'; if ($Apply) { $okWord = 'OK' }
    $stepsOf = { param([string]$Kind) @($steps | Where-Object { $_.kind -eq $Kind }) }

    # 계정 정보(소유 확인에 쓴다)
    $userStep = $null; foreach ($s in (& $stepsOf 'user')) { $userStep = $s }
    $recordedSid = $null
    if ($userStep -and $userStep.detail.Contains('sid')) { $recordedSid = [string]$userStep.detail['sid'] }
    $acct = Get-LocalUser -Name $names.UserName -ErrorAction SilentlyContinue
    $acctOurs = $false
    if ($acct) {
        $acctOurs = ($acct.Description -eq $names.Marker)
        if ($recordedSid -and $acct.SID.Value -ne $recordedSid) { $acctOurs = $false }
    }
    if (-not $recordedSid -and $acct -and $acctOurs) { $recordedSid = $acct.SID.Value }

    # 0) 계정 사용 중지(끈 뒤 읽어서 확인) + 이 계정이 남긴 프로세스 종료
    if ($acct -and $acctOurs) {
        if ($acct.Enabled) {
            $d = Disable-IsoAccount -UserName $names.UserName
            if ($d.ok) { & $addResult 'account-disable' $okWord ("{0}: {1}" -f $names.UserName, $d.outcome) }
            else { & $addResult 'account-disable' 'FAILED' ("{0}: {1} {2}" -f $names.UserName, $d.outcome, $d.error) }
        }
        $procs = @()
        try { $procs = @(Get-Process -IncludeUserName -ErrorAction Stop | Where-Object { $_.UserName -like ('*\' + $names.UserName) }) } catch { & $addResult 'process-scan' 'FAILED' $_.Exception.Message }
        foreach ($p in $procs) {
            try {
                Invoke-Mutation -Description "이 계정의 프로세스 종료: $($p.ProcessName) pid=$($p.Id)" -Action { Stop-Process -Id $p.Id -Force -ErrorAction Stop } | Out-Null
                & $addResult 'process-stop' $okWord ("{0} pid={1}" -f $p.ProcessName, $p.Id)
            } catch { & $addResult 'process-stop' 'FAILED' ("{0} pid={1}: {2}" -f $p.ProcessName, $p.Id, $_.Exception.Message) }
        }
    } elseif ($acct) {
        & $addResult 'account' 'REFUSED_NOT_OURS' "같은 이름의 계정이 있지만 설명 표식이나 SID 가 다르다: $($names.UserName)"
    } else {
        & $addResult "user $($names.UserName)" 'SKIPPED_ABSENT' '계정이 없다'
    }

    # 1) 감사 정책: 결과를 구조화해서 받아 구분해 기록한다(실제 복구를 읽어 확인하기 전에는 OK 로 쓰지 않는다)
    foreach ($s in (& $stepsOf 'auditSetting')) {
        try { $r = Close-IsoAuditWindow -Step $s } catch { & $addResult "audit $($s.name)" 'FAILED' ('복구 중 예외: ' + $_.Exception.Message); continue }
        $note = "원래 $($r.original) / 설정 $($r.set) / 현재 $(if ($null -ne $r.current) { $r.current } else { '읽지 못함' })"
        if ($r.error) { $note += ' — ' + $r.error }
        switch ([string]$r.outcome) {
            'RESTORED' { & $addResult "audit $($s.name)" $okWord ("RESTORED: $note") }
            'WOULD_RESTORE' { & $addResult "audit $($s.name)" 'DRYRUN' ("WOULD_RESTORE: $note") }
            'ALREADY_RESTORED' { & $addResult "audit $($s.name)" 'ALREADY_RESTORED' ("현재 값이 이미 원래 값이다: $note") }
            'NOT_CHANGED' { & $addResult "audit $($s.name)" 'SKIPPED_ABSENT' '바꾼 적이 없다' }
            'DRIFT' { & $addResult "audit $($s.name)" 'DRIFT_NOT_RESTORED' ("제3자의 변경으로 보고 덮어쓰지 않았다: $note") }
            default { & $addResult "audit $($s.name)" 'FAILED' ("$($r.outcome): $note") }
        }
    }

    # 2) 방화벽 규칙
    foreach ($s in (& $stepsOf 'firewallRule')) {
        $r = Get-NetFirewallRule -Name ([string]$s.name) -ErrorAction SilentlyContinue
        if (-not $r) { & $addResult "rule $($s.name)" 'SKIPPED_ABSENT' '규칙이 없다'; continue }
        if ($r.Description -ne $names.Marker -or $r.Group -ne $Script:IsoPrefix) { & $addResult "rule $($s.name)" 'REFUSED_NOT_OURS' '설명 표식 또는 Group 이 다르다. 지우지 않았다'; continue }
        try {
            Invoke-Mutation -Description "방화벽 규칙 삭제: $($s.name)" -Action { Remove-NetFirewallRule -Name ([string]$s.name) -ErrorAction Stop } | Out-Null
            if ($Apply -and (Get-NetFirewallRule -Name ([string]$s.name) -ErrorAction SilentlyContinue)) { & $addResult "rule $($s.name)" 'FAILED' '삭제했다고 했지만 읽어 보니 규칙이 아직 있다'; continue }
            & $addResult "rule $($s.name)" $okWord '삭제'
        } catch { & $addResult "rule $($s.name)" 'FAILED' $_.Exception.Message }
    }

    # 3) ACL: 기록된 계정 SID 의 ACE 만 제거
    # 대상마다 경로 확인 → ACL 읽기 → SID 대조 → 변경 전체를 한 단위로 처리한다. 어느 단계에서 예외가 나도 그 대상만 FAILED 로 남기고 다음 대상으로 넘어간다.
    # 읽지 못한 ACL 은 "없음"(SKIPPED_ABSENT)도 "성공"(OK)도 아니고, 그 항목은 바꾸지 않는다. 오류를 삼키는 것이 아니라 항목별 결과로 수집한다.
    foreach ($s in (& $stepsOf 'aclGrant')) {
        $path = [string]$s.name
        $stage = '경로 확인'
        try {
            $gsid = [string](Get-IsoProp $s.detail 'sid')
            if (-not (Test-Path -LiteralPath $path)) { & $addResult "acl $path" 'SKIPPED_ABSENT' '경로가 없다'; continue }
            if (-not $gsid -or $gsid -notlike 'S-1-5-21-*') { & $addResult "acl $path" 'REFUSED_NOT_OURS' '기록된 SID 가 없거나 계정 SID 형식이 아니다'; continue }
            $stage = 'ACL 읽기'
            $acl = Get-Acl -LiteralPath $path -ErrorAction Stop
            if ($null -eq $acl) { throw 'Get-Acl 이 오류 없이 아무것도 돌려주지 않았다' }
            $stage = 'SID 대조'
            $has = @($acl.Access | Where-Object { try { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -eq $gsid } catch { ([string]$_.IdentityReference) -eq $gsid } }).Count
            if ($has -lt 1) { & $addResult "acl $path" 'SKIPPED_ABSENT' '해당 SID 의 ACE 가 없다'; continue }
            $stage = 'ACL 변경'
            Invoke-Mutation -Description "ACL 에서 SID $gsid 의 ACE 제거: $path" -Action {
                $a = Get-Acl -LiteralPath $path
                $a.PurgeAccessRules((New-Object Security.Principal.SecurityIdentifier($gsid)))
                Set-Acl -LiteralPath $path -AclObject $a
            } | Out-Null
            & $addResult "acl $path" $okWord "SID $gsid 의 ACE 제거(다른 ACE 는 그대로)"
        } catch { & $addResult "acl $path" 'FAILED' ("{0} 단계에서 예외: {1}" -f $stage, $_.Exception.Message) }
    }

    # 4) 계정(+선택 프로필)
    if ($acct -and $acctOurs) {
        try {
            Invoke-Mutation -Description "로컬 계정 삭제: $($names.UserName) ($recordedSid)" -Action { Remove-LocalUser -SID ([Security.Principal.SecurityIdentifier]$recordedSid) -ErrorAction Stop } | Out-Null
            if ($Apply -and (Get-LocalUser -Name $names.UserName -ErrorAction SilentlyContinue)) { & $addResult "user $($names.UserName)" 'FAILED' '삭제했다고 했지만 읽어 보니 계정이 아직 있다' }
            else { & $addResult "user $($names.UserName)" $okWord '삭제' }
        } catch { & $addResult "user $($names.UserName)" 'FAILED' $_.Exception.Message }
    }
    if ($recordedSid) {
        $prof = Get-CimInstance -ClassName Win32_UserProfile -Filter "SID='$recordedSid'" -ErrorAction SilentlyContinue
        if ($prof) {
            $expected = Join-Path $env:SystemDrive ('Users\' + $names.UserName)
            if ($RemoveProfile -and $prof.LocalPath -eq $expected) {
                try {
                    Invoke-Mutation -Description "프로필 삭제: $($prof.LocalPath)" -Action { Remove-CimInstance -InputObject $prof -ErrorAction Stop } | Out-Null
                    & $addResult 'profile' $okWord $prof.LocalPath
                } catch { & $addResult 'profile' 'FAILED' $_.Exception.Message }
            } elseif ($RemoveProfile) {
                & $addResult 'profile' 'REFUSED_NOT_OURS' "프로필 경로가 기대($expected)와 다르다: $($prof.LocalPath)"
            } else {
                & $addResult 'profile' 'LEFT_IN_PLACE' "프로필 폴더가 남아 있다: $($prof.LocalPath) (지우려면 -RemoveProfile)"
            }
        }
    }

    # 5) 작업 폴더
    foreach ($s in (& $stepsOf 'workDir')) {
        $dir = [string]$s.name
        # 경로 확인과 소유 확인(.owner 읽기)이 예외로 실패하면 소유를 알 수 없는 것이므로 지우지 않고 FAILED 로 남긴 뒤 다음 단계로 넘어간다.
        $stage = '경로 확인'
        try {
            $root = [IO.Path]::GetFullPath((Get-IsoWorkRoot)).TrimEnd('\') + '\'
            if (-not (Test-Path -LiteralPath $dir)) { & $addResult "workdir $dir" 'SKIPPED_ABSENT' '폴더가 없다'; continue }
            $stage = '.owner 소유 확인'
            $owner = Join-Path $dir '.owner'
            $okPath = ([IO.Path]::GetFullPath($dir)).StartsWith($root, [StringComparison]::OrdinalIgnoreCase)
            $okOwner = (Test-Path -LiteralPath $owner) -and (([IO.File]::ReadAllText($owner)) -eq $names.Marker)
            if (-not ($okPath -and $okOwner)) { & $addResult "workdir $dir" 'REFUSED_NOT_OURS' '위치 또는 .owner 표식이 다르다. 지우지 않았다'; continue }
        } catch { & $addResult "workdir $dir" 'FAILED' ("{0} 단계에서 예외(소유를 확인하지 못해 지우지 않았다): {1}" -f $stage, $_.Exception.Message); continue }
        try {
            Invoke-Mutation -Description "작업 폴더 삭제: $dir" -Action { Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction Stop } | Out-Null
            if ($Apply -and (Test-Path -LiteralPath $dir)) { & $addResult "workdir $dir" 'FAILED' '삭제했다고 했지만 폴더가 아직 있다'; continue }
            & $addResult "workdir $dir" $okWord '삭제'
            $rootDir = Get-IsoWorkRoot
            if (-not (Get-IsoProp $s.detail 'rootExisted') -and (Test-Path -LiteralPath $rootDir) -and @(Get-ChildItem -LiteralPath $rootDir -Force).Count -eq 0) {
                Invoke-Mutation -Description "비어 있는 작업 루트 삭제: $rootDir" -Action { Remove-Item -LiteralPath $rootDir -Force -ErrorAction Stop } | Out-Null
            }
        } catch { & $addResult "workdir $dir" 'FAILED' $_.Exception.Message }
    }

    # 6) 암호 파일
    if ($Script:IsoRunDir) {
        $cred = Join-Path $Script:IsoRunDir 'credential.dpapi'
        # 경로 확인도 같은 try 안에서 한다: 확인이 예외로 실패하면 FAILED 로 남기고, 이미 끝낸 복구 결과와 최종 기록은 잃지 않는다.
        try {
            if (Test-Path -LiteralPath $cred) {
                Invoke-Mutation -Description "암호 파일 삭제: $cred" -Action { Remove-Item -LiteralPath $cred -Force -ErrorAction Stop } | Out-Null
                & $addResult 'credential' $okWord 'credential.dpapi'
            }
        } catch { & $addResult 'credential' 'FAILED' $_.Exception.Message }
    }

    $bad = @($results | Where-Object { $_.result -in @('FAILED', 'REFUSED_NOT_OURS', 'DRIFT_NOT_RESTORED') })
    if ($Apply -and $Script:IsoRunDir) {
        $m.status = $(if ($bad.Count -eq 0) { 'recovered' } else { 'recovered-with-issues' })
        Save-IsoManifest
        Write-IsoJson -Path (Join-Path $Script:IsoRunDir ('recovery-{0}.json' -f [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff'))) -Object ([ordered]@{ runId = $RunId; utc = [DateTime]::UtcNow.ToString('o'); results = $results })
    }
    Write-Host ''
    $results | ForEach-Object { Write-Host ('{0,-20} {1}  {2}' -f $_.result, $_.step, $_.note) }
    if (-not $Apply) { Write-Host 'dry-run 이라 아무것도 지우지 않았다.' }
    if ($bad.Count -gt 0) { Write-Host '건드리지 않았거나 실패한 항목이 있다. 위 목록을 사람이 확인한다.' -ForegroundColor Yellow; return @{ exitCode = 40; results = $results } }
    @{ exitCode = 0; results = $results }
}
