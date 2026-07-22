// イクラ？ — コアゲームロジック（フレームワーク非依存・純関数）
// 価格当て: プレイヤーの推測値と正解（平均小売価格）を比較し、
// 方向（高すぎ/低すぎ）と「近さ」ティアを返す。UI・絵文字はこのティアに写像する。

export interface Puzzle {
  day: number;
  date: string; // YYYY-MM-DD
  name: string;
  unit: string;
  price: number;
  category: string;
}

/**
 * 指定日(iso)の出題を返す。プール内に該当日があればそれを、無ければ（起点前 / 365日以降）
 * item を循環選択しつつ **date は必ず iso に、day は正の循環番号に再構成** して返す。
 * これにより永続化キー（date）が実日ごとに一意になり、過去プールとのキー衝突を防ぐ
 * （フォールバックで stale な date/day を返すと日次同一性が壊れるため）。
 */
export function pickPuzzle(
  puzzles: Puzzle[],
  epoch: string,
  iso: string,
): Puzzle {
  const found = puzzles.find((p) => p.date === iso);
  if (found) return found;
  const epochMs = Date.parse(epoch + "T00:00:00Z");
  const offset = Math.floor(
    (Date.parse(iso + "T00:00:00Z") - epochMs) / 86400000,
  );
  const len = puzzles.length;
  const idx = ((offset % len) + len) % len;
  const base = puzzles[idx]!;
  return { ...base, date: iso, day: idx + 1 };
}

export const MAX_TRIES = 6;

// 的中とみなす相対誤差（±10%以内）。価格当ての現実的な難易度に合わせる。
export const WIN_THRESHOLD = 0.1;

export type Direction = "high" | "low" | "exact";

// 近さティア（win が最良、cold が最遠）。絵文字/色はこのキーに写像する。
export type Tier = "win" | "veryclose" | "close" | "warm" | "cold";

export interface GuessResult {
  /** 相対誤差 |guess-answer|/answer */
  relError: number;
  /** 推測が正解より高い(high=もっと安い) / 低い(low=もっと高い) / 一致 */
  direction: Direction;
  tier: Tier;
  win: boolean;
}

/** 1回の推測を評価する。answer は正の整数（円）を前提。 */
export function evaluateGuess(guess: number, answer: number): GuessResult {
  if (!Number.isFinite(guess) || !Number.isFinite(answer) || answer <= 0) {
    throw new Error("evaluateGuess: guess/answer は有限で answer>0 が必要");
  }
  const relError = Math.abs(guess - answer) / answer;
  const direction: Direction =
    guess === answer ? "exact" : guess > answer ? "high" : "low";
  const win = relError <= WIN_THRESHOLD;

  let tier: Tier;
  if (win) tier = "win";
  else if (relError <= 0.2) tier = "veryclose";
  else if (relError <= 0.4) tier = "close";
  else if (relError <= 0.8) tier = "warm";
  else tier = "cold";

  return { relError, direction, tier, win };
}

export interface GameState {
  guesses: number[];
  results: GuessResult[];
  status: "playing" | "won" | "lost";
}

export function initialState(): GameState {
  return { guesses: [], results: [], status: "playing" };
}

/** 推測を1つ適用した新しい状態を返す（不変更新）。playing 以外では素通し。 */
export function applyGuess(
  state: GameState,
  guess: number,
  answer: number,
): GameState {
  if (state.status !== "playing") return state;
  const result = evaluateGuess(guess, answer);
  const guesses = [...state.guesses, guess];
  const results = [...state.results, result];
  let status: GameState["status"] = "playing";
  if (result.win) status = "won";
  else if (guesses.length >= MAX_TRIES) status = "lost";
  return { guesses, results, status };
}

/** UI の「手ごたえバー」用の近さ 0..1（1=的中に近い）。色だけに依存させないための量。 */
export function proximity(relError: number): number {
  return Math.max(0, Math.min(1, 1 - relError));
}

// ===== 共有絵文字グリッド：「収束スケール（Convergence Scale）」 =====
// design 署名（ソナー型・単点プロット）。価格軸を7列の横スケールに見立て、中央(col3)=🎯。
// 低い側 col0-2（遠→近）、高い側 col4-6（近→遠）。各計測は1マーカー🟦を誤差バケットで配置。
// 商品名・正解価格は一切含めない。負け時は🎯（＝正解位置）を描かない。Wordleの密な正方ブロックと別物。

const GRID_COLS = 7;
const CENTER = 3;
const MARKER = "🟦";
const EMPTY = "⬜";
const BULLSEYE = "🎯";

/** 1計測の列(0..6)を返す。win は中央。距離は相対誤差の3バケット（近/中/遠）。 */
export function columnFor(r: GuessResult): number {
  if (r.win) return CENTER;
  const near = r.relError <= 0.2;
  const mid = r.relError <= 0.5;
  const offset = near ? 1 : mid ? 2 : 3;
  return r.direction === "high" ? CENTER + offset : CENTER - offset;
}

/** 1計測を7セルの行にする。win 行は中央に🎯。 */
export function shareRow(r: GuessResult): string[] {
  const row = new Array<string>(GRID_COLS).fill(EMPTY);
  const col = columnFor(r);
  row[col] = r.win ? BULLSEYE : MARKER;
  return row;
}

/** 共有テキスト（収束スケール）を組み立てる。日付番号・回数・軸キャプションのみ。ネタバレ無し。 */
export function buildShareText(
  state: GameState,
  dayNumber: number,
  siteUrl?: string,
): string {
  const n = state.guesses.length;
  const head =
    state.status === "won"
      ? `イクラ？ #${dayNumber}  ${n}回で的中`
      : `イクラ？ #${dayNumber}  ✕ ${n}回`;
  const axis =
    state.status === "won" ? "低い ◀━🎯━▶ 高い" : "低い ◀━ ? ━▶ 高い";
  const rows = state.results.map((r) => shareRow(r).join(""));
  const lines = [head, axis, ...rows];
  if (siteUrl) lines.push(siteUrl);
  return lines.join("\n");
}
