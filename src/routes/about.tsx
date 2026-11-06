import { createFileRoute, Link } from "@tanstack/react-router";
import { Petals } from "@/components/petals";
import { SiteFooter } from "@/components/site-footer";
import { COMMERCE } from "@/data/commerce";
import { useDocumentTitle } from "@/lib/document-title";

export const Route = createFileRoute("/about")({
  component: AboutPage,
});

function AboutPage() {
  useDocumentTitle("关于");

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <Petals />
      <div className="relative mx-auto w-full max-w-2xl px-4 pb-16 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <Link to="/" className="text-sm text-muted">
          回选馆
        </Link>
        <p className="mt-6 text-sm tracking-[0.35em] text-muted">成语故事</p>
        <h1 className="mt-1 font-display text-4xl text-cinnabar">成册翻页，两座馆</h1>
        <div className="mt-6 space-y-4 text-sm leading-7 text-ink-soft">
          <p>
            这不是几万集的故事 App，而是一本本翻完的成语绘本馆：{COMMERCE.catalogCount}{" "}
            个成语，看图、听旁白、读句子、记住小道理。适合 3–8 岁亲子共读。儿童馆水彩、古风馆工笔，同一批故事两套画。
          </p>
          <p>
            全套 {COMMERCE.catalogCount} 本成语绘本永久免费开放畅读，无需付费。采用 MIT 许可证开源，欢迎亲子共读与学习传播。
          </p>
          <p>
            采用 Local-first 纯静态架构，无需注册登录即可在任意设备流畅阅读全部绘本。阅读与离线缓存均在本地完成。
          </p>
          <p data-grok-attribution="true">
            古风馆主图和前 24 本儿童线由 Grok Imagine 生成，这些页标注 Created with Grok。儿童馆后来补的水彩里，有 11
            本也是 Grok Imagine，同样标注；其余 65 本是后来的重绘，不使用该标注。工笔线是古风馆里前 24
            本的另一套图，已有 Cursor 生成记录，作为独立一类纳入发行权清单，不并入 Grok 主图。
          </p>
          <p>
            旁白为合成讲故事音色，经正文与音频校验后才会出现播放键；点击播放后才加载这一页的声音。
          </p>
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}
