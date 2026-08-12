import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl, OG_IMAGE } from "../../lib/site.mjs";

const TITLE = "プライバシー・出典・免責 — イクラ？";
const DESC = "イクラ？のプライバシーポリシー、価格データの出典、免責事項。";
const PAGE_URL = absoluteUrl("/privacy");

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PAGE_URL },
  // openGraph / twitter はいずれも親 layout から「最上位キー単位で」浅くマージされる。
  // ＝ここで定義すると親の同キーを丸ごと置き換え、定義しなければ親の値がそのまま残る。
  // 画像はトップと共通のまま、文言と URL だけこのページを名乗らせる。
  openGraph: {
    title: TITLE,
    description: DESC,
    type: "website",
    locale: "ja_JP",
    siteName: "イクラ？",
    url: PAGE_URL,
    images: [OG_IMAGE],
  },
  // twitter を省くと親（ゲーム本体）の title/description が残り、X 上ではこちらが
  // og より優先されるため、法務ページなのにゲームのカードが出る。og と必ず対で書く。
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [{ url: OG_IMAGE.url, alt: OG_IMAGE.alt }],
  },
};

export default function Privacy() {
  return (
    <div className="app">
      <header className="masthead">
        <span className="wordmark">
          <span className="mark" aria-hidden="true">
            ¥
          </span>
          イクラ？
        </span>
        <Link
          className="btn"
          href="/"
          style={{
            flex: "0 0 auto",
            minWidth: 0,
            padding: "0 16px",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          ← ゲームへ戻る
        </Link>
      </header>

      <main
        className="main"
        id="main"
        tabIndex={-1}
        style={{ paddingBottom: "48px" }}
      >
        <h1
          style={{ fontSize: "var(--fs-title)", marginTop: "var(--space-4)" }}
        >
          プライバシー・出典・免責
        </h1>

        <section style={{ marginTop: "var(--space-5)" }}>
          <h2 style={{ fontSize: "1.05rem" }}>データの出典</h2>
          <p
            style={{ marginTop: "var(--space-2)", color: "var(--text-muted)" }}
          >
            本ゲームで用いる価格は、総務省統計局「小売物価統計調査」等の公的統計を基に、
            当編集部が独自に概算・整理した参考値です。統計の生データをそのまま転載するのではなく、
            出題用に再編集しています。商品は一般名詞で表し、特定の商標・ブランド・商品を指すものではありません。
          </p>
        </section>

        <section style={{ marginTop: "var(--space-5)" }}>
          <h2 style={{ fontSize: "1.05rem" }}>免責事項</h2>
          <p
            style={{ marginTop: "var(--space-2)", color: "var(--text-muted)" }}
          >
            価格はあくまで娯楽目的の概算であり、実際の販売価格は地域・時期・店舗・容量等により大きく変動します。
            本ゲームの内容の正確性・完全性・最新性について保証するものではなく、
            本ゲームの利用によって生じたいかなる損害についても責任を負いかねます。
          </p>
        </section>

        <section style={{ marginTop: "var(--space-5)" }}>
          <h2 style={{ fontSize: "1.05rem" }}>プライバシーポリシー</h2>
          <p
            style={{ marginTop: "var(--space-2)", color: "var(--text-muted)" }}
          >
            本ゲームはお客様の氏名・メールアドレス等の個人情報を収集しません。
            プレイ状況（当日の推測・連勝数・配色設定）は、お客様のブラウザ内（localStorage）にのみ保存され、
            当社のサーバーへ送信されることはありません。
          </p>
          <p
            style={{ marginTop: "var(--space-2)", color: "var(--text-muted)" }}
          >
            アクセス解析に GoatCounter を利用しています。GoatCounter は Cookie
            を使用せず、
            個人を特定しない集計（ページビュー・参照元・おおまかな地域等）のみを行います。
            表示広告を掲載する場合は、その旨と広告事業者の取り扱いを別途明示します。
          </p>
        </section>

        <p style={{ marginTop: "var(--space-6)" }}>
          <Link href="/">← ゲームへ戻る</Link>
        </p>
      </main>
    </div>
  );
}
