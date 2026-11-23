/** Matches verified `/audio/<id>/<page>.mp3` narration. */
export function narrationPageSrcRe(storyId: string, pageId: string): RegExp {
  return new RegExp(`/audio/${storyId}/${pageId}\\.mp3`);
}

export function isNarrationAudioPath(pathname: string, storyId: string, pageId?: string): boolean {
  const escaped = storyId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const page = pageId ? pageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "[a-z0-9_-]+";
  return new RegExp(`^/audio/${escaped}/${page}\\.mp3$`).test(pathname);
}
