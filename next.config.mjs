/** @type {import('next').NextConfig} */
// サブパス配信（GitHub Pages プロジェクトページ = <owner>.github.io/ikura/）では
// basePath/assetPrefix が必須（未設定だと /_next/... がドメイン直下に解決され全アセット404）。
// ルート直下で配信する場合（ローカルのプレビュー等）は basePath を空にする。
// → env NEXT_PUBLIC_BASE_PATH で切替。既定（未設定）は空＝ルート配信。Pages デプロイ時のみ "/ikura" を注入。
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  reactStrictMode: true,
  // static export（out/ に静的書き出し）。サーバランタイム不要。
  output: "export",
  // export では Next の画像最適化サーバが使えないため無効化。
  images: { unoptimized: true },
  // 各ルートを /path/index.html として出力し、サブディレクトリ配信で 404 を避ける。
  trailingSlash: true,
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
