import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./theme.css";
import { SITE_URL, absoluteUrl, OG_IMAGE } from "../lib/site.mjs";

const TITLE = "イクラ？ — 今日の平均価格、当てられる？";
const DESC =
  "身近な商品・サービスの全国平均価格を当てる、1日1問の無料デイリーゲーム。上げて・下げての手ごたえで寄せて、結果を絵文字で共有しよう。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESC,
  applicationName: "イクラ？",
  // canonical を明示しないと、サブパス配信では末尾スラッシュ有無・パラメータ付きの
  // 共有 URL が別ページとして扱われ、評価が分散する。sitemap と同じ出所から組む。
  alternates: { canonical: absoluteUrl("/") },
  openGraph: {
    title: TITLE,
    description: DESC,
    type: "website",
    locale: "ja_JP",
    siteName: "イクラ？",
    url: absoluteUrl("/"),
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    // 文字列でなく記述子で渡す。文字列だと twitter:image:alt が出ず、
    // X（＝この製品の主要な共有面）で画像に代替テキストが無い状態になる。
    images: [{ url: OG_IMAGE.url, alt: OG_IMAGE.alt }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4fbfb" },
    { media: "(prefers-color-scheme: dark)", color: "#111c22" },
  ],
};

// テーマ・ちらつき防止（描画前に保存済み配色を反映）。
const noFlash = `(function(){try{var t=localStorage.getItem("ikura:v1:theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
        {children}
        {/* 解析: GoatCounter（cookieless・localhost は既定で非計測・秘密キー不要） */}
        <script
          data-goatcounter="https://ga-project.goatcounter.com/count"
          async
          src="//gc.zgo.at/count.js"
        />
      </body>
    </html>
  );
}
