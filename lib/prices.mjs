// prices.mjs — 平均価格一覧ページの並べ替え・見出し・整形。
//
// なぜ独立モジュールなのか: このページの価値は「静的HTMLに実データの本文がある」
// ことにある（トップは全てクライアント描画で、本文が実測166文字しかなかった）。
// 並べ替えや取りこぼしが壊れても型検査も lint も気づけないため、純粋関数に切り出して
// test/prices.test.mjs が実データ（data/items.json）に対して直接検査する。
//
// .ts でなく .mjs なのは lib/site.mjs と同じ理由で、Next のビルド（TS）と
// node --test の双方から TS 変換を挟まずそのまま import するため。
//
// I/O はここに置かない（items.json の読み込みはページ側とテスト側が各々行う）。
// 純粋関数に保つことで、テストが「実データ」と「異常系の作り物」の両方を同じ関数に
// 通せる。

/**
 * カテゴリの表示順と、各カテゴリの導入文。
 *
 * 導入文を持つのは SEO のためだけではない。表だけを並べたページは
 * 「実のある一覧」ではなく doorway と判定されうるので、カテゴリごとに
 * 「その価格帯が何で決まるか」という読む価値のある文を必ず添える。
 *
 * 並び順は品目数でなく生活導線（毎日の買い物 → 外食 → 消耗品 → 料金 → 趣味）。
 * 検索から来た読者が自分の目的の節に最短で辿り着ける順にしてある。
 *
 * slug は見出しのアンカー（#food 等）に使う。日本語のままでも動くが、
 * 共有時に URL エンコードで読めなくなるため ASCII に固定する。
 */
export const CATEGORY_META = [
  {
    name: "食品",
    slug: "food",
    lead: "主食・生鮮・加工食品まで、家計でもっとも価格を意識する品目です。同じ品目でも容量・産地・季節による振れ幅が大きく、とくに野菜は天候によって平常時の倍近くまで動くことがあります。",
  },
  {
    name: "外食",
    slug: "dining",
    lead: "店舗で提供される料理・飲み物の一食あたりの目安です。原材料費よりも人件費と店舗の賃料が価格を決める比重が大きく、同じメニューでも都市部と地方で差が出やすい領域です。",
  },
  {
    name: "日用品",
    slug: "daily",
    lead: "洗剤・紙製品・衛生用品など、定期的に買い替える消耗品です。単価が小さいぶん意識されにくい一方、まとめ買いと詰め替えの選択で年間の支出差がもっとも出やすい分類でもあります。",
  },
  {
    name: "交通・サービス",
    slug: "services",
    lead: "運賃や施術・修理などの一回あたりの目安です。認可で運賃が決まる公共交通と、技術料が中心で店舗ごとに幅の出るサービスが混在するため、個別の価格が平均から離れる度合いは他の分類より大きくなります。",
  },
  {
    name: "娯楽・文具",
    slug: "leisure",
    lead: "趣味・学習まわりの品目です。定価が広く知られている品目が多く、平均価格と実売価格の差＝値引きの大きさがそのまま体感の「安さ」になりやすい分類です。",
  },
];

/**
 * 3桁区切りの円表記。
 *
 * toLocaleString を使わないのは、実行環境の ICU の有無で区切りが消え、
 * ビルドマシンによって出力 HTML が変わるのを避けるため（静的書き出しなので
 * 生成時の環境差がそのまま公開物の差になる）。
 *
 * @param {number} yen 円（整数）
 * @returns {string} 例 "170円" / "2,400円"
 */
export function formatYen(yen) {
  if (!Number.isFinite(yen)) throw new TypeError(`価格が数値でない: ${yen}`);
  return `${Math.round(yen).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}円`;
}

