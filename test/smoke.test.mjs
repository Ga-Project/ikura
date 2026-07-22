// ikura — smoke test（node:test 標準ランナー・追加の依存なし）
// 生成物の存在と最小整合を確認する（詳細は game.test.mjs）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("出題プールが生成済みで最低限の形をしている", () => {
  const p = JSON.parse(
    readFileSync(resolve(__dirname, "../app/_generated/puzzles.json"), "utf8"),
  );
  assert.ok(Array.isArray(p.puzzles) && p.puzzles.length >= 90);
  assert.match(p.epoch, /^\d{4}-\d{2}-\d{2}$/);
});
