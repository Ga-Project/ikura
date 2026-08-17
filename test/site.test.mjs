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
import { formatYen, groupByCategory } from "../lib/prices.mjs";

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

// --- /prices/ の本文が実在することの検査 -------------------------------------
//
// 背景（実害）: トップは出題も価格も全てクライアント描画で、静的 HTML の本文は
// 実測 166 文字しか無かった。sitemap に載せても中身が空なので順位が付かない。
// /prices/ はその本文を作るためだけに存在する。
//
// なぜ meta の検査では足りないか: 上の検査は canonical/og/sitemap の整合しか見ない。
// 後日「カテゴリ絞り込み」等で app/prices/page.tsx に "use client" が付き、表が
// クライアント描画に変わると、本文は殻に戻るのに型検査も lint も既存テストも
// 全て緑のまま通る（＝この変更が直した欠陥が無言で再発する）。成果物を読んで止める。
const PRICES = resolve(OUT, "prices/index.html");
const itemsData = JSON.parse(
  readFileSync(resolve(__dirname, "../data/items.json"), "utf8"),
);

/** タグ・script・style を落とした本文テキスト。 */
function bodyText(html) {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const body = stripped.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? stripped;
  return body
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** HTML の実体参照を戻す（品目名・単位の突合に使う最小限）。 */
function decode(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/g, "'")
    .replace(/<!--.*?-->/g, "");
}

test("/prices/ の表が行ごとに実データと一致する", { skip }, () => {
  // ページ全体に対する includes で価格を見ても、ほぼ何も検出できない。
  // 価格文字列は重複するため（250円 は6品目、300円 も6品目）、1行の価格を
  // 消しても他の行の同じ文字列で includes が満たされる。実測では 113件中 99件が
  // その状態で、単一セルの欠落・値の改変・行のずれが全て素通りしていた。
  // 行タプルで突合すれば、それらが全て落ちる。
  const html = readFileSync(PRICES, "utf8");
  const rows = [...html.matchAll(/<tr>((?:(?!<\/tr>)[\s\S])*)<\/tr>/g)]
    .map((m) =>
      [...m[1].matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/g)].map((c) =>
        decode(c[1].replace(/<[^>]+>/g, "")).trim(),
      ),
    )
    .filter((cells) => cells.length === 3);

  const expected = groupByCategory(itemsData.items).flatMap((g) =>
    g.items.map((i) => [i.name, i.unit, formatYen(i.price)]),
  );
  // 先頭はヘッダ行（品目/単位/平均価格）。カテゴリごとに1本ずつ入る。
  const body = rows.filter((cells) => cells[0] !== "品目");

  assert.deepEqual(
    body,
    expected,
    "静的HTMLの表が実データと行単位で一致しない（欠落・改変・並び順のずれ）",
  );
});

test("/prices/ の本文が索引に足る量を保っている", { skip }, () => {
  const text = bodyText(readFileSync(PRICES, "utf8"));
  // 現状 2,900 文字超。下限は「表が丸ごと消えたら必ず割る」水準に置く。
  assert.ok(
    text.length >= 2000,
    `/prices/ の本文が ${text.length} 文字しかない（表が描画されていない疑い）`,
  );
});

test("/prices/ の見出し id が目次の飛び先と一致する", { skip }, () => {
  const html = readFileSync(PRICES, "utf8");
  const headingIds = [...html.matchAll(/<h2[^>]+id="([^"]+)"/g)].map((m) => m[1]);
  const expected = groupByCategory(itemsData.items).map((g) => g.slug);
  assert.deepEqual(headingIds, expected, "h2 の id とカテゴリの slug が食い違う");
  // 目次のリンク先が実在する id を指しているか（アンカーの空振りを止める）。
  for (const id of expected) {
    assert.ok(
      html.includes(`href="#${id}"`),
      `目次に #${id} へのリンクが無い`,
    );
  }
});

// 免責文言は3ページに手書きで散っている（ゲームのフッター／/prices/／/privacy/）。
// 正本を1つにする改修は別途だが、それまでのドリフトはここで止める。
// 実害: 価格を更新したとき /prices/ の文だけ直り、他の2ページが古い表現のまま残る。
//
// 対象は「価格を提示しているページ」に限り、INDEXABLE 全件には課さない。
// 全件に課すと、価格と無関係なページ（説明・遊び方など）を1枚足しただけで、
// そのページには不要な免責文を書き写さない限り CI が落ちる。ドリフト検査が
// 新ページの追加を妨げる関門に化けるのは、この検査の目的ではない。
//
// 代わりにルートを名指しし、名指ししたルートがビルド出力に実在することも検査する。
// 名指しだけだと、ページを改名・削除したときにループが 0 件を回って
// 「緑のまま検査が消える」（この製品で一度起きている失敗のしかた）。
const DISCLAIMER_CORE = "統計の公表値そのものではありません";
// discoverRoutes が返す形（末尾スラッシュなし）で書く。価格を提示するページを
// 増やしたら、ここにも足すこと。
const DISCLAIMER_ROUTES = ["/", "/prices", "/privacy"];

test("価格を提示する全ページが同じ強度の留保を持っている", { skip }, () => {
  const fileOf = new Map(INDEXABLE.map((r) => [r.route, r.html]));
  for (const route of DISCLAIMER_ROUTES) {
    const file = fileOf.get(route);
    assert.ok(
      file,
      `${route} がビルド出力に無い（改名・削除したなら DISCLAIMER_ROUTES も直すこと）`,
    );
    const text = bodyText(readFileSync(file, "utf8"));
    assert.ok(
      text.includes(DISCLAIMER_CORE),
      `${route} に「${DISCLAIMER_CORE}」が無い（免責文言がドリフトした）`,
    );
  }
});

test("一人法人が「編集部」を名乗っていない", { skip }, () => {
  // 実在しない編集部を、最も正確であるべき出典・免責の文脈で名乗らない。
  for (const { route, html } of ROUTES) {
    assert.ok(
      !readFileSync(html, "utf8").includes("編集部"),
      `${route} に「編集部」が残っている`,
    );
  }
});

test("トップから /prices/ への内部リンクが静的HTMLに残っている", { skip }, () => {
  // /prices/ は検索流入だけが存在理由で、内部リンクはトップからのこの1本しかない。
  // フッターを整理した誰かがこの段落を畳むと、リンクは sitemap だけになり、
  // 最も内部リンクを集めるページからの受け渡しが消える。
  // 「隠さずに静的HTMLへ残す」という判断そのものをここで固定する。
  // basePath の有無はここでは問わない。それは「アセットが basePath を失っていない」
  // 検査の担当で、2つの不変条件を1つの式に混ぜると、検査結果が成果物でなく
  // 「テストを実行したときの env」で決まってしまう（Pages 向けにビルドしたあと
  // 素の pnpm test を打つ、という最も普通の手順で、リンクは実在するのに
  // 「孤立した」と嘘の警告が出る）。ここが固定するのは
  // 「トップから /prices/ へのリンクを静的HTMLに残す」という判断だけ。
  const top = readFileSync(resolve(OUT, "index.html"), "utf8");
  assert.match(
    top,
    /href="[^"]*\/prices\/"/,
    "トップに /prices/ へのリンクが無い（/prices/ が内部リンクから孤立した）",
  );
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
