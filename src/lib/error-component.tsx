import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-paper px-6 text-center text-ink">
      <span className="text-cinnabar" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="font-display text-2xl">出了一点小问题</h1>
      <p className="max-w-md text-sm break-words text-ink-soft">{error.message || "请再试一次。"}</p>
      <Link to="/" className="mt-2 inline-flex h-12 items-center rounded-full bg-cinnabar px-6 text-panel">
        回书架
      </Link>
    </main>
  );
}

export function AppNotFoundComponent() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-paper px-6 text-center text-ink">
      <h1 className="font-display text-3xl text-cinnabar">这一页不在绘本馆里</h1>
      <p className="text-sm text-ink-soft">回书架挑一本喜欢的故事吧。</p>
      <Link to="/" className="mt-2 inline-flex h-12 items-center rounded-full bg-cinnabar px-6 text-panel">
        回书架
      </Link>
    </main>
  );
}
