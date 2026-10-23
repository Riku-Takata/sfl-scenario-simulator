import { toBlob } from "html-to-image";

// Match the faces loaded by globals.css, including synthetic bold above 800.
const FONT_FACES = [
  { family: "Inter", weights: [500, 600, 700, 800] },
  { family: "Noto Sans JP", weights: [400, 500, 700, 800] },
];

function getFontRequest(node: HTMLElement): string | null {
  const usedWeights = new Map<string, Set<number>>();
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode;
    if (!text.textContent?.trim() || !text.parentElement) continue;
    const style = getComputedStyle(text.parentElement);
    const families = style.fontFamily.split(",").map((s) => s.trim().replace(/["']/g, ""));
    for (const face of FONT_FACES) {
      if (!families.includes(face.family)) continue;
      const weight = face.weights.find((w) => w >= Number(style.fontWeight)) ?? 800;
      const weights = usedWeights.get(face.family) ?? new Set<number>();
      weights.add(weight);
      usedWeights.set(face.family, weights);
    }
  }

  if (!usedWeights.size) return null;
  const url = new URL("https://fonts.googleapis.com/css2");
  for (const [family, weights] of usedWeights) {
    url.searchParams.append("family", `${family}:wght@${[...weights].sort((a, b) => a - b).join(";")}`);
  }
  // text= returns compact fonts containing only the glyphs in this card.
  const text = [...new Set((node.textContent ?? "").replace(/\s+/g, " "))].sort().join("");
  url.searchParams.set("text", text);
  url.searchParams.set("display", "swap");
  return url.href;
}

async function fetchResource(url: string): Promise<Response> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`フォントの取得に失敗しました (${response.status})`);
  return response;
}

async function loadFontCSS(url: string): Promise<string> {
  const css = await (await fetchResource(url)).text();
  const pattern = /url\(["']?(https:\/\/fonts\.gstatic\.com\/[^)"']+)["']?\)/g;
  const urls = [...new Set([...css.matchAll(pattern)].map((match) => match[1]))];
  if (!urls.length) throw new Error("画像用フォントが見つかりませんでした");
  const embedded = new Map(await Promise.all(urls.map(async (fontUrl) => {
    const blob = await (await fetchResource(fontUrl)).blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
    return [fontUrl, dataUrl] as const;
  })));
  return css.replace(pattern, (_match, fontUrl: string) => `url("${embedded.get(fontUrl)}")`);
}

/** One exporter per modal: share pending work, font subsets and the latest PNG. */
export function createPredictionCardExporter() {
  const fonts = new Map<string, Promise<string>>();
  let lastImage: { key: string; promise: Promise<Blob> } | undefined;

  return async (node: HTMLElement): Promise<Blob> => {
    // Measure the settled preview, so a late-loading font cannot stale the key.
    await document.fonts.ready;
    const style = getComputedStyle(node);
    const key = JSON.stringify([
      node.outerHTML, node.clientWidth, node.clientHeight,
      style.fontFamily, style.fontSize, style.fontWeight,
    ]);
    if (lastImage?.key === key) return lastImage.promise;

    const promise = (async () => {
      const fontUrl = getFontRequest(node);
      let fontEmbedCSS = "";
      if (fontUrl) {
        let pending = fonts.get(fontUrl);
        if (!pending) {
          pending = loadFontCSS(fontUrl);
          fonts.set(fontUrl, pending);
          // Bound memory when users try many score/section combinations.
          if (fonts.size > 8) fonts.delete(fonts.keys().next().value!);
          pending.catch(() => {
            if (fonts.get(fontUrl) === pending) fonts.delete(fontUrl);
          });
        }
        fontEmbedCSS = await pending;
      }
      const blob = await toBlob(node, {
        fontEmbedCSS,
        pixelRatio: 2,
        backgroundColor: "#090d16",
      });
      if (!blob) throw new Error("画像の生成に失敗しました");
      return blob;
    })();
    lastImage = { key, promise };
    promise.catch(() => {
      if (lastImage?.promise === promise) lastImage = undefined;
    });
    return promise;
  };
}
