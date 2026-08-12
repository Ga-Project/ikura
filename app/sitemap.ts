import type { MetadataRoute } from "next";
import { absoluteUrl } from "../lib/site.mjs";

// output: "export" では sitemap ルートを静的化する必要がある（未指定だとビルドが落ちる）。
export const dynamic = "force-static";

// out/sitemap.xml を $0 で生成する。
//
// robots.txt はこの製品配下には置かない。robots.txt はオリジン単位でしか効かず、
// 当サイトに効くのは https://ga-project.github.io/robots.txt だけなので、
// /ikura/robots.txt を置いてもクローラは読まない（オリジン直下を用意するかは別課題）。
// 一方 sitemap.xml は Search Console に URL を直接送信できるため、
// サブパス配信でも意味がある。
//
// URL は必ず lib/site.mjs の absoluteUrl を通す（canonical / og:url と同一の出所）。
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: absoluteUrl("/"),
      // 出題は日替わり。トップの内容は毎日変わる。
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/privacy"),
      // 価格データの出典・免責を載せた静的ページ。更新は稀。
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
