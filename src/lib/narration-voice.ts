import pilotSource from "../../content/narration-voice-pilot.json";
import { publicAsset } from "@/lib/public-asset";

export type NarrationVoiceOption = {
  id: string;
  label: string;
  provider: string;
  language: string;
};

type PilotStory = {
  defaultVoiceId: string;
  voices: NarrationVoiceOption[];
};

type PilotSource = {
  schemaVersion: 1;
  stories: Record<string, PilotStory>;
};

const pilot = pilotSource as PilotSource;
const STORAGE_PREFIX = "chengyu-narration-voice-v1:";

export function getNarrationVoicePilot(storyId: string): PilotStory | null {
  const story = pilot.stories[storyId];
  return story && Array.isArray(story.voices) && story.voices.length > 0 ? story : null;
}

export function narrationVoiceSrc(storyId: string, voiceId: string, pageId: string): string {
  return publicAsset(`/audio-voices/${storyId}/${voiceId}/${pageId}.mp3`);
}

export function readStoredNarrationVoice(storyId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(`${STORAGE_PREFIX}${storyId}`);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function writeStoredNarrationVoice(storyId: string, voiceId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${storyId}`, voiceId);
  } catch {
    // Ignore quota / private-mode failures; picker still works in-session.
  }
}

export function resolveNarrationVoiceId(storyId: string): string | null {
  const story = getNarrationVoicePilot(storyId);
  if (!story) return null;
  const stored = readStoredNarrationVoice(storyId);
  if (stored && story.voices.some((voice) => voice.id === stored)) return stored;
  return story.defaultVoiceId;
}
