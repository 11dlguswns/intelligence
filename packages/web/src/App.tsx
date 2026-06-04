import { useEffect, useState } from 'react';
import type { History, RunDetail, Meta, Baselines, Status, HistoryModelEntry } from './types';
import { loadJson } from './lib/data';
import { modelColor, modelLabel } from './lib/model';
import { shortDate } from './lib/format';
import { currentPeak } from './lib/peak';
import { TrendChart } from './components/TrendChart';
import { CapabilityRadar } from './components/CapabilityRadar';
import { FamilyTable } from './components/FamilyTable';

const STATUS: Record<Status, { label: string; cls: string; icon: string }> = {
  normal: { label: '정상', cls: 'st-normal', icon: '●' },
  warn: { label: '주의', cls: 'st-warn', icon: '▲' },
  degraded: { label: '저하', cls: 'st-degraded', icon: '▼' },
  above: { label: '빠름', cls: 'st-above', icon: '▼' },
  baselining: { label: '형성중', cls: 'st-base', icon: '…' },
};
const RANK: Record<Status, number> = { degraded: 3, warn: 2, baselining: 1, normal: 0, above: 0 };
const n = (x: number | null | undefined) => (x == null ? '–' : x.toLocaleString());

// plain-language one-liner per model
function explain(e: HistoryModelEntry, baselineRuns: number): string {
  if (!e.baseline.locked) return `기준선 형성중 (${e.baseline.n}/${baselineRuns}) — 비교 기준을 만드는 중입니다.`;
  const ratio = e.condition.latencyRatio ?? 1;
  const pct = Math.round((ratio - 1) * 100);
  const accDrop = e.condition.accDelta != null && e.condition.accDelta <= -0.07;
  if (e.condition.status === 'degraded') {
    if (accDrop) return `정확도가 기준보다 ${Math.abs(Math.round((e.condition.accDelta ?? 0) * 100))}%p 낮습니다 → 능력 저하 의심.`;
    return `응답이 평소보다 ${pct}% 느립니다 → 과부하·스로틀링 의심.`;
  }
  if (e.condition.status === 'warn') return `평소보다 ${pct}% 느립니다 → 주의해서 관찰하세요.`;
  if (e.condition.status === 'above') return `평소보다 ${Math.abs(pct)}% 빠릅니다 → 정상. 멍청해진 신호 없음.`;
  return `평소 수준입니다 → 정상. 멍청해진 신호 없음.`;
}

