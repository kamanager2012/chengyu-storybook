import { createHash } from "node:crypto";
import { loadStoryModel } from "./story-model.mjs";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function draftStoryFingerprint(story) {
  const content = {
    id: story.id,
    title: story.title,
    pinyin: story.pinyin,
    tagline: story.tagline,
    meaning: story.meaning,
    moral: story.moral,
    sections: story.sections,
  };
  return sha256(Buffer.from(JSON.stringify(content), "utf8"));
}

export function loadDraftStoryCatalog() {
  const published = loadStoryModel().stories;
  return {
    schemaVersion: 1,
    publishedCount: published.length,
    draftCount: 0,
    totalCount: published.length,
    stories: [],
    sourceFiles: [],
    bundleFingerprintSha256: sha256(Buffer.from("", "utf8")),
  };
}

export function draftNarrationPages(story) {
  const page = (id, kind, text, imageFile) => ({
    storyId: story.id,
    id,
    kind,
    text,
    imageFile,
    line: null,
    image: `/draft-stories/${story.id}/${imageFile}`,
    audio: `/audio/${story.id}/${id}.mp3`,
  });
  return [
    page("p0", "cover", `今天我们读《${story.title}》。先记住这个成语，再一起看看故事里发生了什么。`, "cover.jpg"),
    ...story.sections.map((text, index) => page(`p${index + 1}`, "story", text, `p${index + 1}.jpg`)),
    page("moral", "moral", `${story.title}提醒我们：${story.moral}`, "p7.jpg"),
  ];
}

export function loadDraftNarrationStories() {
  const catalog = loadDraftStoryCatalog();
  return catalog.stories.map((story) => ({
    id: story.id,
    title: story.title,
    pinyin: story.pinyin,
    tagline: story.tagline,
    meaning: story.meaning,
    moral: story.moral,
    tone: story.tone,
    cover: `/draft-stories/${story.id}/cover.jpg`,
    pages: draftNarrationPages(story),
    line: null,
    sourcePath: story.sourcePath,
  }));
}


if (process.argv[1]?.endsWith("draft-story-catalog.mjs")) {
  const report = loadDraftStoryCatalog();
  const summary = process.argv.includes("--summary");
  console.log(JSON.stringify(summary ? {
    schemaVersion: report.schemaVersion,
    totalCount: report.totalCount,
    publishedCount: report.publishedCount,
    draftCount: report.draftCount,
    sourceFiles: report.sourceFiles,
    bundleFingerprintSha256: report.bundleFingerprintSha256,
  } : report, null, 2));
}
