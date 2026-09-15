import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { publicAsset } from "@/lib/public-asset";
import "./styles.css";

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Missing #app root element");
}

const assetBase = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
document.documentElement.style.setProperty("--paper-texture", `url("${publicAsset("/ui/bookshelf-paper.svg")}")`);
if ("fonts" in document) {
  const displayFont = new FontFace("Ma Shan Zheng", `url("${publicAsset("/fonts/MaShanZheng.woff2")}")`, {
    weight: "400",
    style: "normal",
    display: "swap",
  });
  void displayFont.load().then((face) => document.fonts.add(face));
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${assetBase}sw.js`, { scope: assetBase }).catch(() => {
      // Offline support is progressive enhancement; a registration failure
      // must never prevent children from opening and reading the storybook.
    });
  });
}
