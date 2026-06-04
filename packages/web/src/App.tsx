import { useEffect, useState } from 'react';
import type { History, RunDetail, Meta, Baselines, Status, HistoryModelEntry } from './types';
import { loadJson } from './lib/data';
import { modelColor, modelLabel } from './lib/model';
import { currentPeak } from './lib/peak';
import { Sparkline } from './components/Sparkline';
import { QuestionTable } from './components/QuestionTable';

const STATUS: Record<Status, { label: string; cls: string; icon: string }> = {
  normal: { label: '정상', cls: 'st-normal', icon: '🟢' },
  above: { label: '평소↑', cls: 'st-above', icon: '🟢' },
  warn: { label: '주의', cls: 'st-warn', icon: '🟡' },
  degraded: { label: '멍청해짐', cls: 'st-degraded', icon: '🔴' },
  baselining: { label: '측정중', cls: 'st-base', icon: '⚪' },
};
const RANK: Record<Status, number> = { degraded: 3, warn: 2, baselining: 1, normal: 0, above: 0 };
const secs = (ms: number | null | undefined) => (ms == null ? '–' : (ms / 1000).toFixed(1));

const median = (a: number[]): number | null => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor((s.length - 1) / 2)];
};

function ago(updatedAt: string | null | undefined, nowTs: number): string {
  if (!updatedAt) return '—';
  const d = Math.max(0, Math.floor((nowTs - new Date(updatedAt).getTime()) / 1000));
  if (d < 60) return `${d}초 전`;
  if (d < 3600) return `${Math.floor(d / 60)}분 전`;
  if (d < 86400) return `${Math.floor(d / 3600)}시간 전`;
  return `${Math.floor(d / 86400)}일 전`;
}

function phrase(enough: boolean, gap: number | null, n: number, need: number): string {
  if (!enough) return `최고점 쌓는 중 (${n}/${need})`;
  if (gap == null || gap >= -2) return '최고 실력 (정상)';
  return `최고점보다 ${Math.abs(gap)}점 낮음`;
}

