# LSP-RULES-1 관리자 진입점(Test-LspRulesObservation.ps1)이 시스템에 닿는 곳 중 LSP-MIN-1 의 포트(LspMinAdminPorts.ps1)로 덮이지 않는 것만 모은 포트 함수들.
# 불러올 때는 함수만 정의하고 아무것도 실행하지 않는다. 여기 있는 일은 모두 읽기 전용이다: 파일 읽기·해시, 폴더 목록, 경로 조각의 링크 확인, 설치물 사전 확인. 쓰기·삭제·계정·방화벽·감사·ACL 은 없다.
# 모의 시험(MockPortsRules.ps1)이 이 파일 바로 뒤에서 같은 이름으로 대체할 수 있도록, 진입 스크립트는 이 이름으로만 해당 일을 한다.
# 루프백 수신기, 중단 파일, 프로세스 표, 재해석 도구 호출은 LspMinAdminPorts.ps1 의 것을 그대로 쓴다(여기서 다시 만들지 않는다).
#
# 먼저 읽혀 있어야 하는 것: IsolationCommon.ps1, LspRulesContract.ps1, LspMinAdminContract.ps1, LspMinAdminPorts.ps1, LspRulesAdminContract.ps1.

# 파일의 SHA-256(소문자 16진수). .NET 으로만 잰다(Get-FileHash 모듈에 기대지 않는다). 읽지 못하면 $null 이다 — 읽지 못한 값은 다른 어떤 값과도 같지 않다.
function Get-LrAdminFileSha256 {
    param([string]$Path)
    $fs = $null; $sha = $null
    try {
        if ([string]::IsNullOrEmpty($Path) -or -not [IO.File]::Exists($Path)) { return $null }
        $sha = [Security.Cryptography.SHA256]::Create()
        $fs = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
        return (($sha.ComputeHash($fs) | ForEach-Object { $_.ToString('x2') }) -join '')
    } catch { return $null } finally { if ($null -ne $fs) { $fs.Dispose() }; if ($null -ne $sha) { $sha.Dispose() } }
}

# 이름표 → 경로 표에서 이름표 → 해시 표를 만든다. 읽지 못한 파일의 값은 $null 이다.
function Get-LrAdminArtifactHashes {
    param($Paths)
    $out = [ordered]@{}
    foreach ($k in @($Paths.Keys)) { $out[[string]$k] = Get-LrAdminFileSha256 -Path ([string]$Paths[$k]) }
    $out
}

# 작은 일반 파일의 바이트를 읽는다(MaxBytes 를 넘으면 읽지 않는다: 전용 계정이 큰 파일로 바꿔 놓아도 메모리를 쓰지 않는다). 링크·폴더·없는 파일은 읽지 않는다.
# 결과 {ok, bytes, size, error}. 읽지 못했으면 ok=$false 이고 bytes 는 $null 이다.
function Get-LrAdminFileBytes {
    param([string]$Path, [int]$MaxBytes = 4096)
    $res = [ordered]@{ ok = $false; bytes = $null; size = $null; error = $null }
    $fs = $null
    try {
        $st = Get-LspMinPieceState -Path $Path
        if ($st -ne 'FILE') { $res.error = 'NOT_A_REGULAR_FILE:' + $st; return $res }
        $fs = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
        $res.size = [int64]$fs.Length
        if ($fs.Length -gt $MaxBytes) { $res.error = 'TOO_LARGE'; return $res }
        $buf = New-Object byte[] ([int]$fs.Length)
        $got = 0
        while ($got -lt $buf.Length) {
            $n = $fs.Read($buf, $got, $buf.Length - $got)
            if ($n -le 0) { break }
            $got += $n
        }
        if ($got -ne $buf.Length) { $res.error = 'SHORT_READ'; return $res }
        $res.bytes = $buf; $res.ok = $true
    } catch { $res.error = $_.Exception.Message } finally { if ($null -ne $fs) { $fs.Dispose() } }
    $res
}

