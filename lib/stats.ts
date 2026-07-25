// イクラ？ — 戦績（ライフタイム統計）ロジック（フレームワーク非依存・純関数）
// プレイ数・勝率・最長連勝・「何回で的中したか」の分布を端末内に蓄積する。
// 商品名や正解価格は一切保持しない（日付キーと集計値のみ）。

// node ネイティブTS（node --test の型ストリップ）は相対 import に明示拡張子を要求するため
// `.ts` を付ける（tsconfig の allowImportingTsExtensions=true で tsc/next も許容）。
import { MAX_TRIES } from "./game.ts";

export interface Stats {
  /** 決着した（勝ち負け問わず終了した）ゲーム数 */
  played: number;
  /** 的中したゲーム数 */
  wins: number;
  /** これまでの最長連勝 */
  maxStreak: number;
  /**
   * 的中回数の分布。dist[i] は「(i+1) 回で的中した」ゲーム数（i は 0..MAX_TRIES-1）。
   * 負けは分布に加えない（的中の内訳なので）。
   */
  dist: number[];
  /** 最後に集計した出題日(YYYY-MM-DD)。同一日の二重集計を防ぐ番人。 */
  lastDate: string;
}

/** 空の戦績。dist は MAX_TRIES 個のゼロ配列。 */
export function emptyStats(): Stats {
  return {
    played: 0,
    wins: 0,
    maxStreak: 0,
    dist: new Array<number>(MAX_TRIES).fill(0),
    lastDate: "",
  };
}

/**
 * 未知の形の値を安全に Stats へ正規化する（localStorage 破損・旧版データ対策）。
 * dist の長さは MAX_TRIES に丸め、各値は非負整数にする。
 */
export function normalizeStats(value: unknown): Stats {
  const base = emptyStats();
  if (!value || typeof value !== "object") return base;
  const v = value as Record<string, unknown>;
  const int = (x: unknown): number => {
    const n = Math.floor(Number(x));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const dist = base.dist.slice();
  if (Array.isArray(v.dist)) {
    for (let i = 0; i < MAX_TRIES; i++) dist[i] = int(v.dist[i]);
  }
  // 不変条件を保つ: 勝ち数は総プレイ数を超えない（改ざん/旧データで勝率>100% を防ぐ）。
  const played = int(v.played);
  const wins = Math.min(int(v.wins), played);
  return {
    played,
    wins,
    maxStreak: int(v.maxStreak),
    dist,
    lastDate: typeof v.lastDate === "string" ? v.lastDate : "",
  };
}

export interface GameOutcome {
  /** 出題日(YYYY-MM-DD)。二重集計防止のキー。 */
  date: string;
  /** 的中したか。 */
  won: boolean;
  /** 使った計測回数（1..MAX_TRIES）。的中時のみ分布に使う。 */
  tries: number;
  /** この決着後の現在連勝数（game 側の連勝ロジックの結果を渡す）。最長連勝の更新に使う。 */
  currentStreak: number;
}

/**
 * 1ゲームの決着を戦績へ反映した新しい Stats を返す（不変更新）。
 * date が lastDate と同じなら「既に集計済み」として素通しする（リロードや
 * 再ファイナライズで二重に数えないための番人）。
 */
export function recordGame(stats: Stats, outcome: GameOutcome): Stats {
  if (outcome.date && outcome.date === stats.lastDate) return stats;
  const dist = stats.dist.slice();
  if (outcome.won) {
    const idx = Math.min(Math.max(outcome.tries, 1), MAX_TRIES) - 1;
    dist[idx] = (dist[idx] ?? 0) + 1;
  }
  return {
    played: stats.played + 1,
    wins: stats.wins + (outcome.won ? 1 : 0),
    maxStreak: Math.max(stats.maxStreak, outcome.currentStreak),
    dist,
    lastDate: outcome.date,
  };
}

/** 勝率（0..100 の整数パーセント）。未プレイは 0。 */
export function winRate(stats: Stats): number {
  if (stats.played <= 0) return 0;
  return Math.round((stats.wins / stats.played) * 100);
}

/** 分布バーの正規化に使う最大値（すべて 0 なら 1 を返して 0 除算を避ける）。 */
export function maxDist(stats: Stats): number {
  return Math.max(1, ...stats.dist);
}
