import { useEffect, useState } from 'react';
import type { History, RunDetail, Meta, Baselines, Status, HistoryModelEntry } from './types';
import { loadJson } from './lib/data';
import { modelColor, modelLabel } from './lib/model';
import { currentPeak } from './lib/peak';
import { Sparkline } from './components/Sparkline';
import { DimensionBars } from './components/DimensionBars';
import { QuestionTable } from './components/QuestionTable';

const STATUS: Record<Status, { label: string; cls: string; icon: string }> = {
  normal: { label: '정상', cls: 'st-normal', icon: '🟢' },
  above: { label: '정상', cls: 'st-normal', icon: '🟢' },
  warn: { label: '주의', cls: 'st-warn', icon: '🟡' },
  degraded: { label: '멍청해짐', cls: 'st-degraded', icon: '🔴' },
  baselining: { label: '측정중', cls: 'st-base', icon: '⚪' },
};
const RANK: Record<Status, number> = { degraded: 3, warn: 2, baselining: 1, normal: 0, above: 0 };

const DIM_LABEL: Record<string, string> = { reasoning: '추론', math: '수학', probability: '확률', spatial: '공간', combinatorics: '조합', process: '절차' };
const DIM_ORDER = ['reasoning', 'math', 'probability', 'spatial', 'combinatorics', 'process'];

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
  if (gap == null || gap >= -2) return '최고 실력';
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
  const shown = selected.length ? selected : allModels;
  const peak = currentPeak();
  const need = meta?.baselineRuns ?? 3;

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

  const cardInfo = (m: string, e: HistoryModelEntry) => {
    const all = history.runs.map((r) => r.byModel[m]?.qualityScore).filter((v): v is number => v != null);
    const peakScore = all.length ? Math.max(...all) : null;
    const cur = e.qualityScore;
    const enough = all.length >= need && peakScore != null;
    const gap = enough && cur != null && peakScore != null ? Math.round((cur - peakScore) * 10) / 10 : null;
    const status: Status = !enough ? 'baselining' : gap == null ? 'normal' : gap <= -18 ? 'degraded' : gap <= -8 ? 'warn' : 'normal';
    return { peak: peakScore, gap, status, enough, n: all.length };
  };

  const dimsOf = (e: HistoryModelEntry) =>
    DIM_ORDER.map((d) => {
      const ids = (meta?.questions ?? []).filter((q) => q.dimension === d).map((q) => q.id);
      const ss = ids.map((id) => e.byQuestion[id]).filter((v): v is number => v != null);
      return { dim: d, label: DIM_LABEL[d] ?? d, score: ss.length ? Math.round(ss.reduce((a, b) => a + b, 0) / ss.length) : null };
    });

  let worst: Status = 'normal';
  for (const { m, e } of entries) {
    const s = cardInfo(m, e).status;
    if (RANK[s] > RANK[worst]) worst = s;
  }
  const vchip = STATUS[worst];

  return (
    <div className="app board locked">
      <header className="bar">
        <div className="brand-min">
          <div className="logo sm" aria-hidden />
          <b>Claude 지능 — 최고 실력 대비</b>
          <span className={`vchip ${vchip.cls}`}>{vchip.icon} {worst === 'degraded' ? '멍청해짐' : worst === 'warn' ? '주의' : worst === 'baselining' ? '측정중' : '정상'}</span>
        </div>
        <div className="bar-right">
          <span className="live" title="25초마다 자동 새로고침. 매시간 새 측정이 반영됩니다.">
            <span className="live-dot" />LIVE · 측정 {ago(history.updatedAt, nowTs)}
          </span>
          <span className={`peak-badge ${peak.peak ? 'on' : ''}`} title="과거 피크창: 평일 5–11 AM PT.">
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
          <button className="ghost-btn" onClick={() => setDetails(true)}>자세히 ▾</button>
        </div>
      </header>

      <div className="cards3" key={history.updatedAt ?? 'x'}>
        {entries.map(({ m, e, at }, i) => {
          const info = cardInfo(m, e);
          const st = STATUS[info.status] ?? STATUS.baselining;
          const color = modelColor(m, i);
          const series = history.runs.map((r) => r.byModel[m]?.qualityScore).filter((v): v is number => v != null).slice(-24);
          return (
            <div className={`scard tall ${st.cls}`} key={m}>
              <div className="sc-top">
                <span className="sc-model" style={{ color }}>
                  <span className="dot" style={{ background: color }} />
                  {modelLabel(m)}
                </span>
                <span className={`status-badge ${st.cls}`}>{st.icon} {st.label}</span>
              </div>
              <div className="sc-score">{Math.round(e.qualityScore)}<small>/100</small></div>
              <div className="sc-scorelabel">종합 지능 점수 · {phrase(info.enough, info.gap, info.n, need)}{info.peak != null ? ` (최고 ${Math.round(info.peak)})` : ''}</div>

              <DimensionBars bars={dimsOf(e)} color={color} />

              <div className="sc-trend">
                <div className="sc-trend-head">시간별 추이 <span>{ago(at, nowTs)}</span></div>
                <div className="sc-trend-chart">
                  <Sparkline values={series} color={color} baseline={info.peak} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="legend-line">
        종합 = 매 측정마다 <b>새로 생성한 12문제</b>(추론·수학·확률·공간·조합·절차)를 풀어 <b>정답 자동 채점</b>한 평균 · 각 모델 <b>최고점 대비</b> 현재 · 🟢정상 🟡주의 🔴멍청해짐
      </div>

      {details && latest && (
        <div className="modal-overlay" onClick={() => setDetails(false)}>
          <div className="modal" onClick={(ev) => ev.stopPropagation()}>
            <div className="modal-head">
              <h2>문제별 점수 · 답안 (최근 측정)</h2>
              <button className="ghost-btn" onClick={() => setDetails(false)}>닫기 ✕</button>
            </div>
            <div className="explain">
              <div className="ex-item"><b>지능 점수</b> — 매 측정마다 <b>코드가 새로 생성</b>한 문제(숫자·조건이 매번 달라짐)를 풀게 하고, <b>정답도 코드가 계산</b>해 정확히 채점한 12문제 평균. 외운 답이 안 통해 <b>진짜 추론</b>만 측정됩니다.</div>
              <div className="ex-item"><b>최고점 대비</b> — 각 모델의 역대 최고 점수 기준, 현재가 얼마나 떨어졌는지(8점↓ 주의, 18점↓ 멍청해짐).</div>
            </div>
            <QuestionTable latest={latest} models={shown} />
          </div>
        </div>
      )}
    </div>
  );
}
