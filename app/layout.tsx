import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./theme.css";

const SITE_URL = "https://ga-project.github.io/ikura/";
const TITLE = "イクラ？ — 今日の平均価格、当てられる？";
const DESC =
  "身近な商品・サービスの全国平均価格を当てる、1日1問の無料デイリーゲーム。上げて・下げての手ごたえで寄せて、結果を絵文字で共有しよう。";
// OGP/Twitter カード画像（1200×630・静的書き出し）。GitHub Pages のプロジェクトパス
// 配下に置くため、metadataBase 相対解決の曖昧さを避けて絶対URLで指定する。
const OG_IMAGE = `${SITE_URL}og.png`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESC,
  applicationName: "イクラ？",
  openGraph: {
    title: TITLE,
    description: DESC,
    type: "website",
    locale: "ja_JP",
    siteName: "イクラ？",
    url: SITE_URL,
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "イクラ？ — 今日の平均価格、当てられる？ 1日1問の無料デイリー価格当てゲーム",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: [OG_IMAGE],
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