/**
 * 品目をカテゴリごとにまとめ、CATEGORY_META の順に並べる。
 *
 * CATEGORY_META に無いカテゴリは「捨てずに末尾へ」回す。ここで例外を投げると
 * データを1件足しただけでビルドが落ちるが、黙って落とすと一覧から品目が消えたまま
 * 公開される。取りこぼしは test/prices.test.mjs が CI で検出するので、
 * 実行時は「必ず全件出す」を優先する。
 *
 * カテゴリ内は価格の昇順で「この分類の安い側〜高い側」を読ませる。五十音順に
 * しないのは、items.json が読み仮名を持たず、漢字を音で並べる手段が無いため
 * （localeCompare でも漢字は音に解決されないので、五十音に見えて実際は
 * 五十音でない並びになる）。
 *
 * 同価格のタイブレークはコードユニット比較。localeCompare を使わないのは
 * formatYen が toLocaleString を避けているのと同じ理由で、ICU の有無・版で
 * 並びが変わると、ビルドマシンによって公開される HTML の行順が変わるため。
 * タイは例外でなく主流（食品だけで 250円・300円 に各6品目）なので、
 * 実際に出力の大部分がこの比較で決まる。
 *
 * @param {ReadonlyArray<{name:string,unit:string,price:number,category:string}>} items
 * @returns {Array<{name:string,slug:string,lead:string,items:Array<{name:string,unit:string,price:number,category:string}>}>}
 */
export function groupByCategory(items) {
  /** @type {Map<string, Array<{name:string,unit:string,price:number,category:string}>>} */
  const buckets = new Map();
  for (const item of items) {
    const bucket = buckets.get(item.category);
    if (bucket) bucket.push(item);
    else buckets.set(item.category, [item]);
  }

  const known = CATEGORY_META.map((meta) => ({
    ...meta,
    items: buckets.get(meta.name) ?? [],
  })).filter((group) => group.items.length > 0);

  // 未知カテゴリの slug は出現順の連番。日本語をそのまま id にすると共有 URL が
  // エンコードされて読めなくなる一方、名前から導出したハッシュでは一意にならない
  // （コードポイント和は順序に依存しないので「季節行事」と「行事季節」が衝突する）。
  // slug が重複すると h2 の id が重なり、目次アンカーは常に先頭の節へ飛び、
  // aria-labelledby は別の見出しを指し、React の key も衝突する。
  const unknown = [...buckets.keys()]
    .filter((name) => !CATEGORY_META.some((meta) => meta.name === name))
    .map((name, index) => ({
      name,
      slug: `other-${index + 1}`,
      lead: "",
      items: buckets.get(name) ?? [],
    }));

  for (const group of [...known, ...unknown]) {
    group.items.sort(
      (a, b) => a.price - b.price || compareCodeUnits(a.name, b.name),
    );
  }
  return [...known, ...unknown];
}

/**
 * UTF-16 コードユニット順の全順序（JS の `<` の既定）。BMP 外ではコードポイント順と
 * 一致しないが、目的は「見た目の正しさ」でなく「どのビルド環境でも同じ並びになる」
 * ことなので問題にならない。ロケール照合を挟まない点が肝。
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareCodeUnits(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 基準時点の表示。データは ISO（"2026-07"）のまま保ち、表示だけ日本語にする。
 * この文字列は SERP のスニペットにも出るので、資料として自然な形にする。
 *
 * @param {string} isoMonth "YYYY-MM"
 * @returns {string} 例 "2026年7月"
 */
export function formatAsOf(isoMonth) {
  const m = /^(\d{4})-(\d{2})$/.exec(isoMonth);
  if (!m) throw new TypeError(`_as_of が YYYY-MM 形式でない: ${isoMonth}`);
  const month = Number(m[2]);
  // 形式だけ見て月の範囲を見ないと、"2026-13" の打ち間違いが
  // 「2026年13月時点」として meta description に載って公開される
  // （formatYen が "undefined円" を防いだのと同じクラスの事故）。
  if (month < 1 || month > 12) {
    throw new TypeError(`_as_of の月が範囲外: ${isoMonth}`);
  }
  return `${m[1]}年${month}月`;
}

/**
 * 一覧の要約値（リード文とページ説明で使う）。
 *
 * ページ本文とメタ説明で別々に数えると、片方だけ古い件数が残る。
 *
 * @param {ReadonlyArray<{price:number}>} items
 * @returns {{count:number, min:number, max:number}}
 */
export function summarize(items) {
  if (items.length === 0) throw new RangeError("品目が0件");
  const prices = items.map((i) => i.price);
  return {
    count: items.length,
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}
