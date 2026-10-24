import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { NarrationOutputSchema } from "./narration";
import { TokenCountsSchema } from "./token-usage";

export const WriteRequestSchema = z.object({
  matchId: z.string().regex(/^div-[sf]-sec\d+-m\d+$/), sectionId: z.string().regex(/^div-[sf]-sec\d+$/),
  inputHash: z.string().regex(/^[a-f0-9]{16}$/), sourceHash: z.string(), prompt: z.string(),
  stage: z.enum(["queued", "waiting_evidence", "completed", "needs_review"]), attempts: z.number().int().nonnegative(),
  updatedAt: z.string(),
});
export const WriteRequestsSchema = z.object({ schemaVersion: z.literal(1), requests: z.record(z.string(), WriteRequestSchema) });
export type WriteRequest = z.infer<typeof WriteRequestSchema>;
export type WriteRequests = z.infer<typeof WriteRequestsSchema>;
export const PreparedNarrativeSchema = z.object({
  matchId: WriteRequestSchema.shape.matchId, inputHash: WriteRequestSchema.shape.inputHash,
  runId: z.string(), model: z.literal("codex-cli"), generatedAt: z.string(),
  output: NarrationOutputSchema, usage: TokenCountsSchema.optional(),
});
export type PreparedNarrative = z.infer<typeof PreparedNarrativeSchema>;
const file = () => path.resolve("src/data/recap-write-requests.json");
export function loadWriteRequests(): WriteRequests {
  return fs.existsSync(file()) ? WriteRequestsSchema.parse(JSON.parse(fs.readFileSync(file(), "utf8"))) : { schemaVersion: 1, requests: {} };
}
export function saveWriteRequests(data: WriteRequests): void {
  const text = JSON.stringify(WriteRequestsSchema.parse(data), null, 2) + "\n";
  if (!fs.existsSync(file()) || fs.readFileSync(file(), "utf8") !== text) fs.writeFileSync(file(), text);
}
export function queueWriteRequest(data: WriteRequests, input: Pick<WriteRequest, "matchId" | "sectionId" | "inputHash" | "sourceHash" | "prompt">): void {
  const old = data.requests[input.matchId];
  if (old?.inputHash === input.inputHash && old.stage !== "waiting_evidence") return;
  const attempts = old?.sourceHash === input.sourceHash ? old.attempts : 0;
  data.requests[input.matchId] = { ...input, attempts, stage: attempts >= 3 ? "needs_review" : "queued", updatedAt: new Date().toISOString() };
}
export function finishWriteRequest(data: WriteRequests, matchId: string, inputHash: string, passed: boolean): void {
  const request = data.requests[matchId];
  if (!request || request.inputHash !== inputHash || request.stage === "completed") return;
  request.attempts++;
  request.stage = passed ? "completed" : request.attempts >= 3 ? "needs_review" : "queued";
  if (passed) request.prompt = "";
  request.updatedAt = new Date().toISOString();
}
export function readPreparedNarratives(encoded = process.env.RECAP_NARRATIVE_CACHE ?? ""): PreparedNarrative[] {
  if (!encoded) return [];
  if (encoded.length > 65_536) throw new Error("Prepared narrative is too large");
  return z.array(PreparedNarrativeSchema).max(1).parse(JSON.parse(Buffer.from(encoded, "base64").toString("utf8")));
}
