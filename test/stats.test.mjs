// イクラ？ — 戦績ロジックのテスト（node:test・追加依存なし）
// 実行: pnpm test （node --test / Node 22+ の TS 型ストリップで .ts を直接 import）
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyStats,
  normalizeStats,
  recordGame,
  winRate,
  maxDist,
} from "../lib/stats.ts";
import { MAX_TRIES } from "../lib/game.ts";

test("emptyStats: 初期値はすべてゼロ、dist は MAX_TRIES 長", () => {
  const s = emptyStats();
  assert.equal(s.played, 0);
  assert.equal(s.wins, 0);
  assert.equal(s.maxStreak, 0);
  assert.equal(s.dist.length, MAX_TRIES);
  assert.deepEqual(
    s.dist,
    new Array(MAX_TRIES).fill(0),
  );
});

test("recordGame: 勝ちは played/wins/dist を加算し lastDate を更新", () => {
  let s = emptyStats();
  s = recordGame(s, { date: "2026-07-20", won: true, tries: 3, currentStreak: 1 });
  assert.equal(s.played, 1);
  assert.equal(s.wins, 1);
  assert.equal(s.dist[2], 1); // 3回=index2
  assert.equal(s.maxStreak, 1);
  assert.equal(s.lastDate, "2026-07-20");
});

test("recordGame: 負けは played のみ加算、分布は不変", () => {
  let s = emptyStats();
  s = recordGame(s, { date: "2026-07-20", won: false, tries: 6, currentStreak: 0 });
  assert.equal(s.played, 1);
  assert.equal(s.wins, 0);
  assert.deepEqual(s.dist, new Array(MAX_TRIES).fill(0));
});

test("recordGame: 同一日は二重集計しない（番人）", () => {
  let s = emptyStats();
  s = recordGame(s, { date: "2026-07-20", won: true, tries: 2, currentStreak: 1 });
  const again = recordGame(s, {
    date: "2026-07-20",
    won: true,
    tries: 2,
    currentStreak: 1,
  });
  assert.equal(again.played, 1);
  assert.equal(again.wins, 1);
  assert.equal(again, s); // 素通し（同一参照）
});

test("recordGame: maxStreak は現在連勝の最大を保持する", () => {
  let s = emptyStats();
  s = recordGame(s, { date: "2026-07-20", won: true, tries: 1, currentStreak: 5 });
  s = recordGame(s, { date: "2026-07-21", won: false, tries: 6, currentStreak: 0 });
  assert.equal(s.maxStreak, 5); // 連勝が切れても最長は残る
});

test("recordGame: tries が範囲外でも dist を壊さない（クランプ）", () => {
  let s = emptyStats();
  s = recordGame(s, { date: "d1", won: true, tries: 99, currentStreak: 1 });
  s = recordGame(s, { date: "d2", won: true, tries: 0, currentStreak: 2 });
  assert.equal(s.dist[MAX_TRIES - 1], 1); // 99 → 最終バケット
  assert.equal(s.dist[0], 1); // 0 → 先頭バケット
  assert.equal(s.dist.reduce((a, b) => a + b, 0), 2);
});

test("winRate: 勝率は 0..100 の整数", () => {
  assert.equal(winRate(emptyStats()), 0);
  let s = emptyStats();
  s = recordGame(s, { date: "d1", won: true, tries: 1, currentStreak: 1 });
  s = recordGame(s, { date: "d2", won: false, tries: 6, currentStreak: 0 });
  assert.equal(winRate(s), 50);
});

test("winRate: 端数は四捨五入される（1勝3プレイ=33%）", () => {
  let s = emptyStats();
  s = recordGame(s, { date: "d1", won: true, tries: 1, currentStreak: 1 });
  s = recordGame(s, { date: "d2", won: false, tries: 6, currentStreak: 0 });
  s = recordGame(s, { date: "d3", won: false, tries: 6, currentStreak: 0 });
  assert.equal(winRate(s), 33); // 33.33.. → 33
});

test("recordGame: MAX_TRIES 回ちょうどの的中は最終バケットに入る", () => {
  let s = emptyStats();
  s = recordGame(s, {
    date: "d1",
    won: true,
    tries: MAX_TRIES,
    currentStreak: 1,
  });
  assert.equal(s.dist[MAX_TRIES - 1], 1);
  assert.equal(
    s.dist.slice(0, MAX_TRIES - 1).reduce((a, b) => a + b, 0),
    0,
  );
});

test("normalizeStats: wins は played を超えないようクランプ", () => {
  const n = normalizeStats({ played: 2, wins: 99, dist: [], lastDate: "d" });
  assert.equal(n.played, 2);
  assert.equal(n.wins, 2); // 99 → played で頭打ち
  assert.equal(winRate(n), 100); // 100% 超にならない
});

test("maxDist: 全ゼロでも 0 除算回避に 1 を返す", () => {
  assert.equal(maxDist(emptyStats()), 1);
  let s = emptyStats();
  s = recordGame(s, { date: "d1", won: true, tries: 2, currentStreak: 1 });
  s = recordGame(s, { date: "d2", won: true, tries: 2, currentStreak: 2 });
  assert.equal(maxDist(s), 2);
});

test("normalizeStats: 破損値を安全な Stats に丸める", () => {
  const n = normalizeStats({
    played: -3,
    wins: "x",
    maxStreak: 2.9,
    dist: [1, "bad", 3, null, 5, 6, 7, 8],
    lastDate: 123,
  });
  assert.equal(n.played, 0);
  assert.equal(n.wins, 0);
  assert.equal(n.maxStreak, 2);
  assert.equal(n.dist.length, MAX_TRIES);
  assert.equal(n.dist[0], 1);
  assert.equal(n.dist[1], 0); // "bad" → 0
  assert.equal(n.lastDate, ""); // 数値は無効
});

test("normalizeStats: null/非オブジェクトは空 Stats", () => {
  assert.deepEqual(normalizeStats(null), emptyStats());
  assert.deepEqual(normalizeStats("nope"), emptyStats());
});
