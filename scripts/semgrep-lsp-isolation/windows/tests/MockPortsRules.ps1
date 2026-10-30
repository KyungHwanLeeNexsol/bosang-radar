# LSP-RULES-1 관리자 진입점의 새 포트(LspRulesAdminPorts.ps1) 중 실패·불일치를 주입해야 하는 것만 대체한다. MockSystemRules.ps1 과 같이, LspRulesAdminPorts.ps1 바로 뒤에서 읽힌다.
# 기본 동작은 진짜 포트를 그대로 쓴다(진짜 파일 시스템의 읽기 전용 조회). 손잡이는 시나리오의 lsp 절에서 읽는다.
#  - hashChange: 'changed'(실행 뒤 해시를 바꾼다) | 'unreadable'(실행 뒤 해시를 읽지 못한 것으로 한다). 실행 전 호출(첫 호출)은 건드리지 않는다.
#  - adminProbe: 진짜 포트가 읽은 사후 사실을 고친다. 'fail'(프로브 다시 읽기 실패) | 'wrong'(다른 해시) | 'link'(경로에 링크가 있어 읽어도 되는지 확인하지 못함)
#    | 'workspace-file'(작업 영역에 파일이 있다) | 'rules-extra'(규칙 폴더에 프로브 말고 파일이 더 있다) | 'roots-unreadable'(홈 폴더 목록을 읽지 못함)
Set-StrictMode -Version 2.0
$Script:RulesPortPrev = @{}
foreach ($n in 'Get-LrAdminArtifactHashes', 'Get-LrAdminAfterRunState') { $Script:RulesPortPrev[$n] = (Get-Item "function:$n").ScriptBlock }
$Script:RulesPortHashCalls = 0

function Get-LrAdminArtifactHashes {
    param($Paths)
    $Script:RulesPortHashCalls++
    $h = & $Script:RulesPortPrev['Get-LrAdminArtifactHashes'] -Paths $Paths
    $mode = [string](Get-MockKnob 'hashChange' '')
    if ($Script:RulesPortHashCalls -ge 2 -and $mode -ne '') {
        Write-MockLog "Get-LrAdminArtifactHashes(injected $mode)"
        foreach ($k in @($h.Keys)) {
            if ($mode -eq 'unreadable') { $h[$k] = $null }
            elseif ($mode -eq 'changed' -and $null -ne $h[$k]) { $v = [string]$h[$k]; if ($v.StartsWith('f')) { $h[$k] = 'e' + $v.Substring(1) } else { $h[$k] = 'f' + $v.Substring(1) } }
        }
    }
    $h
}

function Get-LrAdminAfterRunState {
    param([Parameter(Mandatory)][string]$TrustedRoot, [Parameter(Mandatory)][string]$WorkDir, [Parameter(Mandatory)][string]$RulesWork)
    $r = & $Script:RulesPortPrev['Get-LrAdminAfterRunState'] -TrustedRoot $TrustedRoot -WorkDir $WorkDir -RulesWork $RulesWork
    $mode = [string](Get-MockKnob 'adminProbe' '')
    if ($mode -ne '') {
        Write-MockLog "Get-LrAdminAfterRunState(injected $mode)"
        if ($mode -eq 'fail') { $r.probe.sha256 = $null; $r.probe.error = 'mock: 프로브를 다시 읽지 못했다' }
        elseif ($mode -eq 'wrong') { $r.probe.sha256 = ('f' * 64) }
        elseif ($mode -eq 'link') { $r.readAllowed = $false; $r.problems = @('LINK:mock'); $r.probe.sha256 = $null; $r.roots = [ordered]@{} }
        elseif ($mode -eq 'workspace-file') { $r.roots['WORKSPACE'] = @('x.txt') }
        elseif ($mode -eq 'rules-extra') { $r.roots['RULES_DIR'] = @('lsp-rules-1-probe.yaml', 'extra.yaml') }
        elseif ($mode -eq 'roots-unreadable') { $r.roots['HOME_DIR'] = $null }
    }
    $r
}
