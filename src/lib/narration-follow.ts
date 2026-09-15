export type FollowToken = {
  text: string;
  weight: number;
  spoken: boolean;
};

/** Narration tracks have a short lead-in; keep the highlight off that silence. */
export const LEAD_RATIO = 0.06;
export const TAIL_RATIO = 0.04;

const PUNCT = /[\s，。！？、；：…—·「」『』“”‘’《》【】（）()!,.;:?]/u;

export function tokenizeFollowText(text: string): FollowToken[] {
  const tokens: FollowToken[] = [];
  for (const char of Array.from(text)) {
    if (PUNCT.test(char)) {
      const previous = tokens[tokens.length - 1];
      if (previous) previous.text += char;
      else tokens.push({ text: char, weight: 0, spoken: false });
      continue;
    }
    tokens.push({ text: char, weight: 1, spoken: true });
  }
  return tokens;
}

export function spokenProgress(currentTime: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const t = Math.min(Math.max(currentTime, 0), duration) / duration;
  const span = 1 - LEAD_RATIO - TAIL_RATIO;
  if (span <= 0) return t;
  return Math.min(1, Math.max(0, (t - LEAD_RATIO) / span));
}

export function activeSpokenIndex(tokens: FollowToken[], progress: number): number {
  let spoken = 0;
  for (const token of tokens) spoken += token.weight;
  if (spoken === 0) return -1;
  const clamped = Math.min(1, Math.max(0, progress));
  const target = Math.min(spoken - 1, Math.floor(clamped * spoken));
  let seen = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    if (!tokens[index]!.spoken) continue;
    if (seen === target) return index;
    seen += 1;
  }
  return -1;
}

export function seekTimeForIndex(tokens: FollowToken[], index: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  let spoken = 0;
  let spokenIndex = 0;
  let found = false;
  for (let i = 0; i < tokens.length; i += 1) {
    if (!tokens[i]!.spoken) continue;
    if (i === index) {
      found = true;
      spokenIndex = spoken;
    }
    spoken += 1;
  }
  if (!found || spoken === 0) return 0;
  const span = 1 - LEAD_RATIO - TAIL_RATIO;
  const ratio = LEAD_RATIO + ((spokenIndex + 0.5) / spoken) * span;
  return Math.min(duration, Math.max(0, ratio * duration));
}