export default function App() {
  const [history, setHistory] = useState<History | null>(null);
  const [latest, setLatest] = useState<RunDetail | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [baselines, setBaselines] = useState<Baselines | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    (async () => {
      const [h, l, m, b] = await Promise.all([
        loadJson<History>('history.json'),
        loadJson<RunDetail>('latest.json'),
        loadJson<Meta>('meta.json'),
        loadJson<Baselines>('baselines.json'),
      ]);
      setHistory(h);
      setLatest(l);
      setMeta(m);
      setBaselines(b);
      setSelected(h?.models ?? []);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(async () => {
      const h = await loadJson<History>('history.json');
      if (h && h.updatedAt !== history?.updatedAt) {
        const [l, m, b] = await Promise.all([
          loadJson<RunDetail>('latest.json'),
          loadJson<Meta>('meta.json'),
          loadJson<Baselines>('baselines.json'),
        ]);
        setHistory(h);
        if (l) setLatest(l);
        if (m) setMeta(m);
        if (b) setBaselines(b);
      }
    }, 25000);
    return () => clearInterval(t);
  }, [history?.updatedAt]);

  if (loading) return <div className="state">불러오는 중…</div>;

  if (!history || history.runs.length === 0) {
    return (
      <div className="app">
        <div className="card empty">
          <h2>아직 측정 데이터가 없습니다</h2>
          <pre>{`npm install
npm run bench -- --models opus,sonnet,haiku`}</pre>
        </div>
      </div>
    );
  }

  const allModels = history.models;
  const lastRun = history.runs[history.runs.length - 1];
  const shown = selected.length ? selected : allModels;
  const peak = currentPeak();

  const toggle = (m: string) =>
    setSelected((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));

  const latestOf = (m: string): { e: HistoryModelEntry; at: string } | null => {
    for (let i = history.runs.length - 1; i >= 0; i--) {
      const e = history.runs[i].byModel[m];
      if (e) return { e, at: history.runs[i].startedAt };
    }
    return null;
  };
  const entries = shown
    .map((m) => {
      const le = latestOf(m);
      return le ? { m, e: le.e, at: le.at } : null;
    })
    .filter(Boolean) as { m: string; e: HistoryModelEntry; at: string }[];

  // Reference = the model's PEAK (best score ever observed = its true ceiling).
  // We show how far CURRENT sits BELOW that peak — i.e. how much it has dropped.
  const need = meta?.baselineRuns ?? 3;
  const cardInfo = (m: string, e: HistoryModelEntry) => {
    const all = history.runs.map((r) => r.byModel[m]?.qualityScore).filter((v): v is number => v != null);
    const peak = all.length ? Math.max(...all) : null;
    const cur = e.qualityScore;
    const enough = all.length >= need && peak != null;
    const gap = enough && cur != null && peak != null ? Math.round((cur - peak) * 10) / 10 : null; // <= 0
    const status: Status = !enough
      ? 'baselining'
      : gap == null
        ? 'normal'
        : gap <= -18
          ? 'degraded'
          : gap <= -8
            ? 'warn'
            : 'normal';
    return { peak, gap, status, enough, n: all.length };
  };

  let worst: Status = 'normal';
  for (const { m, e } of entries) {
    const s = cardInfo(m, e).status;
    if (RANK[s] > RANK[worst]) worst = s;
  }
  const vchip = STATUS[worst];

  return (
    <div className="app board simple">
      <header className="bar">
        <div className="brand-min">
          <div className="logo sm" aria-hidden />
          <b>지금 Claude, 최고 실력 대비?</b>
          <span className={`vchip ${vchip.cls}`}>{vchip.icon} {worst === 'degraded' ? '멍청해짐' : worst === 'warn' ? '주의' : worst === 'baselining' ? '측정중' : '정상'}</span>
        </div>
        <div className="bar-right">
          <span className="live" title="25초마다 자동 새로고침. 새 측정이 올라오면 갱신됩니다.">
            <span className="live-dot" />LIVE · 측정 {ago(history.updatedAt, nowTs)}
          </span>
          <span className={`peak-badge ${peak.peak ? 'on' : ''}`} title="과거 피크창: 평일 5–11 AM PT. Pro/Max는 2026-05-06 해제됨.">
            {peak.peak ? '🟠 붐빔' : '🟢 한산'} · {peak.clock}
          </span>
          <div className="chips inline">
            {allModels.map((m, i) => {
              const on = shown.includes(m);
              return (
                <button key={m} className={`chip ${on ? 'on' : ''}`} style={on ? { borderColor: modelColor(m, i), color: modelColor(m, i) } : undefined} onClick={() => toggle(m)}>
                  <span className="dot" style={{ background: modelColor(m, i) }} />
                  {modelLabel(m)}
                </button>
              );
            })}
          </div>
          <button className="ghost-btn" onClick={() => setDetails((d) => !d)}>{details ? '닫기 ▲' : '자세히 ▾'}</button>
        </div>
      </header>

      <div className={`stage ${details ? '' : 'centered'}`}>
        <div className="scards" key={history.updatedAt ?? 'x'}>
          {entries.map(({ m, e, at }, i) => {
            const info = cardInfo(m, e);
            const st = STATUS[info.status] ?? STATUS.baselining;
            const series = history.runs.map((r) => r.byModel[m]?.qualityScore).filter((v): v is number => v != null).slice(-24);
            return (
              <div className={`scard ${st.cls}`} key={m}>
                <div className="sc-emoji">{st.icon}</div>
                <div className="sc-model" style={{ color: modelColor(m, i) }}>{modelLabel(m)}</div>
                <div className="sc-score">
                  {Math.round(e.qualityScore)}<small>/100</small>
                </div>
                <div className="sc-scorelabel">현재 지능 점수</div>
                <div className="sc-phrase">{phrase(info.enough, info.gap, info.n, need)}</div>
                <div className="sc-spark">
                  <Sparkline values={series} color={modelColor(m, i)} baseline={info.peak} />
                </div>
                <div className="sc-foot">
                  최고 {info.peak != null ? Math.round(info.peak) : '–'}점{info.gap != null && info.gap < 0 ? ` · ${info.gap}점` : info.enough ? ' · 최고치' : ''} · {ago(at, nowTs)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="legend-line">
          🟢 최고 근처 · 🟡 다소 하락 · 🔴 멍청해짐 — Opus 심사위원이 답변 품질을 0~100 채점, 각 모델의 <b>최고점</b> 대비 현재 하락폭
        </div>
      </div>

      {details && latest && (
        <div className="details-extra">
          <div className="explain">
            <div className="ex-item"><b>지능 점수</b> — 어려운 추론 문제(12공 저울·확률·논리 등) 답변을 독립된 <b>Opus 심사위원</b>이 채점한 평균.</div>
            <div className="ex-item"><b>왜 정답률이 아니라 품질?</b> 객관식 정답은 haiku도 AIME를 풀 만큼 다 천장이라, 변별되는 건 <b>추론의 깊이·정확성(품질)</b>입니다.</div>
            <div className="ex-item"><b>최고점 대비</b> — 각 모델이 <b>역대 보여준 최고 점수</b>를 기준(=그 모델의 진짜 실력)으로, 현재가 <span className="neg">얼마나 떨어졌는지</span>를 봅니다. 15점↓ 지속 하락 = 멍청해짐. (한 번의 운 나쁜 하락은 노이즈)</div>
            <div className="ex-item"><b>심사위원</b> — {meta?.judgeModel} 고정. 답변 effort={meta?.answerEffort} 고정. 비공식 측정.</div>
          </div>
          <section className="card">
            <div className="card-head"><h2>문제별 점수 (최근)</h2><p>행을 클릭하면 실제 문제·모델 답안·심사위원 점수</p></div>
            <QuestionTable latest={latest} models={shown} />
          </section>
        </div>
      )}
    </div>
  );
}
