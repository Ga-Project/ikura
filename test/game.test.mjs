// イクラ？ — ゲームロジック＆出題プールのテスト（node:test・追加依存なし）
// 実行: pnpm test  （node --test / Node 22+ の TS 型ストリップで .ts を直接 import）
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  evaluateGuess,
  applyGuess,
  initialState,
  buildShareText,
  columnFor,
  proximity,
  pickPuzzle,
  MAX_TRIES,
  WIN_THRESHOLD,
} from "../lib/game.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("evaluateGuess: 完全一致は win/exact", () => {
  const r = evaluateGuess(200, 200);
  assert.equal(r.win, true);
  assert.equal(r.direction, "exact");
  assert.equal(r.tier, "win");
  assert.equal(r.relError, 0);
});

test("evaluateGuess: 閾値内(±10%)は win", () => {
  assert.equal(evaluateGuess(209, 200).win, true); // 4.5%
  assert.equal(evaluateGuess(220, 200).win, true); // 10% ちょうど
  assert.equal(evaluateGuess(221, 200).win, false); // 10.5%
});

test("evaluateGuess: 方向 high=高すぎ / low=低すぎ", () => {
  assert.equal(evaluateGuess(500, 200).direction, "high");
  assert.equal(evaluateGuess(100, 200).direction, "low");
});

test("evaluateGuess: ティアが誤差で単調", () => {
  assert.equal(evaluateGuess(240, 200).tier, "veryclose"); // 20%
  assert.equal(evaluateGuess(280, 200).tier, "close"); // 40%
  assert.equal(evaluateGuess(360, 200).tier, "warm"); // 80%
  assert.equal(evaluateGuess(500, 200).tier, "cold"); // 150%
});

test("evaluateGuess: 不正入力で例外", () => {
  assert.throws(() => evaluateGuess(NaN, 200));
  assert.throws(() => evaluateGuess(100, 0));
});

test("applyGuess: 的中で won に遷移し以降は素通し", () => {
  let s = initialState();
  s = applyGuess(s, 500, 200); // 外れ
  assert.equal(s.status, "playing");
  s = applyGuess(s, 200, 200); // 的中
  assert.equal(s.status, "won");
  const frozen = applyGuess(s, 999, 200);
  assert.equal(frozen, s); // 変化しない
});

test("applyGuess: MAX_TRIES 外し続けると lost", () => {
  let s = initialState();
  for (let i = 0; i < MAX_TRIES; i++) s = applyGuess(s, 100000, 200);
  assert.equal(s.status, "lost");
  assert.equal(s.guesses.length, MAX_TRIES);
});

