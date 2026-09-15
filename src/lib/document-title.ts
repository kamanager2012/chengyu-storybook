import { useEffect } from "react";

const ROOT = "成语故事";

export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · ${ROOT}` : ROOT;
    return () => {
      document.title = ROOT;
    };
  }, [title]);
}
