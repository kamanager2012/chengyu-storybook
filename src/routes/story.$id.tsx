import { createFileRoute, Link } from "@tanstack/react-router";
import { DraftStoryReader } from "@/components/draft-story-reader";
import { IllustratedStoryReader } from "@/components/illustrated-story-reader";
import { SiteFooter } from "@/components/site-footer";
import { resolveStoryHall, storyForHall } from "@/data/story-editions";
import { storyIndex, type StoryHall } from "@/data/story-index";
import { useDocumentTitle } from "@/lib/document-title";

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

  return <MissingStory />;
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
