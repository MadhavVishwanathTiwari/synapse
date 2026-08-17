import type { Metadata } from "next";
import Image from "next/image";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[320px]">
        <Image
          src="/synapse-logo.png"
          alt="Synapse"
          width={1000}
          height={186}
          priority
          className="mx-auto mb-10 h-5 w-auto mix-blend-screen"
        />
        <LoginForm next={next} />
      </div>
    </main>
  );
}
