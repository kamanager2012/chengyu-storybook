import { Link } from "@tanstack/react-router";

export function SiteFooter({ attribution }: { attribution?: string }) {
  return (
    <footer className="mt-10 space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-muted">
      {attribution ? (
        <p data-grok-attribution="true" className="font-medium tracking-wide">
          {attribution}
        </p>
      ) : null}
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2" aria-label="站点信息">
        <Link to="/about" className="underline-offset-4 hover:text-ink hover:underline">
          关于
        </Link>
        <Link to="/privacy" className="underline-offset-4 hover:text-ink hover:underline">
          隐私
        </Link>
      </nav>
      <p>适合 3–8 岁亲子共读。阅读记录只保存在这台设备上。</p>
    </footer>
  );
}
