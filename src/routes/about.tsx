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
        <h1 className="mt-1 font-display text-4xl text-cinnabar">给小朋友的有声绘本馆</h1>
        <div className="mt-6 space-y-4 text-sm leading-7 text-ink-soft">
          <p>
            这里有 {COMMERCE.catalogCount} 个中国成语，做成有声绘本：看图画、听旁白、读句子、记住小道理。适合 3–8
            岁，也适合家长一起翻。首页先选馆——儿童馆是给小朋友看的画风；古风馆是同一批成语的国风工笔。
          </p>
          <p>
            免费可看 {COMMERCE.freeCount} 本。全年册 {COMMERCE.priceYuan} 元，开通后一年内可以反复阅读全部绘本。
          </p>
          <p>
            想换设备继续读，可用邮箱注册账号，把开通挂在账号上。不注册也能先在这台设备上看免费故事。
          </p>
          <p data-grok-attribution="true">
            古风馆主图和前 24 本儿童线由 Grok Imagine 生成，这些页标注 Created with Grok。儿童馆后来补的水彩里，有 11
            本也是 Grok Imagine，同样标注；其余 65 本是后来的重绘，不使用该标注。工笔线是古风馆里前 24
            本的另一套图，已有 Cursor 生成记录，作为独立一类纳入发行权清单，不并入 Grok 主图。
          </p>
          <p>
            旁白目前是合成语音（正在换成更自然的讲故事音色）。经正文与音频校验后才会出现播放键；点击播放后才加载这一页的声音。
          </p>
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}
