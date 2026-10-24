import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { VideoBudget } from "./bout-video-facts";

export const RecapUsageSchema = z.object({
  schemaVersion: z.literal(1),
  days: z.record(z.string(), z.object({ calls: z.number().nonnegative(), videoSeconds: z.number().nonnegative() })),
});
export type RecapUsage = z.infer<typeof RecapUsageSchema>;
export const DAILY_CALL_LIMIT = 96;
export const DAILY_VIDEO_LIMIT = 7 * 3600;
export const usageDay = (date = new Date()) => new Date(date.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
const usageFile = () => path.resolve("src/data/recap-usage.json");
export function loadRecapUsage(): RecapUsage {
  return fs.existsSync(usageFile()) ? RecapUsageSchema.parse(JSON.parse(fs.readFileSync(usageFile(), "utf8"))) : { schemaVersion: 1, days: {} };
}
export function remainingDailyUsage(usage: RecapUsage, date = new Date()) {
  const used = usage.days[usageDay(date)] ?? { calls: 0, videoSeconds: 0 };
  return { calls: Math.max(0, DAILY_CALL_LIMIT - used.calls), videoSeconds: Math.max(0, DAILY_VIDEO_LIMIT - used.videoSeconds) };
}
/** Reserve usage before every API request, including retries after process failure. */
export function persistentVideoBudget(config: VideoBudget, usage = loadRecapUsage(), save = (data: RecapUsage) => {
  fs.writeFileSync(usageFile(), JSON.stringify(data, null, 2) + "\n");
}): VideoBudget {
  const key = usageDay();
  const before = usage.days[key] ?? { calls: 0, videoSeconds: 0 };
  const remaining = remainingDailyUsage(usage);
  const budget = { ...config, maxCalls: Math.min(config.maxCalls, remaining.calls), maxVideoSeconds: Math.min(config.maxVideoSeconds, remaining.videoSeconds) };
  return new Proxy(budget, {
    set(target, property, value) {
      Reflect.set(target, property, value);
      if ((property === "calls" || property === "videoSeconds") && (target.calls || target.videoSeconds)) {
        usage.days[key] = { calls: before.calls + target.calls, videoSeconds: before.videoSeconds + target.videoSeconds };
        const days = Object.keys(usage.days).sort().slice(-14);
        save({ schemaVersion: 1, days: Object.fromEntries(days.map((day) => [day, usage.days[day]])) });
      }
      return true;
    },
  });
}
