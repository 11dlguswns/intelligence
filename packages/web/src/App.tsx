import { useEffect, useState, type CSSProperties } from 'react';
import type { History, RunDetail, Meta, Baselines, Status, HistoryModelEntry } from './types';
import { loadJson } from './lib/data';
import { modelColor, modelLabel } from './lib/model';
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

// Card shows 3 grouped ABILITIES (the 6 measured dims combined into related pairs) so it's
// not too granular; the "자세히" modal still exposes all 6 individually.
const GROUPS: { key: string; label: string; subs: string[]; hint: string }[] = [
  { key: 'reasoning', label: '추론', subs: ['reasoning', 'process'], hint: '논리 추론 · 절차 실행' },
  { key: 'calc', label: '계산', subs: ['math', 'probability'], hint: '수학 · 확률' },
  { key: 'structure', label: '공간·조합', subs: ['spatial', 'combinatorics'], hint: '공간 · 경우의 수' },
];

function ago(updatedAt: string | null | undefined, nowTs: number): string {
  if (!updatedAt) return '—';
  const d = Math.max(0, Math.floor((nowTs - new Date(updatedAt).getTime()) / 1000));
  if (d < 60) return `${d}초 전`;
  if (d < 3600) return `${Math.floor(d / 60)}분 전`;
  if (d < 86400) return `${Math.floor(d / 3600)}시간 전`;
  return `${Math.floor(d / 86400)}일 전`;
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
    const cur = e.qualityScore;
    // CONDITION = normalized to THIS model's own observed range (its worst→best = 0→100),
    // so a tiny absolute change becomes a visible swing — exactly the "self-relative" view.
    const series = history.runs
      .map((r) => r.byModel[m])
      .filter((x) => x && !x.incomplete)
      .map((x) => x!.qualityScore)
      .filter((v): v is number => v != null);
    const n = series.length;
    const lo = n ? Math.min(...series) : null;
    const hi = n ? Math.max(...series) : null;
    const med = n ? [...series].sort((a, b) => a - b)[Math.floor((n - 1) / 2)] : null;
    const mean = n ? series.reduce((a, b) => a + b, 0) / n : 0;
    const sd = n > 1 ? Math.sqrt(series.reduce((a, b) => a + (b - mean) ** 2, 0) / n) : 0;
    // self-range condition index 0..100 (user's request: own min=0, own max=100)
    const condIndex = lo != null && hi != null && hi > lo && cur != null
      ? Math.round(((cur - lo) / (hi - lo)) * 100)
      : null;
    // robust alarm: only fire when the current score is beyond the model's NORMAL variation
    // (z-score vs its own σ), NOT just because the normalized position is low (that's noise).
    const z = sd > 0 && med != null && cur != null ? (cur - med) / sd : 0;
    const belowBand = med != null && cur != null && sd > 0 && cur < med - sd;
    const objCur = e.objHealth ?? null;
    const objDrop = objCur != null ? Math.round((objCur - 100) * 10) / 10 : null;
    const enough = n >= need;
    let status: Status = 'baselining';
    if (e.incomplete || cur == null) {
      status = 'incomplete';
    } else if (!enough) {
      status = 'baselining';
    } else {
      const oBad = objDrop != null && objDrop <= -20;
      const oWarn = objDrop != null && objDrop <= -8;
      const cBad = z <= -3 && n >= 5; // ~3σ below its own normal = real dip
      const cWarn = z <= -2; // ~2σ below normal
      status = cBad || oBad ? 'degraded' : cWarn || oWarn ? 'warn' : 'normal';
    }
    return { cur, lo, hi, med, sd, condIndex, belowBand, status, enough, n, objCur, objDrop };
  };

  // Per-GROUP condition: each ability group's quality (mean of its member dims) normalized
  // to THAT group's own observed range (best=100, worst=0) for THIS model — same self-range
  // idea as the headline, at a coarser, less noisy granularity.
  const dimsOf = (m: string, e: HistoryModelEntry) => {
    const completeRuns = history.runs.map((r) => r.byModel[m]).filter((x) => x && !x.incomplete) as HistoryModelEntry[];
    const groupScore = (entry: HistoryModelEntry, subs: string[]): number | null => {
      const vals = subs.map((d) => entry.byQuestion?.[d]).filter((v): v is number => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    return GROUPS.map((g) => {
      const series = completeRuns.map((x) => groupScore(x, g.subs)).filter((v): v is number => v != null);
      const cur = groupScore(e, g.subs);
      const lo = series.length ? Math.min(...series) : null;
      const hi = series.length ? Math.max(...series) : null;
      const varies = lo != null && hi != null && hi > lo;
      const cond = cur == null ? null : varies ? Math.round(((cur - lo!) / (hi! - lo!)) * 100) : 100;
      return { dim: g.key, label: g.label, hint: g.hint, cond, abs: cur != null ? Math.round(cur) : null, varies };
    });
  };

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
          <b>Claude 컨디션 — 평소 대비 지금</b>
          <span className={`vchip ${vchip.cls}`}>{vchip.icon} {worst === 'degraded' ? '멍청해짐' : worst === 'warn' ? '주의' : worst === 'baselining' ? '측정중' : worst === 'incomplete' ? '측정실패' : '정상'}</span>
        </div>
        <div className="bar-right">
          <span className="live" title="25초마다 자동 새로고침. 새 측정이 자동 반영됩니다.">
            <span className="live-dot" />측정 {ago(history.updatedAt, nowTs)}
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
        {entries.map(({ m, e }, i) => {
          const info = cardInfo(m, e);
          const st = STATUS[info.status] ?? STATUS.baselining;
          const color = modelColor(m, i);
          const series = history.runs.map((r) => r.byModel[m]).filter((x) => x && !x.incomplete).map((x) => x!.qualityScore).filter((v): v is number => v != null).slice(-24);
          const showObj = info.objCur != null && info.objCur < 99.5;
          return (
            <div className={`card2 ${st.cls}`} key={m} style={{ '--mc': color } as CSSProperties}>
              <div className="c2-top">
                <span className="c2-model"><span className="dot" style={{ background: color }} />{modelLabel(m)}</span>
                <span className="c2-flags">
                  {showObj && <span className="c2-obj" title="객관 정답 사다리 통과율 — 떨어지면 실제 저하">객관 ▼{Math.abs(Math.round(info.objDrop ?? 0))}</span>}
                  <span className={`c2-status ${st.cls}`}><span className="c2-sdot" />{st.label}</span>
                </span>
              </div>

              <div className="c2-hero">
                {info.status === 'incomplete' ? (
                  <><div className="c2-num is-muted">—</div><div className="c2-state">측정 실패 · 직전 정상값</div></>
                ) : !info.enough || info.condIndex == null ? (
                  <><div className="c2-num is-muted">{info.n}<span className="c2-of">/{need}</span></div><div className="c2-state">평소 범위 잡는 중</div></>
                ) : (
                  <>
                    <div className="c2-num" title={info.med != null ? `평소 ${Math.round(info.med)}점 · 범위 ${info.lo}~${info.hi} (절대)` : undefined}>{info.condIndex}</div>
                    <div className="c2-state">컨디션 · {info.belowBand ? '평소보다 낮은 편' : '평소 수준'}</div>
                  </>
                )}
              </div>

              <div className="c2-spark"><Sparkline values={series} color={color} baseline={info.med} /></div>

              <DimensionBars bars={dimsOf(m, e)} color={color} />
            </div>
          );
        })}
      </div>

      <div className="legend-line">
        성능 순위가 아니라 <b>컨디션</b> — 각 모델의 관측 최저=0·최고=100으로 본 지금 위치 · 모델끼리 비교 X · 자세한 설명은 <b>자세히</b>
      </div>

      {details && latest && (
        <div className="modal-overlay" onClick={() => setDetails(false)}>
          <div className="modal" onClick={(ev) => ev.stopPropagation()}>
            <div className="modal-head">
              <h2>차원별 난이도 돌파 · 답안 (최근 측정)</h2>
              <button className="ghost-btn" onClick={() => setDetails(false)}>닫기 ✕</button>
            </div>
            <div className="explain">
              <div className="ex-item"><b>이 사이트가 재는 것 = 컨디션</b> — "어느 모델이 더 똑똑한가"(성능 순위)가 <b>아니라</b>, 각 모델이 <b>평소의 자기 자신 대비</b> 지금 잘하고 있는지를 봅니다. 그래서 카드의 큰 숫자는 절대 실력이 아니라 <b>컨디션</b>입니다.</div>
              <div className="ex-item"><b>컨디션 (자기 범위 기준)</b> — 그 모델이 관측된 <b>가장 낮을 때=0, 가장 높을 때=100</b>으로 범위를 펴서 지금 위치를 봅니다(절대 점수는 늘 맞히는 문제에 가려 둔감하므로). 이 변동은 <b>노이즈가 아니라 그 모델의 실시간 컨디션</b>입니다 — 게이지 <b>초록 띠=평소 범위</b> 안에서도 위/아래가 지금 상태를 그대로 보여줍니다. 띠 아래로 벗어나면(2σ↓ 주의·3σ↓ 멍청해짐) 저하 경보. 단, <b>측정 1회엔 정밀도 한계</b>가 있어 한 번 낮은 게 곧 저하인지는 <b>지속 하락</b>으로 확정합니다. <b>모델끼리 비교는 의미 없습니다</b>(각자 자기 기준).</div>
              <div className="ex-item"><b>측정 방식 + 🛡 객관 건강도</b> — 매번 새로 생성한 문제(암기 불가)를 6차원·난이도별로 풀려, 정답은 코드가 계산하고 추론 품질은 Opus 심사위원이 0~100 채점. 🛡객관 = 정답 사다리 통과율(코드 채점이라 가장 정직한 저하 신호). 막대=오늘 차원별 측정, 아래는 가장 어려운 단계 문제·답안(L2·L4·L6).</div>
            </div>
            <QuestionTable latest={latest} models={shown} />
          </div>
        </div>
      )}
    </div>
  );
}
