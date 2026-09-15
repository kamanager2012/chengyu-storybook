export const STORY_HREF_RE = /^\/story\/[a-z0-9-]+(?:\?hall=(?:child|classic))?$/;

export function storyIdFromHref(href: string) {
  const id = new URL(href, "http://chengyu.test").pathname.split("/").pop();
  if (!id) throw new Error(`invalid story href: ${href}`);
  return id;
}
