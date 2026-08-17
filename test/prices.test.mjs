// prices.test.mjs — 平均価格一覧の中身が壊れていないか、実データで検査する。
//
// このページの唯一の存在理由は「静的HTMLに実データの本文があること」なので、
// 品目が黙って落ちる・価格の表記が崩れる・カテゴリの導入文が付かないまま公開される、
// のいずれも「ページはあるのに価値が無い」状態を作る。型検査も lint も検出できない。
//
// groupByCategory は未知カテゴリを捨てずに末尾へ回す設計なので、
// 「取りこぼしゼロ」は実行時ではなくここで担保する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  CATEGORY_META,
  formatAsOf,
  formatYen,
  groupByCategory,
  summarize,
} from "../lib/prices.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(
  readFileSync(resolve(__dirname, "../data/items.json"), "utf8"),
);
const items = data.items;

test("実データの全品目が一覧に出る（1件も落ちない）", () => {
  const grouped = groupByCategory(items).flatMap((g) => g.items);
  assert.equal(grouped.length, items.length, "件数が入力と一致しない");
  assert.deepEqual(
    grouped.map((i) => i.name).sort(),
    items.map((i) => i.name).sort(),
    "品目の集合が入力と一致しない",
  );
});

test("実データのカテゴリすべてに導入文がある", () => {
  // 未知カテゴリは lead: "" のまま表示されるため、ページは壊れないが
  // 「表だけの節」ができる。データ追加時にここで気づけるようにする。
  const missing = groupByCategory(items)
    .filter((g) => !g.lead)
    .map((g) => g.name);
  assert.deepEqual(
    missing,
    [],
    `CATEGORY_META に導入文が無いカテゴリがある: ${missing.join(", ")}`,
  );
});

test("カテゴリの並びは CATEGORY_META の定義順", () => {
  const order = groupByCategory(items).map((g) => g.name);
  const expected = CATEGORY_META.map((m) => m.name).filter((n) =>
    items.some((i) => i.category === n),
  );
  assert.deepEqual(order, expected);
});

test("カテゴリ内は価格の昇順・同価格はコードユニット順で安定している", () => {
  // タイブレークが ICU 依存だと small-icu ビルドで行順が変わり、公開される HTML が
  // ビルドマシンによって変わる。実データでは同価格が主流（食品の250円・300円に各6件）
  // なので、出力の大部分がこの比較で決まる。
  for (const group of groupByCategory(items)) {
    for (let i = 1; i < group.items.length; i++) {
      const prev = group.items[i - 1];
      const cur = group.items[i];
      const ordered =
        prev.price < cur.price ||
        (prev.price === cur.price && prev.name <= cur.name);
      assert.ok(
        ordered,
        `${group.name}: ${prev.name}(${prev.price}) の後に ${cur.name}(${cur.price})`,
      );
    }
  }
});

test("アンカー用 slug が一意で URL に出せる形をしている", () => {
  const slugs = groupByCategory(items).map((g) => g.slug);
  assert.equal(new Set(slugs).size, slugs.length, "slug が重複している");
  for (const slug of slugs) {
    // 日本語のまま id にすると共有 URL がエンコードされて読めなくなる。
    assert.match(slug, /^[a-z0-9-]+$/, `slug が ASCII でない: ${slug}`);
  }
});

test("未知カテゴリは捨てずに末尾へ回る", () => {
  const grouped = groupByCategory([
    { name: "食パン", unit: "1斤", price: 170, category: "食品" },
    { name: "謎の品", unit: "1個", price: 100, category: "未定義分類" },
  ]);
  assert.deepEqual(
    grouped.map((g) => g.name),
    ["食品", "未定義分類"],
  );
  assert.equal(grouped.at(-1).items.length, 1, "未知カテゴリの品目が消えた");
  assert.match(grouped.at(-1).slug, /^[a-z0-9-]+$/);
});

