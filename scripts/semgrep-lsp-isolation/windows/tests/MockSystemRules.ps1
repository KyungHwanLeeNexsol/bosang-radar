# LSP-RULES-1 관리자 진입점(Test-LspRulesObservation.ps1) 흐름 시험용 모의 시스템 확장. 기존 MockSystemLsp.ps1 · MockPortsLsp.ps1 이 먼저 읽힌 뒤에 그 위에 얹는다(그 파일들은 바꾸지 않는다).
#
# 하는 일은 셋뿐이다. 나머지(계정·방화벽·감사 정책·ACL·Security 로그·CIM 프로세스 표·신원 덮어쓰기·5157 이벤트·무해한 스텁 서버를 현재 사용자로 띄우는 일)는 MockSystemLsp.ps1 의 것을 그대로 쓴다.
#  - 방화벽 규칙의 필터 읽기를 진짜 Windows 와 같은 모양으로 넓힌다(Profile, 프로그램·서비스·프로토콜·포트·인터페이스·인증 필터). 기존 MockSystem.ps1 의 모의는 LocalUser 와 RemoteAddress 만 돌려 주므로 그 위에 얹는다.
#    기본값은 이 격리가 만드는 규칙의 생성 계약 값(Any / NotRequired / False)이다. 시험은 fake-state.json 의 규칙 레코드에 같은 이름의 키(Profile, Program, Protocol, RemotePort …)를 넣어 계약과 다른 규칙을 만들고,
#    레코드의 ReadFail 키(필터 이름 목록)로 해당 필터 읽기 오류를 주입한다. 실제 방화벽은 읽지도 바꾸지도 않는다.
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

# ── 방화벽 규칙 필터(진짜 NetSecurity 와 같은 모양) ────────────────────────────
$Script:RulesMockPrev['Get-NetFirewallRule'] = (Get-Item 'function:Get-NetFirewallRule').ScriptBlock
function Get-MockRuleField {
    param($Rule, [string]$Name, $Default)
    $rec = $null
    if ($null -ne $Rule -and $Rule.PSObject.Properties['MockRecord']) { $rec = $Rule.MockRecord }
    if ($null -ne $rec -and ($rec -is [System.Collections.IDictionary]) -and $rec.Contains($Name)) { return $rec[$Name] }
    $Default
}
function Test-MockRuleReadFail {
    param($Rule, [string]$Filter)
    $f = Get-MockRuleField -Rule $Rule -Name 'ReadFail' -Default $null
    if ($null -ne $f -and (@($f) -contains $Filter)) { Write-MockLog "rule filter read failure injected: $Filter"; throw ('mock: {0} 읽기 실패' -f $Filter) }
}
# 이름으로 한 건을 부르든 전부를 부르든, 돌려주는 규칙 객체에 Profile 과 원본 레코드(MockRecord)를 붙인다.
function Get-NetFirewallRule {
    [CmdletBinding()] param([string]$Name)
    foreach ($o in @(& $Script:RulesMockPrev['Get-NetFirewallRule'] @PSBoundParameters)) {
        if ($null -eq $o) { continue }
        $rec = $null; if ($Script:Fake.rules.Contains([string]$o.Name)) { $rec = $Script:Fake.rules[[string]$o.Name] }
        $o | Microsoft.PowerShell.Utility\Add-Member -NotePropertyName MockRecord -NotePropertyValue $rec -Force
        $o | Microsoft.PowerShell.Utility\Add-Member -NotePropertyName Profile -NotePropertyValue (Get-MockRuleField -Rule $o -Name 'Profile' -Default 'Any') -Force
        $o
    }
}
function Get-NetFirewallSecurityFilter {
    [CmdletBinding()] param([Parameter(ValueFromPipeline)]$InputObject)
    process {
        Test-MockRuleReadFail $InputObject 'SecurityFilter'
        [pscustomobject]@{
            LocalUser = [string]$InputObject.LocalUser; RemoteUser = (Get-MockRuleField $InputObject 'RemoteUser' 'Any'); RemoteMachine = (Get-MockRuleField $InputObject 'RemoteMachine' 'Any')
            Authentication = (Get-MockRuleField $InputObject 'Authentication' 'NotRequired'); Encryption = (Get-MockRuleField $InputObject 'Encryption' 'NotRequired'); OverrideBlockRules = (Get-MockRuleField $InputObject 'OverrideBlockRules' $false)
        }
    }
}
function Get-NetFirewallAddressFilter {
    [CmdletBinding()] param([Parameter(ValueFromPipeline)]$InputObject)
    process { Test-MockRuleReadFail $InputObject 'AddressFilter'; [pscustomobject]@{ RemoteAddress = @($InputObject.RemoteAddress); LocalAddress = (Get-MockRuleField $InputObject 'LocalAddress' 'Any') } }
}
# 진짜 시스템에서 패키지 필터는 제한이 없어도 $null 로 읽힌다(이 PC 의 규칙 400건 모두 그랬다). 모의도 같은 모양으로 둔다.
function Get-NetFirewallApplicationFilter {
    [CmdletBinding()] param([Parameter(ValueFromPipeline)]$InputObject)
    process { Test-MockRuleReadFail $InputObject 'ApplicationFilter'; [pscustomobject]@{ Program = (Get-MockRuleField $InputObject 'Program' 'Any'); Package = (Get-MockRuleField $InputObject 'Package' $null) } }
}
function Get-NetFirewallServiceFilter {
    [CmdletBinding()] param([Parameter(ValueFromPipeline)]$InputObject)
    process { Test-MockRuleReadFail $InputObject 'ServiceFilter'; [pscustomobject]@{ Service = (Get-MockRuleField $InputObject 'Service' 'Any') } }
}
function Get-NetFirewallPortFilter {
    [CmdletBinding()] param([Parameter(ValueFromPipeline)]$InputObject)
    process {
        Test-MockRuleReadFail $InputObject 'PortFilter'
        [pscustomobject]@{
            Protocol = (Get-MockRuleField $InputObject 'Protocol' 'Any'); LocalPort = (Get-MockRuleField $InputObject 'LocalPort' 'Any'); RemotePort = (Get-MockRuleField $InputObject 'RemotePort' 'Any')
            IcmpType = (Get-MockRuleField $InputObject 'IcmpType' 'Any'); DynamicTarget = (Get-MockRuleField $InputObject 'DynamicTarget' 'Any')
        }
    }
}
function Get-NetFirewallInterfaceFilter {
    [CmdletBinding()] param([Parameter(ValueFromPipeline)]$InputObject)
    process { Test-MockRuleReadFail $InputObject 'InterfaceFilter'; [pscustomobject]@{ InterfaceAlias = (Get-MockRuleField $InputObject 'InterfaceAlias' 'Any') } }
}
function Get-NetFirewallInterfaceTypeFilter {
    [CmdletBinding()] param([Parameter(ValueFromPipeline)]$InputObject)
    process { Test-MockRuleReadFail $InputObject 'InterfaceTypeFilter'; [pscustomobject]@{ InterfaceType = (Get-MockRuleField $InputObject 'InterfaceType' 'Any') } }
}
