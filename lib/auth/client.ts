import { createAuthClient } from "better-auth/react";

// 별도 baseURL 설정 없이 same-origin(app/api/auth/[...all]/route.ts)을 사용한다.
export const authClient = createAuthClient();
