/** Matches verified `/audio/<id>/pN.mp3` or pilot `/audio-voices/<id>/<voice>/pN.mp3`. */
export function narrationPageSrcRe(storyId: string, pageId: string): RegExp {
  return new RegExp(`/audio(?:-voices)?/${storyId}/(?:[a-z0-9_-]+/)?${pageId}\\.mp3`);
}

export function isNarrationAudioPath(pathname: string, storyId: string, pageId?: string): boolean {
  const escaped = storyId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const page = pageId ? pageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "[a-z0-9_-]+";
  return new RegExp(`^/audio(?:-voices)?/${escaped}/(?:[a-z0-9_-]+/)?${page}\\.mp3$`).test(pathname);
}
