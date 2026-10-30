/**
 * 同時実行の防止。ロックファイルを排他作成し、取れなければその回は何もしない。
 * 異常終了で残ったロックは、一定時間を過ぎたら取り直す。
 */
import fs from "node:fs";
import path from "node:path";

export const LOCK_STALE_MS = 2 * 3600_000;

export function acquireLock(dir: string, now: number = Date.now()): (() => void) | null {
  const file = path.join(dir, "collect.lock");
  fs.mkdirSync(dir, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(file, "wx");
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date(now).toISOString() }));
      fs.closeSync(fd);
      return () => fs.rmSync(file, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const age = now - fs.statSync(file).mtimeMs;
      if (age < LOCK_STALE_MS) return null;
      fs.rmSync(file, { force: true });
    }
  }
  return null;
}
