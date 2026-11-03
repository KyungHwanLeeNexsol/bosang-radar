# LSP-SCAN-1 관리자 진입점의 새 포트(LspScanAdminPorts.ps1) 중 실패·불일치를 주입해야 하는 것만 대체한다. MockSystemScan.ps1 과 같이, LspScanAdminPorts.ps1 바로 뒤에서 읽힌다.
# 기본 동작은 진짜 포트를 그대로 쓴다(진짜 파일 시스템의 읽기 전용 조회). 손잡이는 시나리오의 lsp 절에서 읽는다.
#  - hashChange: 'changed'(실행 뒤 해시를 바꾼다) | 'unreadable'(실행 뒤 해시를 읽지 못한 것으로 한다). 실행 전 호출(첫 호출)은 건드리지 않는다.
#  - adminProbe: 진짜 포트가 읽은 사후 사실을 고친다. 'fail'(프로브 다시 읽기 실패) | 'wrong'(다른 해시) | 'link'(경로에 링크가 있어 읽어도 되는지 확인하지 못함)
#    | 'workspace-file'(작업 영역에 합성 파일 말고 파일이 더 있다) | 'target-wrong'(합성 파일의 다른 해시) | 'target-missing'(작업 영역에서 합성 파일이 없어졌다) | 'rules-extra'(규칙 폴더에 프로브 말고 파일이 더 있다) | 'roots-unreadable'(홈 폴더 목록을 읽지 못함)
#  - installOk: 실제 모드(semgrep-lsp)의 설치물 사전 확인(Test-LsAdminInstall)을 대체한다. 샌드박스 안에 내용 없는 가짜 파일 넷을 만들고 모든 확인(L01~L11)이 통과한 것으로 돌려준다.
#    진짜 Semgrep 은 없고 실행되지도 않는다: 이어서 러너를 띄우는 모의가 semgrep-lsp 요청을 예외(MOCK GUARD)로 막는다. 이 손잡이가 없으면 진짜 포트(읽기 전용 확인)가 가짜 경로를 보고 사전 조건 실패로 닫는다.
#  - markerFault: 실행 시도 표지(New-LsAdminAttemptMarker) 포트의 실패를 주입한다. 'create-fails'(만들지 못함, 아무것도 남지 않음) | 'write-fails'(만들었으나 본문을 쓰지 못함: 빈 표지가 남는다)
#    | 'race'(사전 검사 뒤 다른 호출이 먼저 표지를 만든 상황: 진짜 포트의 배타 생성이 exists 로 거절한다). 기본은 진짜 포트(진짜 배타 생성)를 그대로 쓴다.
#  - 호출 기록: 수신기 생성과 표지 포트 호출을 calls.log 에 남겨, 거절 경로에서 "호출 0건"을 확인할 수 있게 한다.
Set-StrictMode -Version 2.0
$Script:ScanPortPrev = @{}
foreach ($n in 'Get-LsAdminArtifactHashes', 'Get-LsAdminAfterRunState', 'Test-LsAdminInstall', 'New-LsAdminAttemptMarker', 'New-LspMinReceiver') { $Script:ScanPortPrev[$n] = (Get-Item "function:$n").ScriptBlock }
$Script:ScanPortHashCalls = 0

function New-LspMinReceiver {
    Write-MockLog 'New-LspMinReceiver'
    & $Script:ScanPortPrev['New-LspMinReceiver']
}

