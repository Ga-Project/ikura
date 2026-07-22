"use client";

// イクラ？ — デイリー価格当てゲーム（クライアント完結・純静的）。
// デザイン: 「ねだんゲージ（Price Gauge）— 計測器の世界」。上=値札お題 / 中=計測ログ / 下=入力ドック。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import pool from "./_generated/puzzles.json";
import {
  applyGuess,
  buildShareText,
  initialState,
  MAX_TRIES,
  pickPuzzle,
  proximity,
  shareRow,
  type GameState,
  type GuessResult,
  type Puzzle,
} from "../lib/game";

const SITE_URL = "https://ga-project.github.io/ikura/";
const STORE_PREFIX = "ikura:v1";

function todayISOLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function yen(n: number): string {
  return n.toLocaleString("ja-JP");
}

function edgeClass(r: GuessResult | undefined): string {
  if (!r) return "";
  if (r.tier === "veryclose" || r.win) return "near";
  return r.direction === "high" ? "high" : "low";
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [state, setState] = useState<GameState>(initialState);
  const [input, setInput] = useState("");
  const [streak, setStreak] = useState(0);
  const [copied, setCopied] = useState("");
  const [celebrate, setCelebrate] = useState(false);
  const [now, setNow] = useState(0);
  const finalizedRef = useRef(false);

  // 初期化（クライアントのみ・localStorage/Date は effect 内で触る）
  useEffect(() => {
    try {
      const iso = todayISOLocal();
      const p = pickPuzzle(pool.puzzles as Puzzle[], pool.epoch, iso);
      setPuzzle(p);
      const saved = localStorage.getItem(`${STORE_PREFIX}:${p.date}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as { guesses: number[] };
          let s = initialState();
          for (const g of parsed.guesses) s = applyGuess(s, g, p.price);
          setState(s);
          finalizedRef.current = s.status !== "playing";
        } catch {
          /* 破損したセーブデータは無視して初期状態から始める（ゲームを止めない） */
        }
      }
      setReady(true);
    } catch {
      setError(true);
      setReady(true);
    }
    // streak は別 try で隔離（streak キー破損でその日のプレイを妨げない）。
    try {
      const st = localStorage.getItem(`${STORE_PREFIX}:streak`);
      if (st) setStreak(JSON.parse(st).count ?? 0);
    } catch {
      /* streak 復元失敗は無視 */
    }
  }, []);

  // カウントダウン用の時計
  useEffect(() => {
    if (state.status === "playing") return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state.status]);

  const persist = useCallback((p: Puzzle, s: GameState) => {
    try {
      localStorage.setItem(
        `${STORE_PREFIX}:${p.date}`,
        JSON.stringify({ guesses: s.guesses, status: s.status }),
      );
    } catch {
      /* ストレージ不可でもプレイは続行 */
    }
  }, []);

  const finalizeStreak = useCallback((p: Puzzle, won: boolean) => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    try {
      const raw = localStorage.getItem(`${STORE_PREFIX}:streak`);
      const prev = raw
        ? (JSON.parse(raw) as { count: number; last: string })
        : { count: 0, last: "" };
      let count = 0;
      if (won) {
        const y = new Date(Date.parse(p.date + "T00:00:00Z") - 86400000)
          .toISOString()
          .slice(0, 10);
        count = prev.last === y ? prev.count + 1 : 1;
      }
      const next = { count, last: p.date };
      localStorage.setItem(`${STORE_PREFIX}:streak`, JSON.stringify(next));
      setStreak(count);
    } catch {
      /* noop */
    }
  }, []);

  const submit = useCallback(() => {
    if (!puzzle || state.status !== "playing") return;
    const g = Number(input.replace(/[^0-9]/g, ""));
    if (!Number.isFinite(g) || g <= 0) return;
    const next = applyGuess(state, g, puzzle.price);
    setState(next);
    setInput("");
    persist(puzzle, next);
    if (next.status === "won") {
      finalizeStreak(puzzle, true);
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 1100);
    } else if (next.status === "lost") {
      finalizeStreak(puzzle, false);
    }
  }, [puzzle, state, input, persist, finalizeStreak]);

  const share = useCallback(async () => {
    if (!puzzle) return;
    const text = buildShareText(state, puzzle.day, SITE_URL);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied("コピーしました！");
    } catch {
      setCopied("コピーできませんでした");
    }
    setTimeout(() => setCopied(""), 2500);
  }, [puzzle, state]);

  const lastResult = state.results[state.results.length - 1];
  const triesLeft = MAX_TRIES - state.guesses.length;
  const canSubmit =
    input.replace(/[^0-9]/g, "").length > 0 && state.status === "playing";
  const finished = state.status !== "playing";
  const won = state.status === "won";

  // スクリーンリーダー向けの計測フィードバック（ゲームの核＝方向＋近さを音声で伝える）。
  const srStatus = useMemo(() => {
    if (state.status === "won") return "的中しました。";
    if (state.status === "lost") return "試行上限です。今日は終了しました。";
    if (!lastResult) return "";
    const g = state.guesses[state.guesses.length - 1];
    const dir =
      lastResult.direction === "high"
        ? "高すぎます。もっと安く。"
        : "低すぎます。もっと高く。";
    return `${g}円は${dir} 手ごたえ ${Math.round(proximity(lastResult.relError) * 100)}パーセント。`;
  }, [state.status, state.guesses, lastResult]);

  const countdown = useMemo(() => {
    if (!finished || !now) return "";
    const d = new Date(now);
    const next = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate() + 1,
      0,
      0,
      0,
    );
    let s = Math.max(0, Math.floor((next.getTime() - now) / 1000));
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    s %= 3600;
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }, [finished, now]);

  return (
    <>
      <a className="skip-link" href="#main">
        本文へスキップ
      </a>
      <div className="app">
        <header className="masthead">
          <span className="wordmark">
            <span className="mark" aria-hidden="true">
              ¥
            </span>
            イクラ？
            {puzzle && <span className="day-no num">#{puzzle.day}</span>}
          </span>
          <div className="masthead-right">
            {streak > 0 && (
              <span className="streak" title="連勝">
                🔥<span className="num">{streak}</span>
              </span>
            )}
            <ThemeToggle />
          </div>
        </header>

        <main className="main" id="main" tabIndex={-1}>
          <h1 className="visually-hidden">
            イクラ？ — 今日の平均価格を当てるデイリーゲーム
          </h1>
          <p className="visually-hidden" role="status" aria-live="polite">
            {srStatus}
          </p>

          {!ready && <div className="skeleton" aria-hidden="true" />}

          {ready && error && (
            <div className="error-box" role="alert">
              <p>今日のお題を読み込めませんでした。</p>
              <button className="btn" onClick={() => location.reload()}>
                再読み込み
              </button>
            </div>
          )}

          {ready && !error && puzzle && (
            <>
              <section className="tag" aria-label="今日のお題">
                <div className="tag-eyebrow">今日のお題・全国平均</div>
                <div className="tag-item">
                  {puzzle.name}
                  <span className="tag-unit">（{puzzle.unit}）</span>
                </div>
                <div
                  className={`tag-price${won ? " revealed flip" : ""}`}
                  aria-label={
                    won ? `正解 ${puzzle.price}円` : "価格は伏せられています"
                  }
                >
                  <span className="yen">¥</span>
                  <span className="num">{won ? yen(puzzle.price) : "???"}</span>
                </div>
                <div
                  className={`tag-edge ${finished ? "" : edgeClass(lastResult)}`}
                  aria-hidden="true"
                />
              </section>

              {!finished && (
                <>
                  <p className="log-head">計測ログ</p>
                  {state.results.length === 0 ? (
                    <div className="guide">
                      遊び方
                      <ol>
                        <li>価格を入れて「はかる」で計測する</li>
                        <li>「上げて／下げて」の手ごたえで寄せる</li>
                        <li>{MAX_TRIES}回以内に平均価格へ ±10% でジャスト</li>
                      </ol>
                    </div>
                  ) : (
                    <ol className="log">
                      {state.results.map((r, i) => (
                        <LogRow
                          key={i}
                          n={i + 1}
                          guess={state.guesses[i] ?? 0}
                          r={r}
                        />
                      ))}
                    </ol>
                  )}
                </>
              )}

              {finished && (
                <ResultPanel
                  state={state}
                  won={won}
                  onShare={share}
                  copied={copied}
                  streak={streak}
                />
              )}
            </>
          )}
        </main>

        {ready && !error && puzzle && (
          <div className="dock" id="dock">
            <div className="dock-inner">
              {!finished ? (
                <>
                  <div className="input-row">
                    <label className="price-input">
                      <span className="yen" aria-hidden="true">
                        ¥
                      </span>
                      <span className="visually-hidden">
                        推測する価格（円）
                      </span>
                      <input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="off"
                        placeholder="価格を入力"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onBlur={() => setInput((p) => p.replace(/[^0-9]/g, ""))}
                        onKeyDown={(e) => e.key === "Enter" && submit()}
                        aria-label="推測する価格（円）"
                      />
                    </label>
                    <button
                      className="btn-measure"
                      onClick={submit}
                      disabled={!canSubmit}
                    >
                      はかる
                    </button>
                  </div>
                  <p className="tries-left" aria-live="polite">
                    残り <b className="num">{triesLeft}</b> 回
                  </p>
                </>
              ) : (
                <p className="countdown" aria-live="polite">
                  次のイクラ？まで{" "}
                  <b className="num">{countdown || "--:--:--"}</b>
                </p>
              )}
            </div>
          </div>
        )}

        <footer className="foot">
          <p>
            価格は総務省「小売物価統計調査」等の公的統計を基に編集部が概算・整理した参考値です。
            実際の価格は地域・時期・店舗により変動します。商品は一般名詞で表し、特定の商標・ブランドとは関係ありません。娯楽目的のゲームです。
          </p>
          <p>
            <Link href="/privacy/">プライバシー・出典・免責</Link>
          </p>
        </footer>
      </div>
      {celebrate && <div className="confetti" aria-hidden="true" />}
    </>
  );
}

function LogRow({ n, guess, r }: { n: number; guess: number; r: GuessResult }) {
  const near = r.tier === "veryclose";
  const dir = r.direction === "high" ? "high" : "low";
  const dirText = r.direction === "high" ? "下げて" : "上げて";
  const arrow = r.direction === "high" ? "▼" : "▲";
  return (
    <li className={`row${near ? " near" : ""}`}>
      <span className="row-no num">{n}</span>
      <div className="row-main">
        <div className="row-top">
          <span className="row-guess">¥{yen(guess)}</span>
          <span className={`row-dir ${dir}`}>
            <span className="arrow" aria-hidden="true">
              {arrow}
            </span>
            {dirText}
          </span>
        </div>
        {near && <span className="near-badge">おしい！</span>}
      </div>
      <span
        className="gauge"
        aria-label={`手ごたえ ${Math.round(proximity(r.relError) * 100)}%`}
      >
        <span
          className="gauge-fill"
          style={{ width: `${Math.round(proximity(r.relError) * 100)}%` }}
        />
      </span>
    </li>
  );
}

function ResultPanel({
  state,
  won,
  onShare,
  copied,
  streak,
}: {
  state: GameState;
  won: boolean;
  onShare: () => void;
  copied: string;
  streak: number;
}) {
  return (
    <section className="result" aria-live="polite">
      <p className={`result-head ${won ? "win" : "lose"}`}>
        {won ? `🎯 ジャスト！ ${state.guesses.length}回` : "✕ 今日はニアミス"}
      </p>
      <p className="result-sub">
        {won ? "また明日も挑戦してね" : "正解は伏せたまま。また明日！"}
      </p>

      <div className="scale" aria-hidden="true">
        <div className="scale-axis">
          <span>低い ◀</span>
          <span>{won ? "🎯" : "?"}</span>
          <span>▶ 高い</span>
        </div>
        <div className="scale-grid">
          {state.results.map((r, i) => (
            <div className="scale-row" key={i}>
              {shareRow(r).map((cell, j) => (
                <span
                  key={j}
                  className={`cell${j === 3 ? " center" : ""}${cell === "🟦" ? " marker" : ""}${cell === "🎯" ? " bull" : ""}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <b className="num">{state.guesses.length}</b>
          <span>計測回数</span>
        </div>
        <div className="stat">
          <b className="num">{streak}</b>
          <span>連勝</span>
        </div>
      </div>

      <div className="share-actions">
        <button className="btn btn-primary" onClick={onShare}>
          結果を共有
        </button>
      </div>
      <p className="copied" aria-live="polite">
        {copied}
      </p>
    </section>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const saved =
      (localStorage.getItem(`${STORE_PREFIX}:theme`) as
        | "light"
        | "dark"
        | null) ?? null;
    setTheme(saved);
    // 水和で html の data-theme が剥がれても保存済み配色を復元（ちらつき防止の保険）。
    if (saved) document.documentElement.setAttribute("data-theme", saved);
  }, []);
  const toggle = () => {
    const cur =
      document.documentElement.getAttribute("data-theme") ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(`${STORE_PREFIX}:theme`, next);
    } catch {
      /* noop */
    }
    setTheme(next);
  };
  // マウント前は既定表示（☾）に固定し、SSR と初回描画を一致させる（hydration 不整合防止）。
  const isDark =
    mounted &&
    (theme === "dark" ||
      (theme === null &&
        window.matchMedia?.("(prefers-color-scheme: dark)").matches));
  return (
    <button
      className="icon-btn"
      onClick={toggle}
      aria-label="配色を切り替える"
      title="配色を切り替える"
    >
      {isDark ? "☀" : "☾"}
    </button>
  );
}
