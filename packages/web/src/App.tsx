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
  incomplete: { label: '측정실패', cls: 'st-base', icon: '⚠️' },
};
const RANK: Record<Status, number> = { degraded: 3, warn: 2, baselining: 1, incomplete: 1, normal: 0, above: 0 };

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
    // Prefer the most recent COMPLETE reading; a rate-limited partial run shouldn't
    // replace a good card. Fall back to the latest entry only if none are complete.
    let fallback: { e: HistoryModelEntry; at: string } | null = null;
    for (let i = history.runs.length - 1; i >= 0; i--) {
      const e = history.runs[i].byModel[m];
      if (!e) continue;
      if (!fallback) fallback = { e, at: history.runs[i].startedAt };
      if (!e.incomplete && e.qualityScore != null) return { e, at: history.runs[i].startedAt };
    }
    return fallback;
  };
  const entries = shown
    .map((m) => {
      const le = latestOf(m);
      return le ? { m, e: le.e, at: le.at } : null;
    })
    .filter(Boolean) as { m: string; e: HistoryModelEntry; at: string }[];

  const cardInfo = (m: string, e: HistoryModelEntry) => {
    // Peak/baseline use COMPLETE runs only (an unmeasured dimension would distort them).
    const complete = history.runs.map((r) => r.byModel[m]).filter((x) => x && !x.incomplete);
    const all = complete.map((x) => x!.qualityScore).filter((v): v is number => v != null);
    const peakScore = all.length ? Math.max(...all) : null;
    const cur = e.qualityScore;
    const enough = all.length >= need && peakScore != null;
    const gap = enough && cur != null && peakScore != null ? Math.round((cur - peakScore) * 10) / 10 : null;
    // objective health (the reliable degradation tripwire): current vs its own peak
    const objAll = complete.map((x) => x!.objHealth).filter((v): v is number => v != null);
    const objCur = e.objHealth ?? null;
    const objPeak = objAll.length ? Math.max(...objAll) : null;
    const objGap = enough && objCur != null && objPeak != null ? Math.round((objCur - objPeak) * 10) / 10 : null;
    let status: Status = 'baselining';
    if (e.incomplete || cur == null) {
      status = 'incomplete';
    } else if (enough) {
      const qBad = gap != null && gap <= -18;
      const qWarn = gap != null && gap <= -8;
      const oBad = objGap != null && objGap <= -15;
      const oWarn = objGap != null && objGap <= -8;
      status = qBad || oBad ? 'degraded' : qWarn || oWarn ? 'warn' : 'normal';
    }
    return { peak: peakScore, gap, status, enough, n: all.length, objCur, objPeak, objGap };
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
          <span className={`vchip ${vchip.cls}`}>{vchip.icon} {worst === 'degraded' ? '멍청해짐' : worst === 'warn' ? '주의' : worst === 'baselining' ? '측정중' : worst === 'incomplete' ? '측정실패' : '정상'}</span>
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
          const series = history.runs.map((r) => r.byModel[m]).filter((x) => x && !x.incomplete).map((x) => x!.qualityScore).filter((v): v is number => v != null).slice(-24);
          return (
            <div className={`scard tall ${st.cls}`} key={m}>
              <div className="sc-top">
                <span className="sc-model" style={{ color }}>
                  <span className="dot" style={{ background: color }} />
                  {modelLabel(m)}
                </span>
                {info.objCur != null && (
                  <span className="health-pill" title="객관 정답 사다리 통과율(난이도 가중). 자기 최고 대비 떨어지면 실제 저하 신호.">
                    🛡 객관 {Math.round(info.objCur)}{info.objGap != null && info.objGap <= -8 ? ` (▼${Math.abs(Math.round(info.objGap))})` : ''}
                  </span>
                )}
                <span className={`status-badge ${st.cls}`}>{st.icon} {st.label}</span>
              </div>
              <div className="sc-score">{e.qualityScore != null ? Math.round(e.qualityScore) : '–'}<small>/100</small></div>
              <div className="sc-scorelabel">{info.status === 'incomplete' ? '⚠️ 일부 차원 측정 실패(서버 레이트리밋) · 직전 정상값 표시' : `추론 품질 점수 · ${phrase(info.enough, info.gap, info.n, need)}${info.peak != null ? ` (최고 ${Math.round(info.peak)})` : ''}`}</div>

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
        큰 숫자·막대 = 6개 차원의 어려운 풀이를 <b>Opus 심사위원이 0~100 채점</b>한 추론 품질 · 🛡<b>객관</b> = 매번 새로 생성한 정답 사다리 통과율(저하 감지) · 각 모델 <b>최고점 대비</b> · 🟢정상 🟡주의 🔴멍청해짐
      </div>

      {details && latest && (
        <div className="modal-overlay" onClick={() => setDetails(false)}>
          <div className="modal" onClick={(ev) => ev.stopPropagation()}>
            <div className="modal-head">
              <h2>차원별 난이도 돌파 · 답안 (최근 측정)</h2>
              <button className="ghost-btn" onClick={() => setDetails(false)}>닫기 ✕</button>
            </div>
            <div className="explain">
              <div className="ex-item"><b>품질 점수 (화면의 숫자·막대)</b> — 각 차원의 어려운 문제 풀이를 독립된 <b>Opus 심사위원</b>이 0~100 채점. 정답은 코드가 계산해 심사위원에게 제공(레퍼런스 기반). 정답 여부는 다 비슷해 <b>추론의 명료성·타당성</b>으로 갈립니다.</div>
              <div className="ex-item"><b>🛡 객관 건강도</b> — 매번 새로 생성한 문제를 쉬움·중간·어려움으로 풀려 통과율을 잰 값(난이도 가중). 암기 불가·코드 채점이라 <b>가장 정직한 저하 신호</b>입니다(평소 풀던 걸 못 풀면 하락). 아래는 가장 어려운 단계의 문제와 모델별 돌파 현황(L2·L4·L6).</div>
              <div className="ex-item"><b>최고점 대비</b> — 품질 또는 객관 건강도가 자기 역대 최고보다 떨어지면 🟡주의·🔴멍청해짐.</div>
            </div>
            <QuestionTable latest={latest} models={shown} />
          </div>
        </div>
      )}
    </div>
  );
}
