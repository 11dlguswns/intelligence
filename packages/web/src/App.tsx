import { useEffect, useState } from 'react';
import type { History, RunDetail, Meta, Baselines, Status, HistoryModelEntry } from './types';
import { loadJson } from './lib/data';
import { modelColor, modelLabel } from './lib/model';
import { shortDate } from './lib/format';
import { currentPeak } from './lib/peak';
import { TrendChart } from './components/TrendChart';
import { CapabilityRadar } from './components/CapabilityRadar';
import { FamilyTable } from './components/FamilyTable';

const EMOJI: Record<Status, string> = { normal: '🟢', above: '🟢', warn: '🟡', degraded: '🔴', baselining: '⚪' };
const WORD: Record<Status, string> = { normal: '정상', above: '정상', warn: '주의', degraded: '저하', baselining: '측정중' };
const CLS: Record<Status, string> = { normal: 'st-normal', above: 'st-normal', warn: 'st-warn', degraded: 'st-degraded', baselining: 'st-base' };
const RANK: Record<Status, number> = { degraded: 3, warn: 2, baselining: 1, normal: 0, above: 0 };
const num = (x: number | null | undefined) => (x == null ? '–' : x.toLocaleString());

// short plain phrase for a model
function phrase(e: HistoryModelEntry, baselineRuns: number): string {
  if (!e.baseline.locked) return `기준 만드는 중 (${e.baseline.n}/${baselineRuns})`;
  const ratio = e.condition.latencyRatio ?? 1;
  const pct = Math.round((ratio - 1) * 100);
  const accDrop = e.condition.accDelta != null && e.condition.accDelta <= -0.07;
  if (e.condition.status === 'degraded') return accDrop ? '정확도가 평소보다 떨어짐 ⚠' : `평소보다 ${pct}% 느림 ⚠`;
  if (e.condition.status === 'warn') return `평소보다 ${pct}% 느림`;
  if (e.condition.status === 'above') return `평소보다 ${Math.abs(pct)}% 빠름`;
  return '평소와 비슷';
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
  const bad = entries.filter((x) => RANK[x.e.condition.status] >= 2).map((x) => modelLabel(x.m));
  const answer =
    worst === 'degraded'
      ? { icon: '🔴', q: '네 — 평소보다 떨어졌어요', sub: `${bad.join(', ')}에서 저하 신호`, cls: 'st-degraded' }
      : worst === 'warn'
        ? { icon: '🟡', q: '약간 — 평소보다 느려요', sub: `${bad.join(', ')} 관찰 필요`, cls: 'st-warn' }
        : worst === 'baselining'
          ? { icon: '⚪', q: '측정 기준을 만드는 중', sub: '몇 번 더 측정하면 판정 시작', cls: 'st-base' }
          : { icon: '🟢', q: '아니요 — 정상이에요', sub: '모든 모델이 평소 수준 · 멍청해진 신호 없음', cls: 'st-normal' };

  return (
    <div className="app board simple">
      <header className="bar">
        <div className="brand-min">
          <div className="logo sm" aria-hidden />
          <b>지금 Claude는 멍청한가?</b>
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
          <button className="ghost-btn" onClick={() => setDetails((d) => !d)}>{details ? '닫기 ▲' : '자세히 ▾'}</button>
        </div>
      </header>

      {/* the big answer */}
      <div className={`answer ${answer.cls}`}>
        <span className="ans-icon">{answer.icon}</span>
        <div className="ans-text">
          <div className="ans-q">{answer.q}</div>
          <div className="ans-sub">{answer.sub}</div>
        </div>
        <div className="ans-meta">
          마지막 측정 {history.updatedAt ? shortDate(history.updatedAt) : ''}<br />
          {peak.peak ? '피크창' : '평상시'} · {history.runs.length}회
        </div>
      </div>

      {/* per-model traffic lights */}
      <div className="lights">
        {entries.map(({ m, e }, i) => {
          const st = e.condition.status;
          return (
            <div className={`light ${CLS[st]}`} key={m}>
              <div className="lt-emoji">{EMOJI[st]}</div>
              <div className="lt-model" style={{ color: modelColor(m, i) }}>{modelLabel(m)}</div>
              <div className={`lt-word ${CLS[st]}`}>{WORD[st]}</div>
              <div className="lt-phrase">{phrase(e, baselineRuns)}</div>
              <div className="lt-num">{num(e.avgTtftMs)} ms · 정확도 {Math.round(e.passRate * 100)}%</div>
            </div>
          );
        })}
      </div>

      <div className="legend-line">
        🟢 정상 · 🟡 평소보다 느림(주의) · 🔴 저하(과부하·자원 축소 또는 능력 저하) — 각 모델을 <b>자기 평소 기준선</b>과 비교
      </div>

      {/* details */}
      {details && (
        <div className="details-extra">
          <div className="explain">
            <div className="ex-item"><b>응답 지연(TTFT)</b> — 가장 중요. 평소보다 크게 <span className="neg">느려지면</span> 서버 과부하·자원 축소(스로틀링).</div>
            <div className="ex-item"><b>정확도(트립와이어)</b> — 평소 거의 100%. <span className="neg">떨어지면</span> 진짜 능력 저하 경보.</div>
            <div className="ex-item"><b>자기일관성</b> — 같은 문제에 같은 답을 내는 비율. 하락 = 샘플링/양자화 신호.</div>
            <div className="ex-item"><b>피크창</b> — 평일 5–11 AM PT. Pro/Max는 2026-05-06 해제. 지금 <b>{peak.peak ? '피크창' : '평상시'}</b>.</div>
            <div className="ex-foot">매 측정마다 새 문제를 생성해 캐시·암기를 무력화하고, 구독 계정으로 <code>claude -p</code>·도구 OFF·effort 고정으로 잽니다. 비공식 측정.</div>
          </div>
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
        </div>
      )}
    </div>
  );
}