export default function App() {
  const [history, setHistory] = useState<History | null>(null);
  const [latest, setLatest] = useState<RunDetail | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [baselines, setBaselines] = useState<Baselines | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState(false);

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
  const families = history.families ?? [];
  const shown = selected.length ? selected : allModels;
  const baselineRuns = baselines?.baselineRuns ?? meta?.baselineRuns ?? 4;
  const peak = currentPeak();

  const toggle = (m: string) =>
    setSelected((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));

  const entries = shown.map((m) => ({ m, e: lastRun?.byModel[m] })).filter((x) => x.e) as {
    m: string;
    e: HistoryModelEntry;
  }[];
  let worst: Status = 'normal';
  for (const { e } of entries) if (RANK[e.condition.status] > RANK[worst]) worst = e.condition.status;
  const headline =
    worst === 'degraded'
      ? { text: '저하 감지 — 멍청해졌을 수 있음', cls: 'st-degraded', icon: '🔴' }
      : worst === 'warn'
        ? { text: '주의 — 평소보다 느림/불안정', cls: 'st-warn', icon: '🟡' }
        : worst === 'baselining'
          ? { text: '기준선 형성중', cls: 'st-base', icon: '⚪' }
          : { text: '정상 — 멍청해진 신호 없음', cls: 'st-normal', icon: '🟢' };

  return (
    <div className="app board">
      <header className="bar">
        <div className="brand-min">
          <div className="logo sm" aria-hidden />
          <b>지금 Claude는 멍청한가?</b>
          <span className="sub">각 모델을 자기 평소 상태와 비교</span>
        </div>
        <div className="bar-right">
          <span className={`peak-badge ${peak.peak ? 'on' : ''}`} title="Anthropic 과거 피크창: 평일 5–11 AM PT (토큰을 더 빨리 소모). Pro/Max는 2026-05-06 해제됨.">
            {peak.peak ? '🟠 피크창' : '🟢 평상시'} · {peak.clock}
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
          <button className="ghost-btn" onClick={() => setDetails((d) => !d)}>{details ? '그래프 숨기기 ▲' : '그래프·상세 ▾'}</button>
        </div>
      </header>

      {/* headline verdict */}
      <div className={`headline ${headline.cls}`}>
        <span className="hl-icon">{headline.icon}</span>
        <span className="hl-text">{headline.text}</span>
        <span className="hl-meta">effort {meta?.effort} · 트립와이어 L{meta?.level} · {history.runs.length}회 측정 · {history.updatedAt ? shortDate(history.updatedAt) : ''}</span>
      </div>

      {/* per-model: numbers + one-line explanation */}
      <div className="mcards">
        {entries.map(({ m, e }, i) => {
          const st = STATUS[e.condition.status] ?? STATUS.baselining;
          const ratio = e.condition.latencyRatio;
          const pct = ratio != null ? Math.round((ratio - 1) * 100) : null;
          return (
            <div className={`mcard ${st.cls}`} key={m}>
              <div className="mc-top">
                <span className="vc-model" style={{ color: modelColor(m, i) }}>
                  <span className="dot" style={{ background: modelColor(m, i) }} />
                  {modelLabel(m)}
                </span>
                <span className={`status-badge ${st.cls}`}>{st.icon} {st.label}</span>
              </div>

              <div className="mc-rows">
                <div className="mc-row primary">
                  <span className="mc-label">응답 지연</span>
                  <span className="mc-val"><b>{n(e.avgTtftMs)}</b> ms</span>
                  <span className={`mc-delta ${pct == null ? 'muted' : pct > 5 ? 'neg' : pct < -5 ? 'pos' : ''}`}>
                    {pct == null ? `${e.baseline.n}/${baselineRuns}` : pct > 0 ? `▲${pct}% 느림` : pct < 0 ? `▼${Math.abs(pct)}% 빠름` : '≈ 평소'}
                  </span>
                </div>
                <div className="mc-row">
                  <span className="mc-label">평소 기준</span>
                  <span className="mc-val sub">{n(e.baseline.ttftMean)} ms</span>
                </div>
                <div className="mc-row">
                  <span className="mc-label">정확도 <i>트립와이어</i></span>
                  <span className={`mc-val ${e.passRate >= 0.999 ? 'ok-acc' : 'bad-acc'}`}>{Math.round(e.passRate * 100)}%</span>
                  <span className="mc-delta muted">기준 {e.baseline.passMean != null ? Math.round(e.baseline.passMean * 100) + '%' : '–'}</span>
                </div>
                <div className="mc-row">
                  <span className="mc-label">자기일관성</span>
                  <span className="mc-val sub">{Math.round(e.consistency * 100)}%</span>
                </div>
              </div>

              <div className="mc-verdict">→ {explain(e, baselineRuns)}</div>
            </div>
          );
        })}
      </div>

      {/* plain-language explanation of the numbers */}
      <div className="explain">
        <div className="ex-item"><b>응답 지연(TTFT)</b> — 가장 중요. 평소보다 크게 <span className="neg">느려지면</span> 서버 과부하·자원 축소(스로틀링) 신호.</div>
        <div className="ex-item"><b>정확도(트립와이어)</b> — 객관 문제 정답률. 프런티어 모델은 평소 거의 100%라, <span className="neg">떨어지면</span> 진짜 능력 저하 경보.</div>
        <div className="ex-item"><b>자기일관성</b> — 같은 문제에 같은 답을 내는 비율. 하락은 샘플링/양자화 신호.</div>
        <div className="ex-item"><b>피크창</b> — 평일 5–11 AM PT(과거 토큰을 더 빨리 먹던 시간대). Pro/Max는 2026-05-06 해제. 지금 <b>{peak.peak ? '피크창' : '평상시'}</b>.</div>
        <div className="ex-foot">모델끼리 비교가 아니라 <b>각 모델을 자기 기준선과 비교</b>합니다. 매 측정마다 새 문제를 생성해 캐시·암기를 무력화하고, 구독 계정으로 <code>claude -p</code>·도구 OFF·effort 고정으로 잽니다. 비공식 측정.</div>
      </div>

      {/* details: graphs + drill-down (hidden by default) */}
      {details && (
        <div className="details-extra">
          <div className="panels">
            <section className="card panel">
              <div className="card-head"><h2>응답 지연 추이 <span className="legend">◎ 피크창</span></h2><p>점선 = 자기 기준선</p></div>
              <div className="chartwrap"><TrendChart history={history} models={shown} get={(e) => e.avgTtftMs} unit="ms" refLines={shown.map((m, i) => { const bm = baselines?.models[m]; return bm?.locked && bm.ttftMs.mean != null ? { y: bm.ttftMs.mean, label: '', color: modelColor(m, i) } : null; }).filter(Boolean) as { y: number; label: string; color: string }[]} markPeak /></div>
            </section>
            <section className="card panel">
              <div className="card-head"><h2>정확도 트립와이어</h2><p>평상시 100% — 떨어지면 경보</p></div>
              <div className="chartwrap"><TrendChart history={history} models={shown} get={(e) => Math.round(e.passRate * 100)} domain={[0, 100]} unit="%" markPeak /></div>
            </section>
            <section className="card panel">
              <div className="card-head"><h2>자기일관성</h2><p>하락 = 샘플링/양자화 신호</p></div>
              <div className="chartwrap"><TrendChart history={history} models={shown} get={(e) => Math.round(e.consistency * 100)} domain={[0, 100]} unit="%" markPeak /></div>
            </section>
          </div>
          <div className="grid-2">
            <section className="card">
              <div className="card-head"><h2>문제군별 정확도 (최근)</h2><p>어느 유형에서 먼저 깨지는지</p></div>
              {lastRun && <CapabilityRadar run={lastRun} models={shown} families={families} />}
            </section>
            <section className="card">
              <div className="card-head"><h2>출력 토큰 (장황함)</h2><p>응답당 평균 output tokens</p></div>
              <div style={{ position: 'relative', height: 240 }}><TrendChart history={history} models={shown} get={(e) => e.avgOutputTokens} unit="" markPeak /></div>
            </section>
          </div>
          {latest && (
            <section className="card">
              <div className="card-head"><h2>문제군 상세 (최근 런)</h2><p>행을 클릭하면 실제 생성된 문제·정답·모델 답안 · level <b>{latest.level}</b> · effort <b>{latest.effort}</b> · 문제 {latest.instances}개 × {latest.reps}회</p></div>
              <FamilyTable latest={latest} models={shown} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
