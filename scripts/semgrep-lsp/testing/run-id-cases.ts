// 시험 전용: --run-id / runId 규칙의 사례 표. 단위·CLI·하네스 시험이 같은 표를 쓴다(규칙은 run-id.ts 한 곳).

/** 거절해야 하는 값. 경로를 벗어나거나 증거 폴더 이름이 될 수 없는 값들이다. */
export const INVALID_RUN_IDS: readonly { name: string; value: string }[] = [
  { name: "상위 폴더로 나가는 값", value: "../escaped" },
  { name: "더 깊이 나가는 값", value: "../../escaped" },
  { name: "하위 경로가 붙은 값", value: "a/b" },
  { name: "슬래시로 시작하는 절대 경로", value: "/abs" },
  { name: "역슬래시 구분자", value: "a\\b" },
  { name: "역슬래시로 나가는 값", value: "..\\escaped" },
  { name: "Windows 드라이브 경로", value: "C:\\x" },
  { name: "점 하나", value: "." },
  { name: "점 둘", value: ".." },
  { name: "점으로 시작", value: ".hidden" },
  { name: "밑줄로 시작", value: "_x" },
  { name: "하이픈으로 시작", value: "-x" },
  { name: "공백 포함", value: "run id" },
  { name: "앞 공백", value: " run" },
  { name: "끝의 개행", value: "run\n" },
  { name: "ASCII가 아닌 영숫자(전각)", value: "ａ" },
  { name: "한글", value: "실행" },
  { name: "콜론(대체 데이터 스트림 표기)", value: "run:stream" },
  { name: "129자", value: "a".repeat(129) },
  { name: "300자", value: "a".repeat(300) },
];

/** 받아들여야 하는 경계 값. 길이 1·128, 점·밑줄·하이픈이 안에 있는 값. */
export const VALID_RUN_IDS: readonly { name: string; value: string }[] = [
  { name: "1자", value: "a" },
  { name: "숫자 하나", value: "0" },
  { name: "대문자 하나", value: "Z" },
  { name: "일반 값", value: "run-cli-1" },
  { name: "점·밑줄·하이픈이 섞인 값", value: "run_1.2-3" },
  { name: "연속한 점(한 폴더 이름)", value: "a..b" },
  { name: "끝이 점", value: "a." },
  { name: "128자", value: "a".repeat(128) },
  { name: "128자(하이픈 127개)", value: `a${"-".repeat(127)}` },
];
