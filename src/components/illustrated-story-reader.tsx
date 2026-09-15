import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Home, Pause, Play } from "lucide-react";
import { NarrationFollowText } from "@/components/narration-follow-text";
import { getNarrationAvailability } from "@/data/narration-availability";
import { illustrationAttribution } from "@/data/story-editions";
import type { Story } from "@/data/stories";
import type { StoryHall } from "@/data/story-index";
import { nextStoryInHall } from "@/lib/hall-nav";
import { useDocumentTitle } from "@/lib/document-title";
import { activeSpokenIndex, seekTimeForIndex, spokenProgress, tokenizeFollowText } from "@/lib/narration-follow";
import {
  getNarrationVoicePilot,
  narrationVoiceSrc,
  resolveNarrationVoiceId,
  writeStoredNarrationVoice,
} from "@/lib/narration-voice";
import { playPictureSfx, playTurnSfx } from "@/lib/page-sfx";
import { cn } from "@/lib/utils";

const MOTION = ["in", "left", "right", "up"] as const;
const TAP_LIMIT = 24;
/** Native rate for Grok voice pilot; verified Kokoro stories still use availability src as-is. */
const NARRATION_PLAYBACK_RATE = 1;

function releaseAudio(audio: HTMLAudioElement | null) {
  if (!audio) return;
  audio.pause();
  audio.removeAttribute("src");
  audio.removeAttribute("data-narration-key");
  audio.load();
}