test("未知カテゴリが複数あっても slug が衝突しない", () => {
  // 名前のコードポイント和で slug を作ると、和は順序に依存しないので
  // アナグラム（季節行事 / 行事季節）が必ず衝突する。衝突すると h2 の id が重なり、
  // 目次アンカーは常に先頭の節へ飛び、aria-labelledby は別の見出しを指し、
  // React の key も重複する。1件だけのケースでは緑のまま通るので2件で検査する。
  const grouped = groupByCategory([
    { name: "a", unit: "1", price: 1, category: "季節行事" },
    { name: "b", unit: "1", price: 1, category: "行事季節" },
  ]);
  const slugs = grouped.map((g) => g.slug);
  assert.equal(new Set(slugs).size, slugs.length, `slug が衝突: ${slugs}`);
});

test("価格の表記が3桁区切りで揃う", () => {
  assert.equal(formatYen(60), "60円");
  assert.equal(formatYen(170), "170円");
  assert.equal(formatYen(1000), "1,000円");
  assert.equal(formatYen(2400), "2,400円");
  assert.equal(formatYen(1234567), "1,234,567円");
});

test("価格が数値でなければ静かに通さない", () => {
  // 未定義を "undefined円" と描いて公開してしまうのを防ぐ。
  assert.throws(() => formatYen(undefined), TypeError);
  assert.throws(() => formatYen(Number.NaN), TypeError);
});

test("基準時点は保存はISO・表示は日本語", () => {
  // データを ISO に保つことで並べ替え・比較ができ、表示だけ資料として自然にする。
  assert.equal(formatAsOf("2026-07"), "2026年7月");
  assert.equal(formatAsOf("2026-12"), "2026年12月");
  assert.equal(formatAsOf(data._as_of), "2026年7月");
});

test("基準時点の形式が壊れていたら静かに通さない", () => {
  // "2026年7月時点" が "undefined時点" として公開されるのを防ぐ。
  // 形式だけでなく月の範囲も見る（"2026-13" が「2026年13月時点」として公開される）。
  for (const bad of [
    "2026-7",
    "2026/07",
    "2026",
    undefined,
    "",
    "2026-13",
    "2026-00",
  ]) {
    assert.throws(() => formatAsOf(bad), TypeError, `通ってしまった: ${bad}`);
  }
  assert.equal(formatAsOf("2026-01"), "2026年1月", "境界の1月を弾いている");
  assert.equal(formatAsOf("2026-12"), "2026年12月", "境界の12月を弾いている");
});

test("要約値が実データと一致する", () => {
  const { count, min, max } = summarize(items);
  assert.equal(count, items.length);
  assert.equal(min, Math.min(...items.map((i) => i.price)));
  assert.equal(max, Math.max(...items.map((i) => i.price)));
  assert.ok(count >= 90, "出題プールの下限(90品目)を割っている");
});

test("0件を要約しようとしたら落ちる", () => {
  assert.throws(() => summarize([]), RangeError);
});

test("実データの各品目が一覧に出せる形をしている", () => {
  for (const item of items) {
    assert.equal(typeof item.name, "string");
    assert.ok(item.name.length > 0, "品目名が空");
    assert.equal(typeof item.unit, "string");
    assert.ok(item.unit.length > 0, `単位が空: ${item.name}`);
    assert.ok(
      Number.isFinite(item.price) && item.price > 0,
      `価格が不正: ${item.name}`,
    );
    assert.equal(typeof item.category, "string");
  }
});

test("単位が狭い端末でも1行に収まる長さに収まっている", () => {
  // 表の単位列は nowrap（数値と単位が分断されるのを防ぐため）。折り返さない以上、
  // 長い単位を1件足すと表でなく「ページ全体」が横スクロールする。
  // レイアウトでは長短を区別できないので、データ側の制約としてここで止める。
  // 現状の最長は「ペット500ml」の8文字（320pxで横あふれ無しを実測）。
  const LIMIT = 10;
  const tooLong = items
    .filter((i) => i.unit.length > LIMIT)
    .map((i) => `${i.name}: ${i.unit}(${i.unit.length}文字)`);
  assert.deepEqual(
    tooLong,
    [],
    `単位が${LIMIT}文字を超えている（320pxでページ全体が横スクロールする）`,
  );
});

test("品目名が重複していない", () => {
  // 重複すると表に同じ行が2つ出るうえ、React の key も衝突する。
  const names = items.map((i) => i.name);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepEqual([...new Set(dupes)], [], "品目名が重複している");
});
