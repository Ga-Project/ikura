#!/usr/bin/env node
// イクラ？ — 出題プール生成（build-time・冪等・決定論的）
//
// data/items.json（curated 価格データセット）から、固定シードで並べ替えた出題順を作り、
// 起点日から 365 日分の「日付→出題」スケジュールを app/_generated/puzzles.json に書き出す。
//
// 冪等性(R1): 入力(items.json)とシード/起点が同じなら常に同じ出力。手動判断はループに入らない。
// 実行: node scripts/generate-puzzles.mjs  （package.json の prebuild からも自動実行）

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// 起点日（day #1）。UTC 基準の暦日で通し番号を振る。
const EPOCH = "2026-07-17";
const DAYS = 365;
const SEED = 0x1c4a; // 固定シード（出力を安定させる）

// --- 決定論的 PRNG（mulberry32）: Math.random を使わず再現可能にする ---
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function addDaysISO(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function main() {
  const raw = JSON.parse(
    readFileSync(resolve(ROOT, "data/items.json"), "utf8"),
  );
  const items = raw.items;
  if (!Array.isArray(items) || items.length < 90) {
    throw new Error(
      `items.json の件数不足: ${items?.length ?? 0}（90日運用に最低90件必要）`,
    );
  }
  const rng = mulberry32(SEED);
  const order = shuffle(items, rng);

  const puzzles = [];
  for (let i = 0; i < DAYS; i++) {
    const item = order[i % order.length]; // 品目数(>90)周期 → 90日窓内は重複しない
    puzzles.push({
      day: i + 1,
      date: addDaysISO(EPOCH, i),
      name: item.name,
      unit: item.unit,
      price: item.price,
      category: item.category,
    });
  }

  const out = {
    epoch: EPOCH,
    provenance: raw._provenance,
    count: puzzles.length,
    puzzles,
  };
  const outPath = resolve(ROOT, "app/_generated/puzzles.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.error(
    `generate-puzzles: ${puzzles.length}日分を生成 → app/_generated/puzzles.json（起点 ${EPOCH}, ${items.length}品目）`,
  );
}

main();
