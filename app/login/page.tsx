import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "로그인",
};

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-xl font-semibold">테스터 로그인</h1>
      <LoginForm />
    </div>
  );
}
