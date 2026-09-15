import { useMemo } from "react";
import { tokenizeFollowText } from "@/lib/narration-follow";
import { cn } from "@/lib/utils";

export function NarrationFollowText({
  text,
  activeIndex,
  className,
}: {
  text: string;
  activeIndex: number;
  className?: string;
}) {
  const tokens = useMemo(() => tokenizeFollowText(text), [text]);

  return (
    <p
      className={cn("page-copy min-h-20 text-center text-[1.35rem] leading-relaxed text-ink sm:text-2xl", className)}
      data-narration-follow="true"
    >
      {tokens.map((token, index) => (
        <span
          key={index}
          data-follow-token=""
          data-follow-index={String(index)}
          data-spoken={token.spoken ? "true" : "false"}
          data-active={index === activeIndex ? "true" : undefined}
        >
          {token.text}
        </span>
      ))}
    </p>
  );
}
