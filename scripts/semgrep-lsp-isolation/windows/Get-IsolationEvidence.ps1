<#
.SYNOPSIS
  어떤 실행의 프로세스 기록으로 Security 로그의 5157(차단된 연결)을 대조해 "이번 실행의 OS 차단 관측"을 센다. 읽기 전용.
.DESCRIPTION
  Test-IsolationEffect.ps1 이 쓰는 것과 같은 대조 함수(IsolationCommon.ps1)를 다른 실행(예: 나중의 실제 도구 실행)에도 쓰기 위한 얇은 진입점이다.
  입력 JSON(-InputFile):
    {
      "baseline":  { "lastRecordId": <실행 직전 Security 로그 마지막 RecordId>, "oldestRecordNumber": <그때의 가장 오래된 번호> },
      "processes": [ { "role": "...", "processId": 123, "exePath": "C:\\...\\x.exe", "startUtc": "...Z", "endUtc": "...Z" } ],
      "probes":    [ { "name": "...", "destAddress": "192.0.2.1", "destPort": 9 } ]
    }
  -AuditFailureWasEnabled: 실행 동안 "Filtering Platform Connection" 실패 감사가 켜져 있었는지를 호출자가 안다면 $true/$false 로 넘긴다.
  넘기지 않으면 알 수 없다고 보고 모든 건수를 "증거 없음"으로 취급한다(0건으로 쓰지 않는다).
  출력: 건수는 수집이 성공했을 때만 숫자다. 못 읽었거나 로그가 밀렸으면 collection.ok=false 또는 wrapped=true 이고 건수는 null 이다.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$RunDir,
    [Parameter(Mandatory)][string]$InputFile,
    [object]$AuditFailureWasEnabled = $null
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'IsolationCommon.ps1')
$Script:ApplyMode = $false
$Script:IsoRunDir = (Resolve-Path -LiteralPath $RunDir).Path

$in = Read-IsoJson -Path $InputFile
$procs = @($in.processes | ForEach-Object { [ordered]@{ role = $_.role; processId = [int]$_.processId; exePath = [string]$_.exePath; startUtc = [string]$_.startUtc; endUtc = $(if ($_.endUtc) { [string]$_.endUtc } else { $null }) } })
$probes = @($in.probes | ForEach-Object { [ordered]@{ name = [string]$_.name; destAddress = [string]$_.destAddress; destPort = [string]$_.destPort } })
$ev = Get-BlockEvidence -Baseline @{ lastRecordId = $in.baseline.lastRecordId; oldestRecordNumber = $in.baseline.oldestRecordNumber } -Processes $procs -Probes $probes -AuditFailureEnabled $AuditFailureWasEnabled

$verdictInputOk = ($ev.collection.ok -and $ev.collection.auditFailureEnabled -eq $true -and $ev.collection.wrapped -eq $false)
$out = Join-Path $Script:IsoRunDir ('evidence-{0}.json' -f [DateTime]::UtcNow.ToString("yyyyMMdd'T'HHmmss'Z'"))
Write-IsoJson -Path $out -Object ([ordered]@{ evidence = $ev; countsAreUsable = $verdictInputOk; note = '건수는 countsAreUsable=true 일 때만 "관측 0건"이나 "관측 N건"으로 읽는다. false 이면 증거 없음이다.' }) -Depth 12
Write-Host "증거 파일: $out"
Write-Host ("수집 ok={0} 감사 켜짐={1} 로그 밀림={2} 사용 가능={3}" -f $ev.collection.ok, $ev.collection.auditFailureEnabled, $ev.collection.wrapped, $verdictInputOk)
if ($ev.matchedCount) { $ev.matchedCount.Keys | ForEach-Object { Write-Host ("  {0}: 이번 실행으로 맞춘 이벤트 {1}" -f $_, $ev.matchedCount[$_]) } }
Write-Host ("  식별 불가 이벤트: {0}" -f $(if ($null -ne $ev.unidentifiedCount) { $ev.unidentifiedCount } else { '수집 불가(0 아님)' }))
