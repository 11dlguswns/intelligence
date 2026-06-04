import { useEffect, useState } from 'react';
import type { History, RunDetail, Meta, Baselines, Status, HistoryModelEntry } from './types';
import { loadJson } from './lib/data';
import { modelColor, modelLabel } from './lib/model';
import { shortDate } from './lib/format';
import { currentPeak, isPeak } from './lib/peak';
import { TrendChart } from './components/TrendChart';
import { CapabilityRadar } from './components/CapabilityRadar';
import { FamilyTable } from './components/FamilyTable';

const STATUS: Record<Status, { label: string; cls: string; icon: string }> = {
  normal: { label: '정상', cls: 'st-normal', icon: '🟢' },
  above: { label: '정상', cls: 'st-normal', icon: '🟢' },
  warn: { label: '주의', cls: 'st-warn', icon: '🟡' },
  degraded: { label: '저하', cls: 'st-degraded', icon: '🔴' },
  baselining: { label: '측정중', cls: 'st-base', icon: '⚪' },
};
const RANK: Record<Status, number> = { degraded: 3, warn: 2, baselining: 1, normal: 0, above: 0 };
const num = (x: number | null | undefined) => (x == null ? '–' : x.toLocaleString());

function phrase(e: HistoryModelEntry, baselineRuns: number): string {
  if (!e.baseline.locked) return `기준선 형성중 (${e.baseline.n}/${baselineRuns}) — 비교 기준을 만드는 중.`;
  const ratio = e.condition.latencyRatio ?? 1;
  const pct = Math.round((ratio - 1) * 100);
  const accDrop = e.condition.accDelta != null && e.condition.accDelta <= -0.07;
  if (e.condition.status === 'degraded') return accDrop ? '정확도가 기준보다 하락 → 능력 저하 의심.' : `평소보다 ${pct}% 느림 → 과부하·스로틀링 의심.`;
  if (e.condition.status === 'warn') return `평소보다 ${pct}% 느림 → 주의 관찰.`;
  if (e.condition.status === 'above') return `평소보다 ${Math.abs(pct)}% 빠름 → 정상.`;
  return '평소 수준 → 정상.';
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
  const recentRuns = history.runs.slice(-7);

  const toggle = (m: string) =>
    setSelected((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));

  const entries = shown.map((m) => ({ m, e: lastRun?.byModel[m] })).filter((x) => x.e) as {
    m: string;
    e: HistoryModelEntry;
  }[];
  let worst: Status = 'normal';
  for (const { e } of entries) if (RANK[e.condition.status] > RANK[worst]) worst = e.condition.status;
  const vchip = STATUS[worst];

  return (
    <div className="app board simple">
      <header className="bar">
        <div className="brand-min">
          <div className="logo sm" aria-hidden />
          <b>지금 Claude는 멍청한가?</b>
          <span className={`vchip ${vchip.cls}`}>{vchip.icon} {worst === 'degraded' ? '저하 감지' : worst === 'warn' ? '주의' : worst === 'baselining' ? '측정중' : '정상'}</span>
        </div>
        <div className="bar-right">
          <span className={`peak-badge ${peak.peak ? 'on' : ''}`} title="과거 피크창: 평일 5–11 AM PT(토큰을 더 빨리 소모). Pro/Max는 2026-05-06 해제됨.">
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
          <button className="ghost-btn" onClick={() => setDetails((d) => !d)}>{details ? '닫기 ▲' : '그래프·상세 ▾'}</button>
        </div>
      </header>

      <div className={`stage ${details ? '' : 'centered'}`}>
        <div className="mcards">
          {entries.map(({ m, e }, i) => {
            const st = STATUS[e.condition.status] ?? STATUS.baselining;
            const ratio = e.condition.latencyRatio;
            const pct = ratio != null ? Math.round((ratio - 1) * 100) : null;
            const recent = recentRuns.map((r) => ({ v: r.byModel[m]?.avgTtftMs ?? null, peak: isPeak(r.startedAt) }));
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
                    <span className="mc-val"><b>{num(e.avgTtftMs)}</b> ms</span>
                    <span className={`mc-delta ${pct == null ? 'muted' : pct > 5 ? 'neg' : pct < -5 ? 'pos' : ''}`}>
                      {pct == null ? `${e.baseline.n}/${baselineRuns}` : pct > 0 ? `▲${pct}% 느림` : pct < 0 ? `▼${Math.abs(pct)}% 빠름` : '≈ 평소'}
                    </span>
                  </div>
                  <div className="mc-row"><span className="mc-label">평소 기준</span><span className="mc-val sub">{num(e.baseline.ttftMean)} ms <i>±{num(baselines?.models[m]?.ttftMs?.std)}</i></span></div>
                  <div className="mc-row"><span className="mc-label">중앙값 / 최저</span><span className="mc-val sub">{num(e.medianTtftMs)} ms</span></div>
                  <div className="mc-row"><span className="mc-label">정확도 <i>트립와이어</i></span><span className={`mc-val ${e.passRate >= 0.999 ? 'ok-acc' : 'bad-acc'}`}>{Math.round(e.passRate * 100)}%</span><span className="mc-delta muted">기준 {e.baseline.passMean != null ? Math.round(e.baseline.passMean * 100) + '%' : '–'}</span></div>
                  <div className="mc-row"><span className="mc-label">자기일관성</span><span className="mc-val sub">{Math.round(e.consistency * 100)}%</span></div>
                  <div className="mc-row"><span className="mc-label">출력 토큰</span><span className="mc-val sub">{num(e.avgOutputTokens)} tok</span></div>
                </div>

                <div className="mc-recent">
                  <span className="mcr-label">최근 지연(ms)</span>
                  <span className="mcr-vals">
                    {recent.map((r, idx) => (
                      <span key={idx} className={`mcr-v ${r.peak ? 'peak' : ''} ${idx === recent.length - 1 ? 'last' : ''}`} title={r.peak ? '피크창 측정' : ''}>{r.v == null ? '–' : r.v.toLocaleString()}</span>
                    ))}
                  </span>
                </div>

                <div className="mc-verdict">→ {phrase(e, baselineRuns)}</div>
              </div>
            );
          })}
        </div>

        <div className="explain">
          <div className="ex-item"><b>응답 지연(TTFT)</b> — 가장 중요. 평소보다 크게 <span className="neg">느려지면</span> 서버 과부하·자원 축소(스로틀링).</div>
          <div className="ex-item"><b>정확도(트립와이어)</b> — 객관 문제 정답률. 평소 거의 100%, <span className="neg">떨어지면</span> 진짜 능력 저하 경보.</div>
          <div className="ex-item"><b>최근 지연</b> — 마지막 7회 측정값. <span className="mcr-v peak inline">주황</span> = 피크창(평일 5–11 AM PT). 값이 점점 커지면 느려지는 중.</div>
          <div className="ex-item"><b>자기일관성·출력토큰</b> — 같은 답 비율/장황함. 변화는 샘플링·양자화·동작 변경 신호.</div>
          <div className="ex-foot">모델끼리 비교가 아니라 <b>각 모델을 자기 기준선과 비교</b>. 매 측정마다 새 문제 생성(캐시·암기 무력화), 구독 계정 <code>claude -p</code>·도구 OFF·effort 고정. 비공식 측정 · 마지막 {history.updatedAt ? shortDate(history.updatedAt) : ''} · {history.runs.length}회.</div>
        </div>
      </div>

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
              <div className="card-head"><h2>자기일관성</h2><p>하락 = 샘플링/양자화</p></div>
              <div className="chartwrap"><TrendChart history={history} models={shown} get={(e) => Math.round(e.consistency * 100)} domain={[0, 100]} unit="%" markPeak /></div>
            </section>
          </div>
          {latest && (
            <section className="card">
              <div className="card-head"><h2>문제군 상세 (최근 런)</h2><p>행을 클릭하면 실제 문제·정답·모델 답안 · level <b>{latest.level}</b> · effort <b>{latest.effort}</b></p></div>
              <FamilyTable latest={latest} models={shown} />
            </section>
          )}
          <section className="card">
            <div className="card-head"><h2>문제군별 정확도 (최근)</h2><p>어느 유형에서 먼저 깨지는지</p></div>
            {lastRun && <CapabilityRadar run={lastRun} models={shown} families={families} />}
          </section>
        </div>
      )}
    </div>
  );
}
