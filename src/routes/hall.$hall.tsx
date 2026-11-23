import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { HallShelf } from "@/components/hall-shelf";
import { Petals } from "@/components/petals";
import { SiteFooter } from "@/components/site-footer";
import { storyIndex, type StoryHall } from "@/data/story-index";
import { useDocumentTitle } from "@/lib/document-title";

const EAGER_COVER_COUNT = 4;

const HALL_COPY: Record<
  StoryHall,
  {
    title: string;
    eyebrow: string;
    blurb: (count: number) => string;
    footer: string;
  }
> = {
  child: {
    title: "儿童馆",
    eyebrow: "给小朋友看",
    blurb: (count) => `${count} 本`,
    footer: "儿童馆 · 前 24 本与 11 本重绘 Created with Grok",
  },
  classic: {
    title: "古风馆",
    eyebrow: "国风工笔",
    blurb: (count) => `${count} 本`,
    footer: "古风馆工笔线 · 独立一类发行权清单",
  },
};

function parseHall(value: string): StoryHall | null {
  return value === "child" || value === "classic" ? value : null;
}

export const Route = createFileRoute("/hall/$hall")({
  beforeLoad: ({ params }) => {
    if (!parseHall(params.hall)) {
      throw redirect({ to: "/" });
    }
  },
  component: HallPage,
});

function HallPage() {
  const { hall: hallParam } = Route.useParams();
  const hall = parseHall(hallParam) ?? "child";
  const copy = HALL_COPY[hall];
  const items = storyIndex.filter((item) => item.hall === hall);
  const otherHall: StoryHall = hall === "child" ? "classic" : "child";

  useDocumentTitle(copy.title);

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <Petals />
      <div className="relative mx-auto w-full max-w-6xl px-3 pb-8 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="text-sm text-muted">
            回选馆
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/hall/$hall"
              params={{ hall: otherHall }}
              className="rounded-full bg-panel px-3 py-1.5 text-xs text-ink ring-1 ring-line/80"
            >
              去{HALL_COPY[otherHall].title}
            </Link>
            <span className="rounded-full bg-emerald-700/85 px-3 py-1.5 text-xs text-panel shadow-sm">全册免费</span>
          </div>
        </div>

        <header className="mb-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.28em] text-muted">{copy.eyebrow}</p>
            <h1 className="mt-0.5 font-display text-4xl text-cinnabar sm:text-5xl">{copy.title}</h1>
          </div>
          <p className="pb-1 text-sm text-ink-soft">{copy.blurb(items.length)}</p>
        </header>

        <HallShelf hall={hall} items={items} eagerCount={EAGER_COVER_COUNT} compact />

        <SiteFooter attribution={copy.footer} />
      </div>
    </main>
  );
}
