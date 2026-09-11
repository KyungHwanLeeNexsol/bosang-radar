import { processCaseJob } from "../../lib/cases/create-case";

// config.background는 호출자에게 즉시 202를 반환하고 최대 15분 동안 작업을
// 계속 실행하게 한다(Netlify Free 포함). 파일명 suffix 방식도 호환되지만,
// 설정을 코드에 명시해 함수의 의도를 배포 도구가 직접 읽게 한다.
async function handler(request: Request) {
  let jobId: unknown;
  try {
    jobId = JSON.parse(await request.text()).jobId;
  } catch {
    return new Response("invalid request", { status: 400 });
  }

  if (typeof jobId !== "string" || jobId.length === 0) {
    return new Response("jobId is required", { status: 400 });
  }

  await processCaseJob(jobId);
  return new Response(null, { status: 202 });
}

export default handler;

export const config = {
  background: true,
};
