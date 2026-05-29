import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { DeckViewer } from "./deck-viewer";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function deck(slides: string[]): string {
  return `<!DOCTYPE html><html><head><title>Test deck</title></head><body>${slides
    .map((id) => `<section class="slide" data-slide-id="${id}"><h1>${id}</h1></section>`)
    .join("")}</body></html>`;
}

async function renderDeck(html: string): Promise<HTMLDivElement> {
  container ??= document.createElement("div");
  document.body.appendChild(container);
  root ??= createRoot(container);

  await act(async () => {
    root?.render(<DeckViewer html={html} active />);
  });

  return container;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe("DeckViewer", () => {
  it("does not crash when the active index is beyond a refreshed shorter deck", async () => {
    const el = await renderDeck(deck(["one", "two"]));
    const nextButton = Array.from(el.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("›"),
    );

    await act(async () => {
      nextButton?.click();
    });

    expect(el.textContent).toContain("2 / 2");

    await renderDeck(deck(["only"]));

    expect(el.textContent).toContain("1 / 1");
  });
});
