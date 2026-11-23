import { createFileRoute, Link } from "@tanstack/react-router";
import { Petals } from "@/components/petals";
import { SiteFooter } from "@/components/site-footer";
import { useDocumentTitle } from "@/lib/document-title";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  useDocumentTitle("隐私");

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <Petals />
      <div className="relative mx-auto w-full max-w-2xl px-4 pb-16 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <Link to="/" className="text-sm text-muted">
          回选馆
        </Link>
        <p className="mt-6 text-sm tracking-[0.35em] text-muted">成语故事</p>
        <h1 className="mt-1 font-display text-4xl text-cinnabar">隐私说明</h1>
        <div className="mt-6 space-y-4 text-sm leading-7 text-ink-soft">
          <p>本应用面向儿童与家长，无需注册或登录即可阅读全部绘本，不收集账号、邮箱或支付信息。</p>
          <p>我们不在应用内嵌入统计分析工具，也不把孩子的翻页记录上传到服务器。</p>
          <p>
            旁白声音一页一页地加载，只加载你正在看的这一页，也不会自动存进离线缓存。看过的图片和页面文件会保存在你自己的浏览器里，方便断网时再翻看。
          </p>
          <p>
            插图为 AI 生成。用 Grok Imagine 生成插图的书（包括 11 本儿童馆 Grok 重绘），封面和最后一页标注 Created with Grok；古风馆里另有一套工笔画，标为「工笔线」，不使用这个标注。
          </p>
          <p>
            AI 生成本身不等于获得发行许可。更详细的来源说明见
            <Link to="/about" className="text-cinnabar underline underline-offset-4">
              关于页
            </Link>
            。
          </p>
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}
