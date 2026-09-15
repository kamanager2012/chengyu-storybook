import { Link } from "@tanstack/react-router";
import { BookOpen, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { canReadStory } from "@/lib/entitlement";
import { type StoryHall, type StoryIndexItem, type StoryIndexTone } from "@/data/story-index";
import { cn } from "@/lib/utils";

const DEFERRED_COVER_ROOT_MARGIN = "120px 0px";

const TONE_RING: Record<StoryIndexTone, string> = {
  wheat: "ring-wheat/70",
  bamboo: "ring-bamboo/70",
  bell: "ring-bell/70",
  pasture: "ring-pasture/70",
  well: "ring-well/70",
  temple: "ring-temple/70",
};

const TONE_BG: Record<StoryIndexTone, string> = {
  wheat: "from-wheat/35 via-paper to-panel",
  bamboo: "from-bamboo/30 via-paper to-panel",
  bell: "from-bell/25 via-paper to-panel",
  pasture: "from-pasture/30 via-paper to-panel",
  well: "from-well/25 via-paper to-panel",
  temple: "from-temple/25 via-paper to-panel",
};

let sharedCoverObserver: IntersectionObserver | null = null;
const deferredCoverCallbacks = new Map<Element, () => void>();

function getSharedCoverObserver(): IntersectionObserver | null {
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
    return null;
  }
  if (!sharedCoverObserver) {
    sharedCoverObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const callback = deferredCoverCallbacks.get(entry.target);
            if (callback) {
              deferredCoverCallbacks.delete(entry.target);
              sharedCoverObserver?.unobserve(entry.target);
              callback();
            }
          }
        }
      },
      { rootMargin: DEFERRED_COVER_ROOT_MARGIN },
    );
  }
  return sharedCoverObserver;
}

function DeferredCover({ src, alt }: { src: string; alt: string }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [activeSrc, setActiveSrc] = useState<string>();

  useEffect(() => {
    const image = imageRef.current;
    if (!image || activeSrc) return;

    const observer = getSharedCoverObserver();
    if (!observer) {
      setActiveSrc(src);
      return;
    }

    deferredCoverCallbacks.set(image, () => {
      setActiveSrc(src);
    });
    observer.observe(image);

    return () => {
      deferredCoverCallbacks.delete(image);
      observer.unobserve(image);
    };
  }, [activeSrc, src]);

  return (
    <img
      ref={imageRef}
      src={activeSrc}
      alt={alt}
      decoding="async"
      fetchPriority="low"
      data-cover-loading="deferred"
      className="absolute inset-0 size-full object-cover object-[center_35%] transition-transform duration-500 group-hover:scale-[1.04]"
    />
  );
}

function StoryCard({ item, eager, index }: { item: StoryIndexItem; eager: boolean; index: number }) {
  const unlocked = canReadStory(item.id);

  return (
    <li className="rise-in" style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}>
      <Link
        to="/story/$id"
        params={{ id: item.id }}
        search={{ hall: item.hall }}
        className="group block rounded-[24px] focus:outline-none focus-visible:ring-4 focus-visible:ring-cinnabar/50 focus-visible:ring-offset-4 focus-visible:ring-offset-paper"
        data-story-hall={item.hall}
        {...(item.kind === "media" ? { "data-media-story": "true" } : { "data-text-story": "true" })}
        {...(unlocked ? {} : { "data-locked-story": "true" })}
      >
        <article
          className={cn(
            "overflow-hidden rounded-[24px] bg-panel ring-2 book-spine transition-transform duration-200 ease-out group-hover:-translate-y-1 group-active:scale-[0.98]",
            TONE_RING[item.tone],
          )}
        >
          <div className="relative aspect-[3/4] overflow-hidden bg-paper-deep">
            {item.kind === "media" ? (
              eager ? (
                <img
                  src={item.cover}
                  alt={`${item.title}封面`}
                  decoding="async"
                  fetchPriority="high"
                  data-cover-loading="eager"
                  className="absolute inset-0 size-full object-cover object-[center_35%] transition-transform duration-500 group-hover:scale-[1.04]"
                />
              ) : (
                <DeferredCover src={item.cover} alt={`${item.title}封面`} />
              )
            ) : (
              <div className={cn("absolute inset-0 grid place-items-center bg-linear-to-br", TONE_BG[item.tone])}>
                <div className="absolute left-[12%] top-[12%] size-20 rounded-full border border-ink/5" />
                <div className="absolute bottom-[14%] right-[10%] size-24 rounded-full bg-panel/45" />
                <div className="relative px-4 text-center">
                  <BookOpen className="mx-auto mb-3 size-9 text-cinnabar/75" aria-hidden="true" />
                  <p className="font-display text-3xl leading-tight text-ink">{item.title}</p>
                  <p className="mt-2 text-[10px] tracking-[0.16em] text-muted">{item.pinyin}</p>
                  <span className="mt-4 inline-flex rounded-full bg-panel/80 px-2.5 py-1 text-[10px] font-medium text-cinnabar ring-1 ring-line/70">
                    待配图
                  </span>
                </div>
              </div>
            )}

            {item.kind === "media" && (
              <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-ink/80 via-ink/25 to-transparent px-3 pb-3 pt-16">
                <h3 className="font-display text-2xl leading-tight text-panel drop-shadow-sm">{item.title}</h3>
                <p className="text-[11px] tracking-widest text-panel/85">{item.pinyin}</p>
              </div>
            )}
            {!unlocked && (
              <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-ink/70 px-2 py-1 text-[10px] text-panel">
                <Lock className="size-3" aria-hidden="true" />
                开通
              </div>
            )}
          </div>
        </article>
      </Link>
    </li>
  );
}

export function HallShelf({
  hall,
  items,
  eagerCount = 0,
  compact = false,
}: {
  hall: StoryHall;
  items: StoryIndexItem[];
  eagerCount?: number;
  compact?: boolean;
}) {
  return (
    <section id={`hall-${hall}`} className={compact ? "mb-6" : "mb-10"} data-shelf-hall={hall}>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-4 xl:grid-cols-5 lg:gap-4">
        {items.map((item, index) => (
          <StoryCard key={`${item.id}:${item.hall}`} item={item} eager={item.kind === "media" && index < eagerCount} index={index} />
        ))}
      </ul>
    </section>
  );
}

