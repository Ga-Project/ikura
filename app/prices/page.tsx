import type { Metadata } from "next";
import Link from "next/link";
import data from "../../data/items.json";
import { absoluteUrl, OG_IMAGE } from "../../lib/site.mjs";
import {
  formatAsOf,
  formatYen,
  groupByCategory,
  summarize,
} from "../../lib/prices.mjs";

// 出題プールと同じ data/items.json を、ビルド時にそのまま本文へ書き出す。
//
// なぜこのページが要るのか（実害）: トップは出題も価格も全てクライアント描画で、
// 静的 HTML の本文は実測 166 文字しか無かった。sitemap で呼んでも呼んだ先が
// 実質空なので、収載されても順位が付かない。この製品が検索から取れる余地は
// 「〇〇 平均価格」の長尾側にしか無く、それはこのページでしか作れない。
//
// 113品目を113枚の薄いページに割らないこと（doorway 判定リスク）。カテゴリ単位の
// 節にまとめた1枚に集約し、各節に読む価値のある導入文を必ず添える。
//
// 出題の答えとの関係: このページは品目名で索引できる表なので、「今日の出題を
// 見た人が答えを引ける」経路そのものではある（トップは出題品目名を画面に出す）。
// それでも正確な価格を載せるのは、隠しても秘匿が成立しないため:
// puzzles.json は items.json の price をそのまま複製し、365日分がクライアント JS に
// 同梱済み（＝日付→答えの対応表まで公開済みで、このページはその真部分集合）。
// かつスコアは端末内 localStorage の自己申告のみで、カンニングのコストを払うのは
// 本人だけ。将来サーバ側スコアやランキングを入れるなら、この前提は崩れるので
// puzzles.json の同梱方式ごと見直すこと。

const items = data.items;
const groups = groupByCategory(items);
const { count, min, max } = summarize(items);
const AS_OF = formatAsOf(data._as_of);

const TITLE = "身近な商品・サービスの平均価格一覧 — イクラ？";
// 「公的統計をもとに」だけだと、検索結果のスニペットを見た人が統計の公表値だと
// 受け取る。このページは初めて数字が「参照される資料」になる場所なので、
// data/items.json の _provenance と同じ強度の留保を、SERP に出る文にも持たせる。
const DESC = `食パン・牛乳から外食・日用品まで、身近な${count}品目の平均価格の目安（${AS_OF}時点）をカテゴリ別にまとめました。${formatYen(min)}から${formatYen(max)}まで単位つきで確認できます。公的統計を参考に当社が独自に概算した目安です。`;
const PAGE_URL = absoluteUrl("/prices");

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PAGE_URL },
  // openGraph / twitter は親 layout から最上位キー単位で浅くマージされる。
  // 片方だけ書くと、X（twitter:* を og:* より優先する）で一覧ページを貼ったのに
  // ゲーム本体のカードが出る。privacy と同じく必ず対で書く。
  openGraph: {
    title: TITLE,
    description: DESC,
    type: "website",
    locale: "ja_JP",
    siteName: "イクラ？",
    url: PAGE_URL,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [{ url: OG_IMAGE.url, alt: OG_IMAGE.alt }],
  },
};

