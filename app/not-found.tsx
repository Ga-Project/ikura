import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ページが見つかりません — イクラ？",
};

export default function NotFound() {
  return (
    <div className="app">
      <main className="main" id="main" tabIndex={-1}>
        <section className="tag" style={{ marginTop: "var(--space-8)" }}>
          <div className="tag-eyebrow">404</div>
          <h1 className="tag-item" style={{ margin: 0 }}>
            ページが見つかりません
          </h1>
          <div className="tag-price" aria-hidden="true">
            <span className="yen">¥</span>
            <span className="num">???</span>
          </div>
        </section>
        <p style={{ textAlign: "center", marginTop: "var(--space-5)" }}>
          <Link
            className="btn btn-primary"
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 48,
              padding: "0 24px",
            }}
          >
            今日のイクラ？へ
          </Link>
        </p>
      </main>
    </div>
  );
}
