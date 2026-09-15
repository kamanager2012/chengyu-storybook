import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Home } from "lucide-react";
import { Petals } from "@/components/petals";
import type { DraftStory } from "@/data/story-catalog";
import { cn } from "@/lib/utils";

const TONE_STAGE: Record<DraftStory["tone"], string> = {
  wheat: "from-wheat/75 via-[#8a5a28] to-ink",
  bamboo: "from-bamboo/75 via-[#2f5a42] to-ink",
  bell: "from-bell/75 via-[#7a241c] to-ink",
  pasture: "from-pasture/75 via-[#3f5a2c] to-ink",
  well: "from-well/75 via-[#244a5c] to-ink",
  temple: "from-temple/75 via-[#5a1c14] to-ink",
};

type DraftPage = {
  id: string;
  kind: "cover" | "story" | "moral";
  text: string;
};

function buildPages(story: DraftStory): DraftPage[] {
  return [
    { id: "p0", kind: "cover", text: story.tagline },
    ...story.sections.map((text, index) => ({
      id: `p${index + 1}`,
      kind: "story" as const,
      text,
    })),
    { id: "moral", kind: "moral", text: story.moral },
  ];
}

export function DraftStoryReader({ story }: { story: DraftStory }) {
  const pages = useMemo(() => buildPages(story), [story]);
  const [index, setIndex] = useState(0);
  const page = pages[index]!;
  const last = pages.length - 1;
  const isCover = page.kind === "cover";
  const isMoral = page.kind === "moral";

  function goTo(target: number) {
    setIndex((current) => {
      const next = Math.max(0, Math.min(last, target));
      return next === current ? current : next;
    });
  }

  function goBy(delta: number) {
    setIndex((current) => Math.max(0, Math.min(last, current + delta)));
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex((current) => Math.max(0, Math.min(last, current + 1)));
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((current) => Math.max(0, Math.min(last, current - 1)));
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);

  return (
    <main
      className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-ink"
      data-draft-story="true"
      data-picture-book="true"
    >
      <div className={cn("absolute inset-0 book-stage bg-linear-to-br", TONE_STAGE[story.tone])}>
        <div className="absolute inset-[9%] rounded-[40px] border border-panel/18" />
        <div className="absolute left-[13%] top-[15%] size-36 rounded-full bg-panel/12" />
        <div className="absolute bottom-[16%] right-[11%] size-44 rounded-full bg-ink/25" />
        <div className="absolute inset-0 bg-linear-to-b from-ink/10 via-transparent to-ink/55" />
        <Petals />
      </div>

      <header className="relative z-10 flex items-center justify-between gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          to="/hall/$hall"
          params={{ hall: "child" }}
          className="grid size-12 place-items-center rounded-full bg-panel/90 text-ink shadow-panel transition-transform duration-150 active:scale-[0.96]"
          aria-label="返回书架"
        >
          <Home className="size-5" />
        </Link>
        <div className="min-w-0 text-center">
          <p className="font-display text-xl text-panel drop-shadow-sm">{story.title}</p>
          <p className="text-xs tracking-widest text-panel/80">{story.pinyin}</p>
        </div>
        <span className="rounded-full bg-panel/90 px-3 py-2 text-xs font-medium text-cinnabar">绘本</span>
      </header>

      <section className="relative z-10 flex min-h-0 flex-1 items-end justify-center px-3 pb-3">
        <article className="paper-panel w-full max-w-2xl rounded-[28px] px-5 py-5 shadow-book">
          {isCover ? (
            <div className="text-center">
              <p className="text-xs tracking-[0.28em] text-muted">绘本 · 插图待配</p>
              <h1 className="mt-2 font-display text-4xl text-cinnabar sm:text-5xl">{story.title}</h1>
              <p className="mt-1 text-sm tracking-[0.25em] text-muted">{story.pinyin}</p>
              <p className="mt-3 text-base text-ink-soft">{story.tagline}</p>
              <p className="mt-4 text-sm leading-relaxed text-muted">
                这本已经按绘本分页。插图和旁白还在制作，先翻页读故事。
              </p>
            </div>
          ) : isMoral ? (
            <div className="text-center">
              <p className="text-xs tracking-[0.35em] text-muted">成语的意思</p>
              <h2 className="mt-1 font-display text-3xl text-cinnabar sm:text-4xl">{story.title}</h2>
              <p className="mt-3 text-base leading-relaxed text-ink-soft">{story.meaning}</p>
              <div className="my-4 h-px bg-line" />
              <p className="text-xs tracking-[0.35em] text-muted">小道理</p>
              <p className="mt-2 text-[1.05rem] leading-relaxed text-ink">{story.moral}</p>
            </div>
          ) : (
            <p className="page-copy min-h-20 text-center text-[1.35rem] leading-relaxed text-ink sm:text-2xl">{page.text}</p>
          )}

          <p className="mt-4 text-center text-[11px] font-medium tracking-wide text-muted">绘本页 · 插图制作中</p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => goBy(-1)}
              disabled={index === 0}
              className="grid size-12 shrink-0 place-items-center rounded-full bg-paper-deep text-ink transition-transform duration-150 active:scale-[0.96] disabled:opacity-30"
              aria-label="上一页"
            >
              <ChevronLeft className="size-6" />
            </button>
            <div className="min-w-0 flex-1 text-center">
              <p className="text-sm font-medium text-ink">
                {index + 1} / {pages.length}
              </p>
              <p className="mt-1 text-[11px] text-muted">旁白未制作，不提供播放</p>
            </div>
            <button
              type="button"
              onClick={() => goBy(1)}
              disabled={index === last}
              className="grid size-12 shrink-0 place-items-center rounded-full bg-paper-deep text-ink transition-transform duration-150 active:scale-[0.96] disabled:opacity-30"
              aria-label="下一页"
            >
              <ChevronRight className="size-6" />
            </button>
          </div>

          <div className="mx-auto mt-1 grid w-full max-w-sm grid-cols-9" aria-label="页码">
            {pages.map((item, pageIndex) => (
              <button
                key={item.id}
                type="button"
                onClick={() => goTo(pageIndex)}
                className="grid min-h-10 min-w-0 place-items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-cinnabar/60"
                aria-label={`第 ${pageIndex + 1} 页`}
                aria-current={pageIndex === index ? "page" : undefined}
              >
                <span
                  className={cn("size-2.5 rounded-full transition-transform", pageIndex === index ? "scale-125 bg-cinnabar" : "bg-line")}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>

          {isMoral && (
            <Link
              to="/hall/$hall"
              params={{ hall: "child" }}
              className="mx-auto mt-5 flex h-12 max-w-xs items-center justify-center rounded-full bg-cinnabar px-6 text-base font-medium text-panel transition-transform duration-150 active:scale-[0.96]"
            >
              回书架
            </Link>
          )}
        </article>
      </section>
    </main>
  );
}
