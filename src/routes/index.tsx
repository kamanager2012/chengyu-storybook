import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Petals } from "@/components/petals";
import { SiteFooter } from "@/components/site-footer";
import { COMMERCE } from "@/data/commerce";
import { storyIndex } from "@/data/story-index";
import { readSessionToken, syncAccountEntitlement } from "@/lib/account";
import { isPayConfigured } from "@/lib/checkout";
import { useDocumentTitle } from "@/lib/document-title";
import { publicAsset } from "@/lib/public-asset";

export const Route = createFileRoute("/")({ component: Home });

function hallPreviewCovers(hall: "child" | "classic", count = 3) {
  return storyIndex
    .filter((item): item is Extract<typeof item, { kind: "media" }> => item.hall === hall && item.kind === "media")
    .slice(0, count)
    .map((item) => ({ id: item.id, title: item.title, cover: item.cover }));
}

function Home() {
  useDocumentTitle();
  const childCount = storyIndex.filter((item) => item.hall === "child").length;
  const classicCount = storyIndex.filter((item) => item.hall === "classic").length;
  const childCovers = hallPreviewCovers("child");
  const classicCovers = hallPreviewCovers("classic");
  const [entitlementTick, setEntitlementTick] = useState(0);

  useEffect(() => {
    if (!isPayConfigured() || !readSessionToken()) return;
    let cancelled = false;
    void (async () => {
      try {
        await syncAccountEntitlement();
        if (!cancelled) setEntitlementTick((value) => value + 1);
      } catch {
        // Keep local entitlement if sync fails offline.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="relative min-h-dvh overflow-hidden" data-entitlement-tick={entitlementTick}>
      <Petals />
      <div className="relative mx-auto w-full max-w-3xl px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <header className="mb-6">
          <p className="text-sm tracking-[0.35em] text-muted">3–8 岁亲子有声绘本</p>
          <h1 className="mt-1 font-display text-5xl text-cinnabar sm:text-6xl">成语故事</h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-ink-soft">先选一座馆，再慢慢翻。</p>
        </header>

        <section className="relative mb-6 overflow-hidden rounded-[28px] book-spine">
          <img
            src={publicAsset("/ui/bookshelf-paper.svg")}
            alt=""
            decoding="async"
            fetchPriority="high"
            className="h-36 w-full object-cover sm:h-44"
          />
          <div className="absolute inset-0 bg-linear-to-r from-ink/65 via-ink/30 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-6">
            <p className="font-display text-2xl text-panel sm:text-3xl">先走进一座馆</p>
            <p className="mt-1 text-sm text-panel/90">看图听故事，馆不同，画风不同。</p>
          </div>
        </section>

        <div className="mb-6 flex items-center justify-between gap-3">
          <p className="text-xs text-muted">免费可看 {COMMERCE.freeCount} 本经典成语</p>
          <Link
            to="/unlock"
            search={{}}
            className="shrink-0 rounded-full bg-cinnabar px-3 py-1.5 text-xs text-panel shadow-panel"
          >
            {COMMERCE.priceYuan} 元 / 年
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <HallEntrance
            hall="child"
            title="儿童馆"
            eyebrow="给小朋友看"
            description={`${childCount} 本水彩绘本，字跟旁白一起亮。`}
            covers={childCovers}
            accent="cinnabar"
          />
          <HallEntrance
            hall="classic"
            title="古风馆"
            eyebrow="国风工笔"
            description={`${classicCount} 本工笔线，安静翻看。`}
            covers={classicCovers}
            accent="ink"
          />
        </div>

        <SiteFooter attribution="100 个成语 · 两座馆 · 各自独立书架" />
      </div>
    </main>
  );
}

function HallEntrance({
  hall,
  title,
  eyebrow,
  description,
  covers,
  accent,
}: {
  hall: "child" | "classic";
  title: string;
  eyebrow: string;
  description: string;
  covers: { id: string; title: string; cover: string }[];
  accent: "cinnabar" | "ink";
}) {
  return (
    <Link
      to="/hall/$hall"
      params={{ hall }}
      data-hall-entrance={hall}
      className="group overflow-hidden rounded-[32px] bg-panel shadow-panel ring-1 ring-line/70 transition-transform duration-200 hover:-translate-y-1"
    >
      <div className="grid grid-cols-3 gap-0.5 bg-paper-deep p-0.5">
        {covers.map((cover) => (
          <div key={cover.id} className="relative aspect-[3/4] overflow-hidden rounded-[18px]">
            <img
              src={cover.cover}
              alt=""
              decoding="async"
              className="absolute inset-0 size-full object-cover object-[center_35%] transition-transform duration-500 group-hover:scale-[1.04]"
            />
          </div>
        ))}
      </div>
      <div className="p-4">
        <p className="text-xs tracking-[0.28em] text-muted">{eyebrow}</p>
        <h2 className={`mt-0.5 font-display text-3xl ${accent === "cinnabar" ? "text-cinnabar" : "text-ink"}`}>{title}</h2>
        <p className="mt-2 text-sm leading-6 text-ink-soft">{description}</p>
        <p className="mt-4 text-sm text-cinnabar">进入{title} →</p>
      </div>
    </Link>
  );
}
