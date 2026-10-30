# LSP-RULES-1 관리자 진입점(Test-LspRulesObservation.ps1) 흐름 시험용 모의 시스템 확장. 기존 MockSystemLsp.ps1 · MockPortsLsp.ps1 이 먼저 읽힌 뒤에 그 위에 얹는다(그 파일들은 바꾸지 않는다).
#
# 하는 일은 둘뿐이다. 나머지(계정·방화벽·감사 정책·ACL·Security 로그·CIM 프로세스 표·신원 덮어쓰기·5157 이벤트·무해한 스텁 서버를 현재 사용자로 띄우는 일)는 MockSystemLsp.ps1 의 것을 그대로 쓴다.
#  - 전용 계정으로 부르는 lsp-rules-runner.ps1 를 가로챈다. 요청이 stub 모드일 때에 한해 MockSystemLsp.ps1 의 Invoke-MockLspRunner 가 **현재 사용자로** 진짜 러너(와 무해한 스텁 서버)를 띄운다.
#    semgrep-lsp 모드 요청은 그쪽이 예외로 막는다(실제 Semgrep 을 띄울 수 없다). 손잡이 startProcessFails 로 러너를 띄우지 못하는 경우를 만든다.
#  - 결과 파일을 읽을 때만 손잡이 resultEdit 로 메모리상의 객체를 고친다(파일 이름이 lsp-rules-result.json 일 때). 디스크의 원문은 그대로라 TS 재해석은 원문을 보고, 관리자 문맥에는 고친 값이 실린다.
# 운영 스크립트에는 이 파일을 읽는 곳이 없다.
Set-StrictMode -Version 2.0
if ($null -eq (Get-Command -Name 'Invoke-MockLspRunner' -CommandType Function -ErrorAction SilentlyContinue)) { throw 'MockSystemLsp.ps1 가 먼저 읽혀야 한다.' }

$Script:RulesMockPrev = @{}
foreach ($n in 'Start-Process', 'Read-IsoJson') { $Script:RulesMockPrev[$n] = (Get-Item "function:$n").ScriptBlock }

function Start-Process {
    [CmdletBinding()]
    param([string]$FilePath, [object]$ArgumentList, $Credential, [string]$WorkingDirectory, [switch]$LoadUserProfile, [switch]$PassThru, [switch]$Wait, [string]$WindowStyle)
    $argv = @($ArgumentList | ForEach-Object { [string]$_ })
    if ($Credential -and ($argv -join ' ') -match 'lsp-rules-runner\.ps1') {
        if (Get-MockKnob 'startProcessFails' $false) { Write-MockLog 'Start-Process(injected failure) lsp-rules-runner'; throw 'mock: 러너를 띄울 수 없다' }
        return (Invoke-MockLspRunner -FilePath $FilePath -ArgumentList $ArgumentList -Argv $argv -WorkingDirectory $WorkingDirectory)
    }
    & $Script:RulesMockPrev['Start-Process'] @PSBoundParameters
}

function Read-IsoJson {
    param([Parameter(Mandatory)][string]$Path)
    $o = & $Script:RulesMockPrev['Read-IsoJson'] -Path $Path
    $edit = Get-MockKnob 'resultEdit'
    if ($edit -and (Split-Path -Leaf $Path) -eq 'lsp-rules-result.json') {
        if ($edit.PSObject.Properties['set']) { foreach ($s in @($edit.set)) { Set-LspMockPath -Root $o -Path ([string]$s.path) -Value $s.value } }
        if ($edit.PSObject.Properties['unset']) { foreach ($u in @($edit.unset)) { Set-LspMockPath -Root $o -Path ([string]$u) -Remove } }
    }
    $o
}
