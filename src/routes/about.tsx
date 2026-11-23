import { createFileRoute, Link } from "@tanstack/react-router";
import { Petals } from "@/components/petals";
import { SiteFooter } from "@/components/site-footer";
import { storyCount } from "@/data/story-index";
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
          <section>
            <h2 className="font-sans text-base font-semibold text-ink">这是什么</h2>
            <p className="mt-1">
              {storyCount} 个中国成语，每个成语是一本小绘本：封面、7 页故事，最后一页讲成语的意思和小道理。儿童馆是水彩画，古风馆是工笔画，同一个成语两种画风都能看。适合 3–8 岁亲子共读。
            </p>
          </section>
          <section>
            <h2 className="font-sans text-base font-semibold text-ink">怎么读</h2>
            <p className="mt-1">
              先选儿童馆或古风馆，再从书架上挑一本。左右滑动或点下方的箭头翻页，点页码小圆点可以直接跳页。旁白会一页一页自动朗读，读完自动翻页；没出声的话，点上方的「播放旁白」。
            </p>
            <p className="mt-2">
              在手机浏览器里选「添加到主屏幕」，就能像 App 一样打开。看过的页面，断网后还能再看图；听旁白需要联网。
            </p>
          </section>
          <section>
            <h2 className="font-sans text-base font-semibold text-ink">免费与授权</h2>
            <p className="mt-1">
              全部 {storyCount} 本永久免费，无需注册登录。作品以 CC BY-NC-SA 4.0（署名—非商业性使用—相同方式共享）发布，欢迎家庭和公益教育机构非商业地使用与分享，未经授权不得商用。
            </p>
          </section>
          <section>
            <h2 className="font-sans text-base font-semibold text-ink">插图与旁白</h2>
            <p className="mt-1" data-grok-attribution="true">
              插图由 AI 生成，封面和最后一页的小字注明了来源。用 Grok Imagine 生成的页面标有 Created with Grok。儿童馆后来补的水彩里，有 11 本也是 Grok Imagine，同样标注；其余 65 本是后来的重绘。古风馆里另有一套工笔画，标为「工笔线」。没有 Created with Grok 标注的，是其他工具生成或重绘的版本。
            </p>
            <p className="mt-2">旁白是合成的讲故事声音。</p>
          </section>
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}
