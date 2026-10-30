/**
 * Flovia 無料枠の予算ガード (設計書 §4.3)
 *
 * 無料枠は実数が分からず使用率 (%) しか見えないので、使用率で止める。
 * 過去の実行の「使用率の増分 / 呼び出し回数」から1呼び出しあたりの消費を見積もり、
 * 停止ラインまでに使える呼び出し回数を毎回計算し直す。
 */
import type { QuotaStatus } from "./providers/types";

export interface BudgetLimits {
  /** 5時間窓の使用率がこれ以上なら呼ばない */
  stopFiveHourPct: number;
  /** 週次窓の使用率がこれ以上なら呼ばない (手動の追加取得の余裕を残す) */
  stopWeekPct: number;
  maxCallsPerRun: number;
  maxPagesPerTeamPerRun: number;
}

export const DEFAULT_BUDGET_LIMITS: BudgetLimits = {
  stopFiveHourPct: 70,
  stopWeekPct: 60,
  maxCallsPerRun: 12,
  maxPagesPerTeamPerRun: 3,
};

function envNumber(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`);
  return value;
}

export function budgetLimitsFromEnv(env: NodeJS.ProcessEnv = process.env): BudgetLimits {
  return {
    stopFiveHourPct: envNumber(env, "BUDGET_STOP_PCT_5H", DEFAULT_BUDGET_LIMITS.stopFiveHourPct),
    stopWeekPct: envNumber(env, "BUDGET_STOP_PCT_WEEK", DEFAULT_BUDGET_LIMITS.stopWeekPct),
    maxCallsPerRun: envNumber(env, "MAX_CALLS_PER_RUN", DEFAULT_BUDGET_LIMITS.maxCallsPerRun),
    maxPagesPerTeamPerRun: envNumber(env, "MAX_PAGES_PER_TEAM_PER_RUN", DEFAULT_BUDGET_LIMITS.maxPagesPerTeamPerRun),
  };
}

/** 停止ラインに達した窓の名前。まだ余裕があれば null */
export function overBudget(quota: QuotaStatus, limits: BudgetLimits): "five_hour" | "week" | null {
  if (quota.fiveHourUsedPct >= limits.stopFiveHourPct) return "five_hour";
  if (quota.weekUsedPct >= limits.stopWeekPct) return "week";
  return null;
}

export interface CostPerCall {
  fiveHourPct: number;
  weekPct: number;
}

/**
 * 1呼び出しあたりの使用率の増分。窓のリセットをまたいだ実行 (増分が負) は除く。
 * 実績が無ければ null。
 */
export function estimateCostPerCall(
  history: readonly { calls: number; fiveHourDelta: number; weekDelta: number }[]
): CostPerCall | null {
  let calls = 0;
  let fiveHour = 0;
  let week = 0;
  for (const h of history) {
    if (h.calls <= 0 || h.fiveHourDelta < 0 || h.weekDelta < 0) continue;
    calls += h.calls;
    fiveHour += h.fiveHourDelta;
    week += h.weekDelta;
  }
  return calls > 0 ? { fiveHourPct: fiveHour / calls, weekPct: week / calls } : null;
}

/** 停止ラインまでに使える呼び出し回数 (maxCallsPerRun が上限) */
export function allowedCalls(quota: QuotaStatus, limits: BudgetLimits, cost: CostPerCall | null): number {
  let allowed = limits.maxCallsPerRun;
  if (cost && cost.fiveHourPct > 0) {
    allowed = Math.min(allowed, Math.floor((limits.stopFiveHourPct - quota.fiveHourUsedPct) / cost.fiveHourPct));
  }
  if (cost && cost.weekPct > 0) {
    allowed = Math.min(allowed, Math.floor((limits.stopWeekPct - quota.weekUsedPct) / cost.weekPct));
  }
  return Math.max(0, allowed);
}