# 프로브 규칙 파일의 원본(저장소의 파일)을 읽고 고정값(233바이트, 고정 sha256)과 대조한다. 아무것도 만들기 전에 부른다.
# 결과 {path, ok, bytes, size, sha256, problems}. ok 가 아니면 bytes 가 있어도 쓰지 않는다.
function Read-LrAdminProbeSource {
    param([string]$Path)
    $r = [ordered]@{ path = $Path; ok = $false; bytes = $null; size = $null; sha256 = $null; problems = @() }
    if ([string]::IsNullOrEmpty($Path)) { $r.problems = @('PROBE_SOURCE_PATH_MISSING'); return $r }
    $f = Get-LrAdminFileBytes -Path $Path -MaxBytes 4096
    $r.size = $f.size
    if (-not $f.ok) { $r.problems = @('PROBE_SOURCE_UNREADABLE:' + [string]$f.error); return $r }
    $t = Test-LrAdminProbeBytes $f.bytes
    $r.bytes = $f.bytes; $r.size = $t.size; $r.sha256 = $t.sha256; $r.problems = @($t.problems); $r.ok = [bool]$t.ok
    $r
}

# 감시 폴더 안의 파일 목록(폴더 기준 상대 경로, '/' 구분, 이름 순). 폴더가 없거나 읽지 못하면 $null 이다(빈 목록과 다르다).
function Get-LrAdminRootFiles {
    param([string]$Root)
    try {
        if ([string]::IsNullOrEmpty($Root) -or -not [IO.Directory]::Exists($Root)) { return $null }
        $files = [IO.Directory]::GetFiles($Root, '*', [IO.SearchOption]::AllDirectories)
        $rel = New-Object System.Collections.ArrayList
        $prefix = $Root.TrimEnd('\', '/')
        foreach ($f in $files) { [void]$rel.Add($f.Substring($prefix.Length).TrimStart('\', '/').Replace('\', '/')) }
        , @($rel | Sort-Object { $_ } -CaseSensitive)
    } catch { return $null }
}

# 이 관측의 작업 파일과 새로 쓰이는 경로에 대한 안전 확인 한 묶음: (1) 신뢰 루트부터 모든 목적지(작업 배치, 상태 폴더들, 규칙 폴더, 프로브 자리, 요청·결과·중단 표지, 러너 사본)까지 이미 있는 경로 조각에
# 링크(정션·심볼릭 링크)가 없고 읽을 수 있는가, (2) 이전 실행의 작업 배치 안에 링크가 없는가. 배치 안은 상위 경로가 깨끗할 때만 본다(링크를 지나 바깥을 훑지 않는다). 빈 목록이면 안전하다고 본다.
# 확인 시점의 상태일 뿐이다(확인 뒤에 링크로 바뀌는 경쟁 상태는 막지 못한다). 하드 링크는 재해석 지점이 아니라서 찾지 못한다.
function Get-LrAdminWorkSafetyProblems {
    param([Parameter(Mandatory)][string]$TrustedRoot, [Parameter(Mandatory)][string]$WorkDir, [Parameter(Mandatory)][string]$RulesWork)
    $out = New-Object System.Collections.ArrayList
    $chain = Get-LspMinWorkPathProblems -TrustedRoot $TrustedRoot -Targets (Get-LrAdminWorkTargets -WorkDir $WorkDir -RulesWork $RulesWork)
    foreach ($c in $chain) { [void]$out.Add([string]$c) }
    if ($out.Count -eq 0 -and (Test-Path -LiteralPath $RulesWork)) {
        $tree = Find-LspMinReparseInTree -Root $RulesWork
        foreach ($t in $tree) { [void]$out.Add([string]$t) }
    }
    , @($out)
}

# 러너가 끝나고 정리까지 된 뒤에 관리자가 직접 읽는 사후 사실: 규칙 폴더의 프로브 파일을 다시 읽어 잰 해시와 감시 폴더 셋의 파일 목록.
# 읽어도 되는가(readAllowed)는 경로 조각·배치 안에 링크가 없을 때만 참이다 — 전용 계정이 폴더를 링크로 바꿔 놓았으면 읽지 않고 이유를 problems 에 남긴다.
# 읽지 못한 값은 $null 이다(일치로 쓰지 않는다). roots: 역할 → 파일 목록 또는 $null.
function Get-LrAdminAfterRunState {
    param([Parameter(Mandatory)][string]$TrustedRoot, [Parameter(Mandatory)][string]$WorkDir, [Parameter(Mandatory)][string]$RulesWork)
    $layout = Get-LrLayout -Work $RulesWork
    $probePath = Get-LrProbePath $layout
    $r = [ordered]@{ readAllowed = $false; problems = @(); probePath = $probePath; probe = [ordered]@{ size = $null; sha256 = $null; error = $null }; roots = [ordered]@{} }
    $pb = Get-LrAdminWorkSafetyProblems -TrustedRoot $TrustedRoot -WorkDir $WorkDir -RulesWork $RulesWork
    $r.problems = @($pb)
    if (@($pb).Count -gt 0) { return $r }
    $r.readAllowed = $true
    $f = Get-LrAdminFileBytes -Path $probePath -MaxBytes 4096
    $r.probe.size = $f.size; $r.probe.error = $f.error
    if ($f.ok) { $r.probe.sha256 = Get-LrSha256Hex $f.bytes }
    foreach ($role in $Script:LspMinWatchedRoles) { $r.roots[$role] = Get-LrAdminRootFiles (Get-LrRootPath $layout $role) }
    $r
}

# 실제 모드의 설치물 사전 확인(L01~L08, L10, L11)과 실행 전 해시. LSP-MIN-1 진입점과 같은 확인이다(그쪽은 진입 함수 안에 풀려 있어 함수로 가져올 수 없어 여기에 옮겼다).
# 경로 문구 확인(L11)만 이 관측의 계약(Find-LrForbiddenFragment)을 쓴다. 파일은 읽기만 한다. 결과: pre(항목 {id, ok, detail}의 목록), inputs(보고서용), 경로들, 이름표 → 경로 표, 실행 전 해시.
function Test-LrAdminInstall {
    param(
        [Parameter(Mandatory)][string]$DistRoot, [string]$SemgrepExe, [string]$ExpectedExeSha256, [string]$ExpectedCoreSha256, [string]$WheelPath, [string]$ExpectedWheelSha256, [string]$DistReport, $Manifest, [string]$Sid
    )
    $pre = New-Object System.Collections.ArrayList
    $add = { param([string]$Id, [bool]$Ok, [string]$Detail); [void]$pre.Add([ordered]@{ id = $Id; ok = $Ok; detail = $Detail }) }
    $expectedExe = Get-LspMinExpectedExePath -DistRoot $DistRoot
    $exePathOk = [bool](Test-LspMinSamePath $SemgrepExe $expectedExe)
    $exeExists = ($exePathOk -and (Test-Path -LiteralPath $SemgrepExe -PathType Leaf))
    & $add 'L01' ($exePathOk -and $exeExists) "실행 파일이 설치 위치에서 도출한 정확한 경로와 같고 존재하는가 (기대 $expectedExe, 받은 값 $SemgrepExe)"
    $venvRoot = [IO.Path]::Combine($DistRoot, 'venv')
    # `, @(...)` 로 돌려주는 함수는 @() 로 다시 감싸지 않는다(빈 배열이 원소 하나로 보이는 함정).
    $chain = @(); if ($exeExists) { $chain = Get-LspMinReparseInChain -Path $SemgrepExe -Root $DistRoot }
    & $add 'L02' ($exeExists -and $chain.Count -eq 0) "설치 위치에서 실행 파일까지 경로 조각에 심볼릭 링크·정션이 없는가 ($($chain -join ' ; '))"
    # 읽지 못한 파일의 사실은 "빈 사실"(해시·크기 null)로 둔다: 상세 문구를 만들 때 null 의 속성을 읽다 죽지 않고, 빈 해시는 어떤 기대값과도 같지 않다.
    $noFacts = [ordered]@{ sha256 = $null; size = $null }
    $exeFacts = $noFacts; if ($exeExists) { $f0 = Get-LspMinFileFacts -Path $SemgrepExe; if ($f0) { $exeFacts = $f0 } }
    $wantExe = ConvertTo-LspMinSha256 $ExpectedExeSha256
    & $add 'L03' ([bool]($exeFacts.sha256 -and $exeFacts.sha256 -eq $wantExe)) "semgrep.exe 전체 SHA-256 이 기대값과 같은가 (실제 $($exeFacts.sha256), 크기 $($exeFacts.size))"
    $wheelFacts = $noFacts; if ($WheelPath -and (Test-Path -LiteralPath $WheelPath -PathType Leaf)) { $f0 = Get-LspMinFileFacts -Path $WheelPath; if ($f0) { $wheelFacts = $f0 } }
    $wantWheel = ConvertTo-LspMinSha256 $ExpectedWheelSha256
    & $add 'L04' ([bool]($wheelFacts.sha256 -and $wheelFacts.sha256 -eq $wantWheel)) "원본 휠의 현재 SHA-256 이 기대값과 같은가 (실제 $($wheelFacts.sha256), 크기 $($wheelFacts.size))"
    $corePath = [IO.Path]::Combine($venvRoot, 'Lib', 'site-packages', 'semgrep', 'bin', 'semgrep-core.exe')
    $coreFacts = $noFacts; if (Test-Path -LiteralPath $corePath -PathType Leaf) { $f0 = Get-LspMinFileFacts -Path $corePath; if ($f0) { $coreFacts = $f0 } }
    $coreWant = $null; if ($ExpectedCoreSha256) { $coreWant = ConvertTo-LspMinSha256 $ExpectedCoreSha256 }
    $coreOk = [bool]($coreFacts.sha256 -and (($null -eq $coreWant) -or $coreFacts.sha256 -eq $coreWant))
    & $add 'L05' $coreOk "semgrep-core.exe 가 있고 (기대값을 줬다면) 전체 SHA-256 이 같은가 (실제 $($coreFacts.sha256), 크기 $($coreFacts.size))"
    $reportText = $null; $reportSha = $null
    if ($DistReport -and (Test-Path -LiteralPath $DistReport -PathType Leaf)) { try { $reportText = [IO.File]::ReadAllText($DistReport, [Text.Encoding]::UTF8); $reportSha = Get-FileSha256Hex -Path $DistReport } catch { $reportText = $null } }
    $cross = $null
    if ($null -ne $reportText) {
        $cross = Test-LspMinReportCrossCheck -ReportText $reportText -ExeSha256 $exeFacts.sha256 -ExeSize $exeFacts.size -CoreSha256 $coreFacts.sha256 -CoreSize $coreFacts.size -WheelSha256 $wheelFacts.sha256
    }
    & $add 'L06' ([bool]($cross -and $cross.ok)) "배포물 검증 보고서의 값(실행 파일·core·휠 해시와 크기)이 현재 파일과 모두 같은가 ($(if ($cross) { (@($cross.items | ForEach-Object { $_.id + '=' + $_.ok }) -join ',') } else { '보고서를 읽지 못했다' }))"
    $baseHome = $null
    $cfg = Join-Path $venvRoot 'pyvenv.cfg'
    if (Test-Path -LiteralPath $cfg) { $line = @(Get-Content -LiteralPath $cfg | Where-Object { $_ -match '^\s*home\s*=' }) | Select-Object -First 1; if ($line) { $baseHome = ($line -replace '^\s*home\s*=\s*', '').Trim() } }
    $venvPython = [IO.Path]::Combine($venvRoot, 'Scripts', 'python.exe'); $basePython = $null; if ($baseHome) { $basePython = [IO.Path]::Combine($baseHome, 'python.exe') }
    & $add 'L07' ([bool]($baseHome -and (Test-Path -LiteralPath $venvPython) -and (Test-Path -LiteralPath $basePython))) "가상환경과 기반 Python 폴더를 pyvenv.cfg 에서 확정했는가 (venv=$venvRoot, home=$baseHome)"
    $grants = @($Manifest.steps | Where-Object { $_.kind -eq 'aclGrant' } | ForEach-Object { [IO.Path]::GetFullPath([string]$_.name).TrimEnd('\') })
    $grantOk = [bool]($baseHome -and ($grants | Where-Object { $_.Equals($venvRoot.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase) }) -and ($grants | Where-Object { $_.Equals($baseHome.TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase) }))
    $aceDetail = @(); $aceOk = $false
    if ($grantOk) {
        $aceOk = $true
        foreach ($f in @($SemgrepExe, $venvPython, $basePython)) {
            # ACL 을 읽지 못하면(파일 없음·접근 거부) 던지지 않고 이 사전 조건의 실패로 센다(문서화된 종료 50).
            $has = 0
            try { $has = @((Get-Acl -LiteralPath $f -ErrorAction Stop).Access | Where-Object { $_.AccessControlType -eq 'Allow' -and (([int]$_.FileSystemRights -band 0xA9) -eq 0xA9) -and ($(try { $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value } catch { [string]$_.IdentityReference }) -eq $Sid) }).Count } catch { $has = 0 }
            $aceDetail += ("{0}={1}" -f (Split-Path -Leaf $f), $has); if ($has -lt 1) { $aceOk = $false }
        }
    }
    & $add 'L08' ($grantOk -and $aceOk) "이번 실행의 권한 부여 기록이 가상환경 루트·기반 Python 폴더를 포함하고 세 파일 ACL 에 전용 SID 의 읽기·실행 ACE 가 있는가 ($($aceDetail -join ', '))"
    # 링크 점검은 실행 파일뿐 아니라 가상환경 python 과 기반 Python 폴더까지 본다. 러너가 거절할 경로 문구도 미리 거른다.
    $chainPy = @(); if (Test-Path -LiteralPath $venvPython) { $chainPy = Get-LspMinReparseInChain -Path $venvPython -Root $DistRoot }
    $chainBase = @(); if ($baseHome -and (Test-Path -LiteralPath $baseHome)) { $chainBase = Get-LspMinReparseInChain -Path $baseHome -Root $baseHome }
    & $add 'L10' ($chainPy.Count -eq 0 -and $chainBase.Count -eq 0 -and [bool]$baseHome) "가상환경 python 까지의 경로 조각과 기반 Python 폴더에 심볼릭 링크·정션이 없는가 ($(@($chainPy) + @($chainBase) -join ' ; '))"
    $ppHits = @(@($SemgrepExe, $DistRoot, $baseHome) | Where-Object { $_ } | ForEach-Object { $pp1 = Find-LrForbiddenFragment $_; if ($pp1) { "$_ => $pp1" } })
    & $add 'L11' ($ppHits.Count -eq 0) "설치 경로에 러너가 시작을 거절할 문구(download·registry·scanning·no rules 등)가 없는가 ($($ppHits -join ' ; '))"
    $artifactPaths = [ordered]@{ semgrepExe = $SemgrepExe; semgrepCore = $corePath; venvPython = $venvPython; basePython = $basePython }
    $hashesBefore = Get-LrAdminArtifactHashes -Paths $artifactPaths
    $inputs = [ordered]@{
        mode = 'semgrep-lsp'; distRoot = $DistRoot; semgrepExe = $SemgrepExe; expectedExePath = $expectedExe; semgrepExeSha256 = $exeFacts.sha256; semgrepExeSize = $exeFacts.size; semgrepExeSha256Expected = $wantExe
        semgrepCoreSha256 = $coreFacts.sha256; semgrepCoreSize = $coreFacts.size
        wheelPath = $WheelPath; wheelSha256 = $wheelFacts.sha256; wheelSha256Expected = $wantWheel
        distReport = $DistReport; distReportSha256 = $reportSha; reportCrossCheck = $cross; venvRoot = $venvRoot; basePythonHome = $baseHome; grantedPaths = $grants
        pinFile = '핀 파일은 읽지도 바꾸지도 않는다(검증 표지·정책 수락·ADR 상태도 마찬가지)'
    }
    [ordered]@{ pre = @($pre); inputs = $inputs; venvRoot = $venvRoot; baseHome = $baseHome; venvPython = $venvPython; basePython = $basePython; corePath = $corePath; artifactPaths = $artifactPaths; hashesBefore = $hashesBefore }
}
