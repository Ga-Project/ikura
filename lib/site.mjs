// site.mjs — 公開 URL と共有カード素材の単一の出所。
//
// canonical / og:url / sitemap のどれかひとつでも食い違うと、Search Console 側の
// 正規化が壊れて「重複」「代替ページ」扱いになり、インデックスから落ちる。
// URL は必ずこのファイルの関数を通して組み立て、直書き・文字列連結をしない
// （test/site.test.mjs がビルド成果物に対して一致を検査する）。
//
// .ts でなく .mjs なのは、Next のビルド（TS）と node --test の双方から、
// TS 変換を挟まずそのまま import するため。
//
// NEXT_PUBLIC_BASE_PATH（ローカル配信のルート化）とは意図的に無関係にしてある。
// canonical と sitemap が申告すべきなのは「そのビルドがどこに置かれたか」ではなく
// 常に本番の絶対 URL なので、ここを環境で揺らすと本番以外のビルドが
// 実在しない URL を申告してしまう。
export const SITE_URL = "https://ga-project.github.io/ikura/";

// 以降の組み立ては SITE_URL が `/` で終わることに依存している（末尾が無いと
// パスが1階層食われる）。出所を1つにした意味を保つため、ここで固定する。
if (!SITE_URL.endsWith("/")) {
  throw new Error("SITE_URL は末尾スラッシュで終わること");
}

/**
 * サイト内パスを本番の絶対 URL にする（ページ用・末尾スラッシュ付き）。
 *
 * next.config.mjs が trailingSlash: true なので出力は `/ikura/` `/ikura/privacy/`
 * のように必ず `/` で終わる。canonical と sitemap もその形に揃える。
 *
 * クエリ・ハッシュは扱わない（末尾に `/` を付けてしまうため）。パスのみ渡すこと。
 *
 * @param {string} [path] 先頭・末尾の `/` は有無どちらでもよい（"" と "/" はトップ）
 * @returns {string} 末尾スラッシュ付きの絶対 URL
 */
export function absoluteUrl(path = "") {
  const clean = path.replace(/^\/+/, "").replace(/\/+$/, "");
  return clean ? `${SITE_URL}${clean}/` : SITE_URL;
}

/**
 * public/ 配下のファイルの絶対 URL。
 *
 * absoluteUrl はページ用で必ず末尾に `/` を付けるためファイルには使えない。
 * これが無いと `${SITE_URL}og.png` の生連結が各所に散り、出所の一元化が崩れる。
 *
 * @param {string} file 例 "og.png"
 * @returns {string} 末尾スラッシュなしの絶対 URL
 */
export function assetUrl(file) {
  return `${SITE_URL}${file.replace(/^\/+/, "")}`;
}

/**
 * OGP/Twitter 共有カード画像。layout と各ページで同じ記述子を使い、
 * 寸法・alt がページごとにドリフトするのを防ぐ。
 */
export const OG_IMAGE = {
  url: assetUrl("og.png"),
  width: 1200,
  height: 630,
  // alt は「画像に何が描いてあるか」を書く場所。og:title の丸写しにすると
  // 読み上げでタイトル・説明・alt がほぼ同じ文で3回流れる。
  alt: "「イクラ？」のタイトルカード。低い⇔高いの目盛りの上にタイルが並び、中央寄りの1マスが的中の色で光っている。",
};