export function IllustratedStoryReader({ story, hall }: { story: Story; hall?: StoryHall }) {
  useDocumentTitle(story.title);
  const resolvedHall: StoryHall = hall === "classic" ? "classic" : "child";
  const nextStory = useMemo(() => nextStoryInHall(story.id, resolvedHall), [story.id, resolvedHall]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [activeToken, setActiveToken] = useState(-1);
  const [spokenRatio, setSpokenRatio] = useState(0);
  const [sparks, setSparks] = useState<{ id: number; x: number; y: number }[]>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const sparkSeq = useRef(0);
  const sparkTimers = useRef<Set<number>>(new Set());
  const lastToken = useRef(-2);
  const pages = story.pages;
  const page = pages[index]!;
  const last = pages.length - 1;
  const isCover = page.kind === "cover";
  const credit = illustrationAttribution(story.id, resolvedHall);
  const isMoral = page.kind === "moral";
  const voicePilot = useMemo(() => getNarrationVoicePilot(story.id), [story.id]);
  const [voiceId, setVoiceId] = useState<string | null>(() => resolveNarrationVoiceId(story.id));
  const baseNarration = getNarrationAvailability(story.id, page.id);
  const narration = useMemo(() => {
    if (!baseNarration) return undefined;
    if (voicePilot && voiceId) {
      return {
        ...baseNarration,
        src: narrationVoiceSrc(story.id, voiceId, page.id),
      };
    }
    // Prefer page.audio so dual-hall can point classic overlay pages at /audio-classic/.
    return {
      ...baseNarration,
      src: page.audio || baseNarration.src,
    };
  }, [baseNarration, page.audio, page.id, story.id, voiceId, voicePilot]);
  const narrationKey = `${story.id}/${page.id}/${voiceId ?? "default"}/${page.audio}`;
  const motion = isMoral ? "still" : MOTION[index % MOTION.length]!;
  const followTokens = useMemo(() => (isMoral ? [] : tokenizeFollowText(page.text)), [isMoral, page.text]);

  useEffect(() => {
    setVoiceId(resolveNarrationVoiceId(story.id));
  }, [story.id]);

  useEffect(() => () => releaseAudio(audioRef.current), []);
  useEffect(() => () => {
    for (const timer of sparkTimers.current) window.clearTimeout(timer);
    sparkTimers.current.clear();
  }, []);
  useEffect(() => {
    setImageFailed(false);
    setActiveToken(-1);
    setSpokenRatio(0);
    lastToken.current = -2;
  }, [page.image, page.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !narration) return;

    const key = narrationKey;
    if (audio.dataset.narrationKey !== key) {
      audio.pause();
      audio.src = narration.src;
      audio.dataset.narrationKey = key;
    }
    audio.playbackRate = NARRATION_PLAYBACK_RATE;

    const playToken = key;
    void audio.play().catch(() => {
      if (audio.dataset.narrationKey === playToken) setPlaying(false);
    });

    return () => {
      if (audio.dataset.narrationKey === playToken) audio.pause();
    };
  }, [narration, narrationKey]);

  useEffect(() => {
    if (isMoral) return;

    const apply = () => {
      const audio = audioRef.current;
      let next = -1;
      let ratio = 0;
      if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
        ratio = spokenProgress(audio.currentTime, audio.duration);
        if (playing || audio.currentTime > 0.05) {
          next = activeSpokenIndex(followTokens, ratio);
        }
      }
      setSpokenRatio(ratio);
      if (next !== lastToken.current) {
        lastToken.current = next;
        setActiveToken(next);
      }
    };

    if (!playing) {
      apply();
      return;
    }

    let frame = 0;
    const tick = () => {
      apply();
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [followTokens, isMoral, page.id, playing]);

  function go(next: number) {
    const target = Math.max(0, Math.min(last, next));
    if (target === index) return;
    playTurnSfx();
    setIndex(target);
  }

  function handleEnded() {
    setPlaying(false);
    setIndex((current) => (current < last ? current + 1 : current));
  }

  function seekToToken(tokenIndex: number) {
    const audio = audioRef.current;
    if (!audio || !narration) return;
    const duration = audio.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    audio.currentTime = seekTimeForIndex(followTokens, tokenIndex, duration);
    audio.playbackRate = NARRATION_PLAYBACK_RATE;
    void audio.play().catch(() => setPlaying(false));
  }

  function addSpark(x: number, y: number) {
    const id = sparkSeq.current + 1;
    sparkSeq.current = id;
    setSparks((list) => [...list.slice(-4), { id, x, y }]);
    const timer = window.setTimeout(() => {
      setSparks((list) => list.filter((spark) => spark.id !== id));
      sparkTimers.current.delete(timer);
    }, 560);
    sparkTimers.current.add(timer);
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button, a")) return;
    swipeRef.current = { x: event.clientX, y: event.clientY };
    const audio = audioRef.current;
    if (audio && narration && audio.paused) {
      const key = narrationKey;
      if (audio.dataset.narrationKey !== key) {
        audio.src = narration.src;
        audio.dataset.narrationKey = key;
      }
      audio.playbackRate = NARRATION_PLAYBACK_RATE;
      void audio.play().catch(() => setPlaying(false));
    }
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) >= 56 && Math.abs(dx) >= Math.abs(dy)) {
      go(dx < 0 ? index + 1 : index - 1);
      return;
    }
    if ((event.target as HTMLElement).closest("button, a")) return;
    const token = (event.target as HTMLElement).closest("[data-follow-token]");
    if (token instanceof HTMLElement && token.dataset.spoken === "true") {
      seekToToken(Number(token.dataset.followIndex));
      return;
    }
    if (Math.hypot(dx, dy) < TAP_LIMIT && (event.target as HTMLElement).closest("[data-picture-hotspot]")) {
      const stage = (event.currentTarget as HTMLElement).querySelector("[data-picture-hotspot]");
      if (stage instanceof HTMLElement) {
        const rect = stage.getBoundingClientRect();
        addSpark(event.clientX - rect.left, event.clientY - rect.top);
      }
      playPictureSfx(story.tone);
    }
  }

  function toggleNarration() {
    const audio = audioRef.current;
    if (!audio || !narration) return;

    const key = narrationKey;
    if (audio.dataset.narrationKey !== key) {
      releaseAudio(audio);
      audio.src = narration.src;
      audio.dataset.narrationKey = key;
    }
    audio.playbackRate = NARRATION_PLAYBACK_RATE;

    if (!audio.paused && !audio.ended) {
      audio.pause();
      return;
    }
    if (audio.ended) audio.currentTime = 0;
    void audio.play().catch(() => setPlaying(false));
  }

  return (
    <main
      className="relative isolate flex min-h-dvh touch-pan-y flex-col overflow-hidden bg-ink"
      data-illustrated-story="true"
      data-story-hall={resolvedHall}
      data-autoplay="true"
      data-page-sfx="true"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <div
        className="absolute inset-0 book-stage"
        data-picture-hotspot="true"
        data-page-motion={motion}
        data-image-fit="contain"
      >
        {imageFailed ? (
          <div className="h-full w-full bg-ink" />
        ) : (
          <img
            key={page.id}
            src={page.image}
            alt={`${story.title}第 ${index + 1} 页插图`}
            decoding="async"
            onError={() => setImageFailed(true)}
            className={cn("h-full w-full object-contain object-center", isMoral && "brightness-[0.5] saturate-[0.85]")}
          />
        )}
        <div
          className={cn(
            "pointer-events-none absolute inset-0",
            isCover || isMoral
              ? "bg-linear-to-b from-ink/35 via-transparent to-ink/55"
              : "bg-linear-to-b from-ink/15 via-transparent to-ink/50",
          )}
        />
        {sparks.map((spark) => (
          <span
            key={spark.id}
            className="picture-spark"
            data-picture-spark="true"
            style={{ left: spark.x, top: spark.y }}
            aria-hidden="true"
          />
        ))}
      </div>

      <header
        className={cn(
          "relative z-10 flex items-center justify-between gap-3 px-4 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))] transition-opacity duration-300",
          playing && !isMoral ? "opacity-70" : "opacity-100",
        )}
      >
        <Link
          to="/hall/$hall"
          params={{ hall: resolvedHall }}
          className="grid size-10 place-items-center rounded-full bg-ink/35 text-panel backdrop-blur-md transition-transform duration-150 active:scale-[0.96]"
          aria-label="返回书架"
        >
          <Home className="size-4" />
        </Link>
        <p className="min-w-0 truncate text-center text-sm font-medium tracking-wide text-panel/90 drop-shadow-sm">
          {story.title}
        </p>
        <div className="flex items-center gap-2">
          {voicePilot && voiceId ? (
            <label className="sr-only" htmlFor={`narration-voice-${story.id}`}>
              旁白音色
            </label>
          ) : null}
          {voicePilot && voiceId ? (
            <select
              id={`narration-voice-${story.id}`}
              data-narration-voice="true"
              value={voiceId}
              onChange={(event) => {
                const next = event.target.value;
                setVoiceId(next);
                writeStoredNarrationVoice(story.id, next);
                setPlaying(true);
              }}
              className="h-10 max-w-[9.5rem] rounded-full bg-ink/35 px-2 text-xs font-medium text-panel backdrop-blur-md"
            >
              {voicePilot.voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            onClick={toggleNarration}
            disabled={!narration}
            aria-pressed={playing}
            data-narration-control="true"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-ink/35 px-3 text-xs font-medium text-panel backdrop-blur-md transition-transform duration-150 active:scale-[0.96] disabled:opacity-40"
          >
            {playing ? <Pause className="size-3.5" aria-hidden="true" /> : <Play className="size-3.5" aria-hidden="true" />}
            {playing ? "暂停旁白" : "播放旁白"}
          </button>
        </div>
      </header>

      <section className="relative z-10 flex min-h-0 flex-1 items-end justify-center px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pointer-events-none">
        <article
          className={cn(
            "pointer-events-auto w-full max-w-xl rounded-[22px] px-3.5 py-2.5 backdrop-blur-md transition-[background-color,box-shadow] duration-300",
            isMoral
              ? "bg-panel/95 shadow-book"
              : playing
                ? "bg-panel/72 shadow-[0_10px_28px_-18px_rgb(44_33_24_/_0.45)]"
                : "bg-panel/82 shadow-book",
          )}
        >
          {isCover ? (
            <div className="text-center">
              <p data-narration-ready={narration ? "true" : "false"} className="text-[10px] tracking-[0.28em] text-muted">
                {narration ? "有声绘本" : "图文绘本"}
              </p>
              <h1 className="mt-0.5 font-display text-3xl text-cinnabar sm:text-4xl">{story.title}</h1>
              <p className="mt-0.5 text-xs tracking-[0.2em] text-muted">{story.pinyin}</p>
              <NarrationFollowText text={page.text} activeIndex={activeToken} className="mt-2.5 min-h-0 text-base sm:text-lg" />
            </div>
          ) : isMoral ? (
            <div className="text-center" data-story-end="true">
              <p className="text-[10px] tracking-[0.3em] text-muted">成语的意思</p>
              <h2 className="mt-1 font-display text-2xl text-cinnabar sm:text-3xl">{story.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{story.meaning}</p>
              <div className="my-3 h-px bg-line" />
              <p className="text-[10px] tracking-[0.3em] text-muted">小道理</p>
              <p className="mt-1 text-sm leading-relaxed text-ink">{story.moral}</p>

              {nextStory ? (
                <Link
                  to="/story/$id"
                  params={{ id: nextStory.id }}
                  search={{ hall: resolvedHall }}
                  data-next-story="true"
                  className="mt-4 flex items-center gap-3 rounded-2xl bg-paper px-3 py-2 text-left ring-1 ring-line/70 transition-transform active:scale-[0.99]"
                >
                  <img
                    src={nextStory.cover}
                    alt=""
                    className="size-14 shrink-0 rounded-xl object-cover object-[center_35%]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] tracking-wide text-muted">下一本 · 同馆</p>
                    <p className="truncate font-display text-xl text-ink">{nextStory.title}</p>
                    <p className="truncate text-xs text-ink-soft">{nextStory.tagline}</p>
                  </div>
                </Link>
              ) : null}

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Link
                  to="/hall/$hall"
                  params={{ hall: resolvedHall }}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-cinnabar px-5 text-sm font-medium text-panel"
                >
                  回书架
                </Link>
                <button
                  type="button"
                  onClick={() => go(0)}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-paper px-5 text-sm text-ink ring-1 ring-line/70"
                >
                  再读一遍
                </button>
              </div>
            </div>
          ) : (
            <NarrationFollowText text={page.text} activeIndex={activeToken} className="min-h-0 text-lg leading-snug sm:text-xl" />
          )}

          {(isCover || isMoral) && (
            <p
              data-illustration-attribution="true"
              {...(credit.includes("Created with Grok") ? { "data-grok-attribution": "true" } : {})}
              className="mt-3 text-center text-[10px] font-medium tracking-wide text-muted"
            >
              {credit}
            </p>
          )}

          <audio
            ref={audioRef}
            preload="none"
            data-narration-audio="true"
            data-narration-voice-id={voiceId ?? undefined}
            data-narration-playback-rate={String(NARRATION_PLAYBACK_RATE)}
            className="hidden"
            aria-hidden="true"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={handleEnded}
            onError={() => setPlaying(false)}
          />

          {!isMoral ? (
            <div className="mt-2.5">
              <div
                className="mx-auto mb-2 h-0.5 max-w-xs overflow-hidden rounded-full bg-line/50"
                data-narration-progress="true"
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full bg-cinnabar/80 transition-[width] duration-100 ease-linear"
                  style={{ width: `${Math.max(0, Math.min(100, spokenRatio * 100))}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => go(index - 1)}
                  disabled={index === 0}
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-paper-deep/80 text-ink transition-transform duration-150 active:scale-[0.96] disabled:opacity-30"
                  aria-label="上一页"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="mx-auto grid w-full max-w-xs grid-cols-9" aria-label="页码">
                    {pages.map((item, pageIndex) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => go(pageIndex)}
                        className="grid min-h-7 min-w-0 place-items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-cinnabar/60"
                        aria-label={`第 ${pageIndex + 1} 页`}
                        aria-current={pageIndex === index ? "page" : undefined}
                      >
                        <span
                          className={cn(
                            "size-1.5 rounded-full transition-transform",
                            pageIndex === index ? "scale-125 bg-cinnabar" : "bg-line",
                          )}
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                  </div>
                  <p className="mt-0.5 text-center text-[10px] tabular-nums text-muted">
                    {index + 1} / {pages.length}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => go(index + 1)}
                  disabled={index === last}
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-paper-deep/80 text-ink transition-transform duration-150 active:scale-[0.96] disabled:opacity-30"
                  aria-label="下一页"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          ) : null}
        </article>
      </section>
    </main>
  );
}