test("buildShareText: 商品名・正解価格を漏らさない", () => {
  let s = initialState();
  s = applyGuess(s, 1000, 200); // high
  s = applyGuess(s, 200, 200); // win
  const txt = buildShareText(s, 42, "https://example.com");
  assert.match(txt, /イクラ？ #42\s+2回で的中/);
  assert.ok(!txt.includes("200")); // 正解価格を含まない
  assert.ok(!txt.includes("1000")); // 推測値も出さない
  assert.ok(txt.includes("🎯")); // 的中行に中央🎯
  assert.ok(txt.includes("https://example.com"));
});

test("buildShareText: 敗北は ✕ かつ 🎯 を描かない", () => {
  let s = initialState();
  for (let i = 0; i < MAX_TRIES; i++) s = applyGuess(s, 100000, 200);
  const txt = buildShareText(s, 7);
  assert.match(txt, /#7\s+✕ 6回/);
  assert.ok(!txt.includes("🎯")); // 正解位置を明かさない
});

test("columnFor: 高すぎは右(>3)・低すぎは左(<3)・的中は中央3", () => {
  assert.equal(columnFor(evaluateGuess(200, 200)), 3); // win 中央
  assert.ok(columnFor(evaluateGuess(1000, 200)) > 3); // 高すぎ→右
  assert.ok(columnFor(evaluateGuess(10, 200)) < 3); // 低すぎ→左
  // 近いほど中央寄り
  assert.ok(
    columnFor(evaluateGuess(230, 200)) < columnFor(evaluateGuess(800, 200)),
  );
});

test("proximity: 0..1 で誤差が小さいほど大きい", () => {
  assert.equal(proximity(0), 1);
  assert.equal(proximity(2), 0);
  assert.ok(proximity(0.1) > proximity(0.5));
});

test("WIN_THRESHOLD は 10%", () => assert.equal(WIN_THRESHOLD, 0.1));

// ===== 出題プール（生成済み JSON）=====
test("puzzles.json: 90日以上・必須フィールド・重複なし", () => {
  const p = JSON.parse(
    readFileSync(resolve(__dirname, "../app/_generated/puzzles.json"), "utf8"),
  );
  assert.ok(p.count >= 90, `count>=90 必要: ${p.count}`);
  const first90 = p.puzzles.slice(0, 90).map((x) => x.name);
  assert.equal(new Set(first90).size, 90, "先頭90日は品目重複なし");
  for (const q of p.puzzles.slice(0, 5)) {
    assert.ok(typeof q.name === "string" && q.name.length > 0);
    assert.ok(typeof q.unit === "string" && q.unit.length > 0);
    assert.ok(Number.isInteger(q.price) && q.price > 0);
    assert.match(q.date, /^\d{4}-\d{2}-\d{2}$/);
  }
});

// ===== pickPuzzle（日付選択とフォールバックの日次同一性）=====
const SAMPLE = [
  {
    day: 1,
    date: "2026-07-17",
    name: "A",
    unit: "1",
    price: 100,
    category: "x",
  },
  {
    day: 2,
    date: "2026-07-18",
    name: "B",
    unit: "1",
    price: 200,
    category: "x",
  },
  {
    day: 3,
    date: "2026-07-19",
    name: "C",
    unit: "1",
    price: 300,
    category: "x",
  },
];

test("pickPuzzle: 収録日はそのまま返る", () => {
  const p = pickPuzzle(SAMPLE, "2026-07-17", "2026-07-18");
  assert.equal(p.date, "2026-07-18");
  assert.equal(p.day, 2);
  assert.equal(p.name, "B");
});

test("pickPuzzle: 範囲外（起点前）でも date は必ず問い合わせ日", () => {
  const p = pickPuzzle(SAMPLE, "2026-07-17", "2026-07-16"); // epoch 前日
  assert.equal(
    p.date,
    "2026-07-16",
    "stale な過去日でなく実日を返す（永続化キー衝突防止）",
  );
  assert.ok(p.day >= 1 && p.day <= SAMPLE.length);
});

test("pickPuzzle: 範囲外（プール以降）でも date は問い合わせ日・item は循環", () => {
  const p = pickPuzzle(SAMPLE, "2026-07-17", "2027-07-20"); // 365日以降相当
  assert.equal(p.date, "2027-07-20");
  assert.ok(["A", "B", "C"].includes(p.name));
});

test("pickPuzzle: 連続する範囲外日は必ず異なる date キーになる", () => {
  const a = pickPuzzle(SAMPLE, "2026-07-17", "2030-01-01");
  const b = pickPuzzle(SAMPLE, "2026-07-17", "2030-01-02");
  assert.notEqual(a.date, b.date); // 日ごとに一意（結果が翌日へ持ち越されない）
});

test("puzzles.json: 商品名に商標らしい英大文字ブランド表記が無い", () => {
  const p = JSON.parse(
    readFileSync(resolve(__dirname, "../app/_generated/puzzles.json"), "utf8"),
  );
  // 一般名詞のみ運用の回帰。英字の連続（ブランド名混入の兆候）を弾く。
  for (const q of p.puzzles) {
    assert.ok(!/[A-Za-z]{3,}/.test(q.name), `英字ブランド混入疑い: ${q.name}`);
  }
});
