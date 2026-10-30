/**
 * Flovia の Phase 0 確認 (設計書 §4.1)。呼び出しは最小限にする。
 *
 *   npx tsx scripts/fan/eval/flovia-probe.ts                 # status と search_recent を1回 (max_results=10)
 *   npx tsx scripts/fan/eval/flovia-probe.ts --pages 2       # 次ページ (next_cursor) も1回試す
 *   npx tsx scripts/fan/eval/flovia-probe.ts --status-only   # 使用率だけ
 *
 * 応答は「形」だけを表示する (キー名・型・配列の長さ・文字列の長さ)。投稿本文・ID・ユーザー名は出さない。
 * 使用率 (used_pct / resets_at) と、件数の数値・真偽値だけは値を表示する。
 */
import { pathToFileURL } from "node:url";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile();
  } catch {}
}

/** Flovia が保持・共有し得るので固定の汎用文にする (実装計画 §4) */
export const FLOVIA_REQUEST_TEXT = "公開投稿の件数集計のための検索";
export const FLOVIA_PURPOSE = "SFLチーム別の公開投稿の集計";

const PROBE_QUERY =
  '("Crazy Raccoon" OR クレイジーラクーン) (ストリートファイターリーグ OR #SFリーグ OR SFL OR スト6) lang:ja -is:retweet';

/** 値を見せてよいキー (数値・真偽値・日時だけ) */
const VISIBLE_KEYS = /used_pct|resets_at|count|total|result_count|has_more|status|services_off|data_consent|granularity|^(start|end)$/i;

export function shapeOf(value: unknown, key = "", depth = 0): unknown {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return value.length === 0 ? "array(0)" : { [`array(${value.length})`]: shapeOf(value[0], key, depth + 1) };
  }
  if (typeof value === "object") {
    if (depth > 5) return "object";
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, shapeOf(v, k, depth + 1)])
    );
  }
  if ((typeof value === "number" || typeof value === "boolean") && VISIBLE_KEYS.test(key)) return value;
  if (typeof value === "string" && /resets_at/i.test(key)) return value;
  if (typeof value === "string") return `string(${value.length}${/^\d+$/.test(value) ? ",digits" : ""})`;
  return typeof value;
}

export class FloviaMcpSession {
  private sessionId: string | null = null;
  private nextId = 1;

  constructor(private readonly key: string, private readonly url = process.env.FLOVIA_MCP_URL ?? "https://api.flovia.dev/mcp") {}

  private async post(body: unknown): Promise<{ status: number; message: any }> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    this.sessionId = res.headers.get("mcp-session-id") ?? this.sessionId;
    const text = await res.text();
    if (!text) return { status: res.status, message: null };
    if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
      // 最後の data: 行が JSON-RPC の応答
      const data = text.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
      return { status: res.status, message: data.length ? JSON.parse(data.at(-1)!) : null };
    }
    try {
      return { status: res.status, message: JSON.parse(text) };
    } catch {
      return { status: res.status, message: { nonJsonLength: text.length } };
    }
  }

  async initialize() {
    const r = await this.post({
      jsonrpc: "2.0",
      id: this.nextId++,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "sfl-fan-probe", version: "0.1.0" } },
    });
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
    return r;
  }

  request(method: string, params: unknown) {
    return this.post({ jsonrpc: "2.0", id: this.nextId++, method, params });
  }

  callTool(name: string, args: Record<string, unknown>) {
    return this.request("tools/call", { name, arguments: args });
  }
}

/** tools/call の結果から本体を取り出す (structuredContent、なければ text を JSON として読む) */
export function toolPayload(message: any): unknown {
  const result = message?.result;
  if (!result) return message?.error ? { error: { code: message.error.code, messageLength: String(message.error.message ?? "").length } } : null;
  if (result.structuredContent) return result.structuredContent;
  const text = result.content?.find((c: any) => c.type === "text")?.text;
  if (typeof text !== "string") return result;
  try {
    return JSON.parse(text);
  } catch {
    return { textLength: text.length, isError: result.isError ?? false };
  }
}

function findCursor(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (/next_?cursor/i.test(k) && typeof v === "string") return v;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const inner = findCursor(v);
      if (inner) return inner;
    }
  }
  return null;
}

async function main() {
  const key = process.env.FLOVIA_KEY;
  if (!key) {
    console.error("FLOVIA_KEY が .env にありません");
    process.exit(2);
  }
  const args = process.argv.slice(2);
  const pages = Number(args[args.indexOf("--pages") + 1] ?? 1) || 1;
  const show = (label: string, v: unknown) => console.log(label, JSON.stringify(v, null, 2));

  const session = new FloviaMcpSession(key);
  const init = await session.initialize();
  show("initialize", { status: init.status, serverInfo: init.message?.result?.serverInfo, protocol: init.message?.result?.protocolVersion });
  if (init.status === 401 || init.status === 403) process.exit(2);

  const tools = await session.request("tools/list", {});
  const x = tools.message?.result?.tools?.find((t: any) => t.name === "flovia_x");
  show("flovia_x input keys", x ? Object.keys(x.inputSchema?.properties ?? {}) : null);
  show("flovia_x output schema", x?.outputSchema ? shapeOf(x.outputSchema) : "none");

  const before = toolPayload((await session.callTool("flovia_status", {})).message);
  show("flovia_status (before)", shapeOf(before));
  if (args.includes("--status-only")) return;

  let cursor: string | null = null;
  for (let page = 1; page <= pages; page++) {
    const started = performance.now();
    const r = await session.callTool("flovia_x", {
      action: "search_recent",
      query: PROBE_QUERY,
      max_results: 10,
      sort_order: "recency",
      request_text: FLOVIA_REQUEST_TEXT,
      purpose: FLOVIA_PURPOSE,
      operation_id: `probe-${Date.now()}-${page}`,
      ...(cursor ? { cursor } : {}),
    });
    const payload = toolPayload(r.message);
    show(`search_recent page ${page} (HTTP ${r.status}, ${Math.round(performance.now() - started)}ms)`, shapeOf(payload));
    cursor = findCursor(payload);
    if (!cursor) break;
  }

  const after = toolPayload((await session.callTool("flovia_status", {})).message);
  show("flovia_status (after)", shapeOf(after));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error((error as Error).name, (error as Error).message);
    process.exit(1);
  });
}
