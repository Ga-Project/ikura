// site.test.mjs — ビルド成果物を読んで、検索エンジンに申告する内容が壊れていないか検査する。
//
// 背景（実害）: この製品は sitemap.xml を持たないまま公開されており、
// https://ga-project.github.io/ikura/sitemap.xml は 404 だった。Search Console に
// 送る URL リストが存在せず、クローラに発見される経路が実質なかった。
// 型検査も lint もこの class を検出できないため、実際に書き出した out/ を読んで検査する。
//
// 検査対象のルートは **out/ を実走査して導出する**。ここを手書きリストにすると、
// ページを1枚足して sitemap に入れ忘れたときに「手書き2件 vs sitemap2件」で
// 等式が成立してしまい、この製品で最も起きる退行（新ページの申告漏れ・
// 親 layout からの canonical 継承）をまるごと見逃す。
//
// out/ が無い場合はスキップするが、**CI ではスキップを許さない**。
// 静かにスキップする検査は緑のまま通るぶん、「安全網があるつもり」になって
// 無いよりたちが悪い。
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";
import { SITE_URL, absoluteUrl, OG_IMAGE } from "../lib/site.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../out");
const SITEMAP = resolve(OUT, "sitemap.xml");

const built = existsSync(SITEMAP);
// CI では常にスキップ不可。workflow の env 1行が消えても検査が復活しないよう、
// フラグと CI の両方を見る（元凶は「緑のまま sitemap 不在」だった）。
const REQUIRED =
  process.env.IKURA_REQUIRE_PUBLISH_CHECK === "1" || process.env.CI === "true";
const skip = !built && !REQUIRED;

/** out/ 配下の index.html を全部拾ってルートを導出する。 */
function discoverRoutes(dir = OUT) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...discoverRoutes(full));
    else if (entry.name === "index.html") {
      const rel = relative(OUT, dir).split(sep).filter(Boolean).join("/");
      found.push({ route: rel ? `/${rel}` : "/", html: full });
    }
  }
  return found;
}

// Next の not-found。実ルートではないので sitemap にも canonical にも載せない。
const NOT_INDEXED = new Set(["/404"]);
const ROUTES = built ? discoverRoutes() : [];
const INDEXABLE = ROUTES.filter((r) => !NOT_INDEXED.has(r.route));

const attr = (html, re) => (html.match(re) ?? [])[1];
const canonicalOf = (html) =>
  attr(html, /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/);
const metaProp = (html, prop) =>
  attr(
    html,
    new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]*)"`, "i"),
  );
const metaName = (html, name) =>
  attr(html, new RegExp(`<meta[^>]+name="${name}"[^>]+content="([^"]*)"`, "i"));

test("公開検査の前提が満たされている", { skip: !REQUIRED }, () => {
  assert.ok(
    built,
    "公開検査が必須の実行だが out/sitemap.xml が無い。" +
      " 'pnpm build' を先に実行すること" +
      "（この検査がスキップされると、sitemap 不在のまま CI が緑になる）。",
  );
});

test(
  "sitemap の URL 集合がビルド出力のルート集合と完全一致する",
  { skip },
  () => {
    const xml = readFileSync(SITEMAP, "utf8");
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map((m) => m[1])
      .sort();
    const expected = INDEXABLE.map((r) => absoluteUrl(r.route)).sort();
    // 片側だけの差分（ページ追加で sitemap 更新漏れ／sitemap に実在しない URL）を両方落とす。
    assert.deepEqual(
      locs,
      expected,
      "sitemap と実際に書き出されたページが一致しない",
    );
  },
);

test(
  "sitemap の URL が本番の絶対URL・末尾スラッシュで揃っている",
  { skip },
  () => {
    const xml = readFileSync(SITEMAP, "utf8");
    for (const loc of [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => m[1],
    )) {
      assert.ok(
        loc.startsWith(SITE_URL),
        `sitemap に本番オリジン外の URL がある: ${loc}`,
      );
      // trailingSlash: true の出力と食い違うと Search Console の正規化が壊れる。
      assert.ok(
        loc.endsWith("/"),
        `sitemap の URL が末尾スラッシュでない: ${loc}`,
      );
    }
  },
);

test("各ページの canonical / og:url が sitemap と一致する", { skip }, () => {
  const xml = readFileSync(SITEMAP, "utf8");
  for (const { route, html: file } of INDEXABLE) {
    const html = readFileSync(file, "utf8");
    const expected = absoluteUrl(route);

    assert.equal(
      canonicalOf(html),
      expected,
      `canonical が sitemap と食い違う（route=${route}）`,
    );
    assert.equal(
      metaProp(html, "og:url"),
      expected,
      `og:url が canonical と食い違う（route=${route}）`,
    );
    assert.ok(
      xml.includes(`<loc>${expected}</loc>`),
      `canonical の URL が sitemap に無い（route=${route}）`,
    );
  }
});

test("非インデックスページが親の canonical を継承していない", { skip }, () => {
  for (const { route, html } of ROUTES.filter((r) =>
    NOT_INDEXED.has(r.route),
  )) {
    const c = canonicalOf(readFileSync(html, "utf8"));
    assert.equal(c, undefined, `${route} が canonical=${c} を継承している`);
  }
});

test("og と twitter が同じページを名乗っている", { skip }, () => {
  // X は twitter:* を og:* より優先する。片方だけ上書きすると、共有カードが
  // 実際の着地先と別のページを名乗る（privacy を貼るとゲームのカードが出る）。
  for (const { route, html: file } of INDEXABLE) {
    const html = readFileSync(file, "utf8");
    assert.equal(
      metaName(html, "twitter:title"),
      metaProp(html, "og:title"),
      `twitter:title が og:title と食い違う（route=${route}）`,
    );
    assert.equal(
      metaName(html, "twitter:description"),
      metaProp(html, "og:description"),
      `twitter:description が og:description と食い違う（route=${route}）`,
    );
    // 画像に代替テキストが無いと、主要な共有面で読み上げが空になる。
    assert.equal(
      metaName(html, "twitter:image:alt"),
      OG_IMAGE.alt,
      `twitter:image:alt が無い/食い違う（route=${route}）`,
    );
  }
});

test("サブパス配信でアセットが basePath を失っていない", { skip }, () => {
  // basePath 崩れ＝/_next/* が全て 404（HTML は 200 で返るのに何も動かない）という、
  // next.config.mjs 自身が警告している最大の事故。basePath 付きビルドのときだけ検査する。
  const top = readFileSync(resolve(OUT, "index.html"), "utf8");
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  if (!basePath) return;
  assert.ok(
    top.includes(`"${basePath}/_next/`),
    `アセット参照が ${basePath}/_next/ で始まっていない（basePath の取りこぼし）`,
  );
});