export default function Prices() {
  return (
    <div className="app app-doc">
      <header className="masthead">
        <span className="wordmark">
          <span className="mark" aria-hidden="true">
            ¥
          </span>
          イクラ？
        </span>
        {/* 「戻る」にしない。このページの読者は検索から来た初訪問者が主で、
            その人にとって戻る場所は存在しない（＝文言が事実として誤りになる）。 */}
        <Link className="btn btn-nav" href="/">
          今日の1問で遊ぶ
        </Link>
      </header>

      <main className="main" id="main" tabIndex={-1}>
        <h1 className="doc-title">身近な商品・サービスの平均価格一覧</h1>

        {/* 文を JSX の改行でつながない。改行が半角スペースになって全角文の途中に
            混ざり、そのままSERPのスニペットに出る。式ひとつに閉じる。 */}
        <p className="doc-lead">
          {`スーパーで買う食品から、外食・日用品・交通費まで、身近な${count}品目の平均価格の目安をまとめました。総務省統計局「小売物価統計調査」等の公的統計を参考に、当社が独自に概算し、容量や個数の単位をそろえて整理した目安です（${AS_OF}時点）。もっとも安い品目で${formatYen(min)}、もっとも高い品目で${formatYen(max)}。カテゴリごとに、価格の安い順に並べています。`}
        </p>

        {/* 本当の CTA は5つの表の下（実測9画面下）にあり、検索から来た人はまず
            届かない。ファーストビュー付近に軽い導線を1つ置く。 */}
        <p className="doc-kicker">
          この一覧は、毎日1問だけ出題される価格当てゲーム「イクラ？」のデータです。
          <Link href="/">今日の問題に挑戦する →</Link>
        </p>

        <nav className="jump" aria-label="カテゴリ">
          <ul>
            {groups.map((group) => (
              <li key={group.slug}>
                <a href={`#${group.slug}`}>
                  {group.name}
                  <span className="jump-count">{group.items.length}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {/* 並びは価格順なので、特定の品目を探す用途（検索から来た人の主目的）には
            向かない。読み仮名を持たず五十音順が作れない以上、ページ内検索へ促すのが
            いまできる最善の代替。 */}
        <p className="doc-hint">
          特定の品目を探すときは、ブラウザのページ内検索（Ctrl+F／⌘+F）が便利です。
        </p>

        {groups.map((group) => (
          <section key={group.slug} className="doc-section">
            {/* アンカー先は h2 自身に持たせる。ラッパーに付けると sticky な
                masthead の下に見出しが潜り込み、飛んだ先で何の節か分からなくなる。 */}
            <h2 id={group.slug} className="doc-h2">
              {group.name}
              <span className="doc-h2-count">{group.items.length}品目</span>
            </h2>
            {group.lead ? <p className="doc-body">{group.lead}</p> : null}

            <div className="table-wrap">
              <table className="price-table" aria-labelledby={group.slug}>
                <thead>
                  <tr>
                    <th scope="col">品目</th>
                    <th scope="col">単位</th>
                    <th scope="col" className="col-price">
                      平均価格
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item) => (
                    <tr key={`${group.slug}-${item.name}`}>
                      <th scope="row">{item.name}</th>
                      <td className="col-unit">{item.unit}</td>
                      <td className="col-price num">{formatYen(item.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <section className="doc-section">
          <h2 className="doc-h2">この一覧の読み方</h2>
          {/* _provenance をそのまま差し込まない。自前の文と商標の話が二重になり、
              です・ます調とだ・である調が同じ段落で混ざる。強度だけ揃えて書き直す。 */}
          <p className="doc-body">
            {`ここに載せた価格は、公的統計を参考に当社が独自に概算した${AS_OF}時点の目安であり、統計の公表値そのものではありません。実際に店頭で目にする価格は、地域・時期・店舗の規模・特売の有無によって上下します。とくに生鮮食品は収穫量の影響が大きく、平均から倍近く離れる時期があります。買い物の予算を立てるときの、おおまかな基準としてお使いください。`}
          </p>
          <p className="doc-body">
            品目はすべて一般名詞で表しており、特定の商標・ブランド・商品を指すものではありません。
          </p>
        </section>

        <p className="doc-cta">
          <Link className="btn btn-primary" href="/">
            今日の1問に挑戦する
          </Link>
        </p>
      </main>

      {/* footer は main の外に出す。main の内側だと最近接の sectioning ancestor が
          body でなくなり、contentinfo ランドマークにならない（ゲーム側は .app 直下）。 */}
      <footer className="foot">
        <p>
          価格は娯楽・参考目的の概算です。正確性・完全性を保証するものではありません。
        </p>
        <p>
          <Link href="/privacy/">プライバシー・出典・免責</Link>
        </p>
      </footer>
    </div>
  );
}
