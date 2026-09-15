import { createFileRoute, Link } from "@tanstack/react-router";
import { DraftStoryReader } from "@/components/draft-story-reader";
import { IllustratedStoryReader } from "@/components/illustrated-story-reader";
import { SiteFooter } from "@/components/site-footer";
import { COMMERCE } from "@/data/commerce";
import { resolveStoryHall, storyForHall } from "@/data/story-editions";
import { storyIndex, type StoryHall } from "@/data/story-index";
import { useDocumentTitle } from "@/lib/document-title";
import { canReadStory } from "@/lib/entitlement";

function parseHall(value: unknown): StoryHall | undefined {
  return value === "child" || value === "classic" ? value : undefined;
}

export const Route = createFileRoute("/story/$id")({
  validateSearch: (search: Record<string, unknown>): { hall?: StoryHall } => {
    const hall = parseHall(search.hall);
    return hall ? { hall } : {};
  },
  loader: async ({ params }) => {
    const item = storyIndex.find((candidate) => candidate.id === params.id);
    if (!item) return { kind: "missing" } as const;
    if (!canReadStory(params.id)) {
      return { kind: "locked", id: params.id, title: item.title } as const;
    }

    if (item.kind === "media") {
      const { getStory } = await import("@/data/stories");
      const published = getStory(params.id);
      if (published) return { kind: "media", story: published } as const;
      const { getDraftMediaStory } = await import("@/data/story-catalog");
      const draft = getDraftMediaStory(params.id);
      return draft ? ({ kind: "media", story: draft } as const) : ({ kind: "missing" } as const);
    }

    const { getDraftStory } = await import("@/data/story-catalog");
    const story = getDraftStory(params.id);
    return story ? ({ kind: "text", story } as const) : ({ kind: "missing" } as const);
  },
  component: StoryRoute,
});

function StoryRoute() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();

  if (data.kind === "media") {
    const hall = resolveStoryHall(data.story.id, search.hall);
    return <IllustratedStoryReader key={`${data.story.id}:${hall}`} story={storyForHall(data.story, hall)} hall={hall} />;
  }
  if (data.kind === "text") return <DraftStoryReader story={data.story} />;
  if (data.kind === "locked") {
    return <LockedStory id={data.id} title={data.title} />;
  }

  return <MissingStory />;
}

function LockedStory({ id, title }: { id: string; title: string }) {
  useDocumentTitle(title);
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-sm tracking-[0.3em] text-muted">全年册故事</p>
        <h1 className="mt-2 font-display text-3xl text-cinnabar">{title}</h1>
        <p className="mt-3 text-sm text-ink-soft">
          免费可看 {COMMERCE.freeCount} 本。这本在全年册里，{COMMERCE.priceYuan} 元开通一年。
        </p>
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            to="/unlock"
            search={{ from: id }}
            className="inline-flex h-12 items-center rounded-full bg-cinnabar px-6 text-panel"
          >
            查看全年册
          </Link>
          <Link to="/hall/$hall" params={{ hall: "child" }} className="inline-flex h-12 items-center rounded-full bg-panel px-6 text-ink">
            回书架
          </Link>
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}

function MissingStory() {
  useDocumentTitle("没有找到");
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <h1 className="font-display text-3xl text-cinnabar">没有找到这本故事</h1>
        <Link to="/hall/$hall" params={{ hall: "child" }} className="mt-4 inline-flex h-12 items-center rounded-full bg-cinnabar px-6 text-panel">
          回书架
        </Link>
        <SiteFooter />
      </div>
    </main>
  );
}