function Test-LsAdminInstall {
    param(
        [Parameter(Mandatory)][string]$DistRoot, [string]$SemgrepExe, [string]$ExpectedExeSha256, [string]$ExpectedCoreSha256, [string]$WheelPath, [string]$ExpectedWheelSha256, [string]$DistReport, $Manifest, [string]$Sid
    )
    if (-not (Get-MockKnob 'installOk' $false)) { return (& $Script:ScanPortPrev['Test-LsAdminInstall'] @PSBoundParameters) }
    Write-MockLog 'Test-LsAdminInstall(mock: 설치물 확인을 대체한다. 진짜 Semgrep 은 없다)'
    $venvRoot = [IO.Path]::Combine($DistRoot, 'venv'); $baseHome = [IO.Path]::Combine($DistRoot, 'base')
    $venvPython = [IO.Path]::Combine($venvRoot, 'Scripts', 'python.exe'); $basePython = [IO.Path]::Combine($baseHome, 'python.exe')
    $corePath = [IO.Path]::Combine($venvRoot, 'Lib', 'site-packages', 'semgrep', 'bin', 'semgrep-core.exe')
    $artifactPaths = [ordered]@{ semgrepExe = $SemgrepExe; semgrepCore = $corePath; venvPython = $venvPython; basePython = $basePython }
    foreach ($k in @($artifactPaths.Keys)) {
        $p = [IO.Path]::GetFullPath([string]$artifactPaths[$k])
        if (-not $p.StartsWith($Script:MockSandbox + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "MOCK GUARD: 샌드박스 밖 가짜 설치물 경로: $p" }
        if (-not [IO.File]::Exists($p)) { [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($p)); [IO.File]::WriteAllBytes($p, [byte[]](1, 2, 3, 4)) }
    }
    $pre = @(); foreach ($id in 'L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L10', 'L11') { $pre += [ordered]@{ id = $id; ok = $true; detail = 'mock' } }
    $hashesBefore = Get-LsAdminArtifactHashes -Paths $artifactPaths
    $inputs = [ordered]@{ mode = 'semgrep-lsp'; distRoot = $DistRoot; semgrepExe = $SemgrepExe; mockedInstallCheck = $true }
    [ordered]@{ pre = $pre; inputs = $inputs; venvRoot = $venvRoot; baseHome = $baseHome; venvPython = $venvPython; basePython = $basePython; corePath = $corePath; artifactPaths = $artifactPaths; hashesBefore = $hashesBefore }
}

function New-LsAdminAttemptMarker {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Text, [Parameter(Mandatory)][string]$TrustedRoot)
    Write-MockLog "New-LsAdminAttemptMarker $Path"
    $fault = [string](Get-MockKnob 'markerFault' '')
    if ($fault -eq 'create-fails') { return [ordered]@{ ok = $false; created = $false; exists = $false; error = 'mock: 표지를 만들 수 없다' } }
    if ($fault -eq 'write-fails') {
        $fs = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None); $fs.Dispose()
        return [ordered]@{ ok = $false; created = $true; exists = $false; error = 'mock: 표지 본문을 쓸 수 없다' }
    }
    if ($fault -eq 'race') {
        # 사전 검사(기존 SCAN 산출물 없음)를 통과한 뒤, 다른 호출이 먼저 표지를 만든 상황. 그 호출의 본문은 우리 호출이 덮어쓰지 못해야 한다.
        [IO.File]::WriteAllText($Path, '{"other":"session"}', (New-Object Text.UTF8Encoding($false)))
    }
    & $Script:ScanPortPrev['New-LsAdminAttemptMarker'] -Path $Path -Text $Text -TrustedRoot $TrustedRoot
}

function Get-LsAdminArtifactHashes {
    param($Paths)
    $Script:ScanPortHashCalls++
    $h = & $Script:ScanPortPrev['Get-LsAdminArtifactHashes'] -Paths $Paths
    $mode = [string](Get-MockKnob 'hashChange' '')
    if ($Script:ScanPortHashCalls -ge 2 -and $mode -ne '') {
        Write-MockLog "Get-LsAdminArtifactHashes(injected $mode)"
        foreach ($k in @($h.Keys)) {
            if ($mode -eq 'unreadable') { $h[$k] = $null }
            elseif ($mode -eq 'changed' -and $null -ne $h[$k]) { $v = [string]$h[$k]; if ($v.StartsWith('f')) { $h[$k] = 'e' + $v.Substring(1) } else { $h[$k] = 'f' + $v.Substring(1) } }
        }
    }
    $h
}

function Get-LsAdminAfterRunState {
    param([Parameter(Mandatory)][string]$TrustedRoot, [Parameter(Mandatory)][string]$WorkDir, [Parameter(Mandatory)][string]$RulesWork)
    $r = & $Script:ScanPortPrev['Get-LsAdminAfterRunState'] -TrustedRoot $TrustedRoot -WorkDir $WorkDir -RulesWork $RulesWork
    $mode = [string](Get-MockKnob 'adminProbe' '')
    if ($mode -ne '') {
        Write-MockLog "Get-LsAdminAfterRunState(injected $mode)"
        if ($mode -eq 'fail') { $r.probe.sha256 = $null; $r.probe.error = 'mock: 프로브를 다시 읽지 못했다' }
        elseif ($mode -eq 'wrong') { $r.probe.sha256 = ('f' * 64) }
        elseif ($mode -eq 'link') { $r.readAllowed = $false; $r.problems = @('LINK:mock'); $r.probe.sha256 = $null; $r.roots = [ordered]@{} }
        elseif ($mode -eq 'workspace-file') { $r.roots['WORKSPACE'] = @('lsp-scan-1-target.txt', 'x.txt') }
        elseif ($mode -eq 'target-wrong') { $r.target.sha256 = ('f' * 64) }
        elseif ($mode -eq 'target-missing') { $r.roots['WORKSPACE'] = @() }
        elseif ($mode -eq 'rules-extra') { $r.roots['RULES_DIR'] = @('lsp-rules-1-probe.yaml', 'extra.yaml') }
        elseif ($mode -eq 'roots-unreadable') { $r.roots['HOME_DIR'] = $null }
    }
    $r
}
