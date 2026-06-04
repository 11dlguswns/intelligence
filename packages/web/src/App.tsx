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

  // headline verdict = worst status across shown models
  const entries = shown.map((m) => ({ m, e: lastRun?.byModel[m] })).filter((x) => x.e) as {
    m: string;
    e: HistoryModelEntry;
  }[];
  let worst: Status = 'normal';
  for (const { e } of entries) if (RANK[e.condition.status] > RANK[worst]) worst = e.condition.status;
  const offenders = entries.filter((x) => x.e.condition.status === worst && (worst === 'degraded' || worst === 'warn'));
  const headline =
    worst === 'degraded'
      ? { text: '저하 감지 — 멍청해졌을 수 있음', cls: 'st-degraded', icon: '🔴' }
      : worst === 'warn'
        ? { text: '주의 — 평소보다 느림/불안정', cls: 'st-warn', icon: '🟡' }
        : worst === 'baselining'
          ? { text: '기준선 형성중', cls: 'st-base', icon: '⚪' }
          : { text: '정상 — 멍청해진 신호 없음', cls: 'st-normal', icon: '🟢' };

  const ttftRefs = shown
    .map((m, i) => {
      const bm = baselines?.models[m];
      if (!bm?.locked || bm.ttftMs.mean == null) return null;
      return { y: bm.ttftMs.mean, label: '', color: modelColor(m, i) };
    })
    .filter(Boolean) as { y: number; label: string; color: string }[];

  return (
    <div className={`app board ${details ? '' : 'compact'}`}>
      {/* row 1: compact masthead */}
      <header className="bar">
        <div className="brand-min">
          <div className="logo sm" aria-hidden />
          <b>지금 Claude는 멍청한가?</b>
          <span className="sub">컨디션 모니터 · 자기 기준선 대비</span>
        </div>
        <div className="bar-right">
          <span className={`peak-badge ${peak.peak ? 'on' : ''}`} title="Anthropic 과거 피크창: 평일 5–11 AM PT. Pro/Max는 2026-05-06 해제됨.">
            {peak.peak ? '🟠 피크창' : '🟢 평상시'} · {peak.clock}
          </span>
          <div className="chips inline">
            {allModels.map((m, i) => {
              const on = shown.includes(m);
              return (
                <button
                  key={m}
                  className={`chip ${on ? 'on' : ''}`}
                  style={on ? { borderColor: modelColor(m, i), color: modelColor(m, i) } : undefined}
                  onClick={() => toggle(m)}
                >
                  <span className="dot" style={{ background: modelColor(m, i) }} />
                  {modelLabel(m)}
                </button>
              );
            })}
          </div>
          <button className="ghost-btn" onClick={() => setDetails((d) => !d)}>
            {details ? '간단히 ▲' : '상세 ▾'}
          </button>
        </div>
      </header>

      {/* row 2: headline verdict */}
      <div className={`headline ${headline.cls}`}>
        <span className="hl-icon">{headline.icon}</span>
        <span className="hl-text">{headline.text}</span>
        {offenders.length > 0 && (
          <span className="hl-who">
            {offenders.map((o) => modelLabel(o.m)).join(', ')}
            {worst === 'degraded' || worst === 'warn'
              ? ` · 지연 ×${offenders[0].e.condition.latencyRatio ?? '–'}`
              : ''}
          </span>
        )}
        <span className="hl-meta">
          effort {meta?.effort} · 트립와이어 L{meta?.level} · {history.runs.length} runs · {history.updatedAt ? shortDate(history.updatedAt) : ''}
        </span>
      </div>

      {/* row 3: per-model verdict cards */}
      <div className="verdicts">
        {entries.map(({ m, e }, i) => {
          const st = STATUS[e.condition.status] ?? STATUS.baselining;
          const ratio = e.condition.latencyRatio;
          return (
            <div className={`vcard ${st.cls}`} key={m}>
              <div className="vc-top">
                <span className="vc-model" style={{ color: modelColor(m, i) }}>
                  <span className="dot" style={{ background: modelColor(m, i) }} />
                  {modelLabel(m)}
                </span>
                <span className={`status-badge ${st.cls}`}>{st.icon} {st.label}</span>
              </div>
              <div className="vc-main">
                <span className="vc-ttft">{e.avgTtftMs ?? '–'}<small>ms</small></span>
                {e.baseline.locked && ratio != null ? (
                  <span className={`vc-ratio ${ratio > 1.05 ? 'neg' : ratio < 0.95 ? 'pos' : ''}`}>×{ratio}</span>
                ) : (
                  <span className="vc-ratio muted">{e.baseline.n}/{baselineRuns}</span>
                )}
              </div>
              <div className="vc-sub">
                <span>기준 {e.baseline.ttftMean ?? '–'}ms</span>
                <span className={e.passRate >= 0.999 ? 'ok-acc' : 'bad-acc'}>정확도 {Math.round(e.passRate * 100)}%</span>
                <span>일관성 {Math.round(e.consistency * 100)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* row 4: panels fill remaining height */}
      <div className="panels">
        <section className="card panel">
          <div className="card-head">
            <h2>응답 지연 (TTFT) <span className="legend">◎ 피크창 측정</span></h2>
            <p>점선 = 자기 기준선. 위로 벗어나면 과부하·스로틀링</p>
          </div>
          <div className="chartwrap">
            <TrendChart history={history} models={shown} get={(e) => e.avgTtftMs} unit="ms" refLines={ttftRefs} markPeak />
          </div>
        </section>
        <section className="card panel">
          <div className="card-head">
            <h2>정확도 트립와이어</h2>
            <p>평상시 100% — 떨어지면 진짜 능력 저하 경보</p>
          </div>
          <div className="chartwrap">
            <TrendChart history={history} models={shown} get={(e) => Math.round(e.passRate * 100)} domain={[0, 100]} unit="%" markPeak />
          </div>
        </section>
        <section className="card panel">
          <div className="card-head">
            <h2>자기일관성</h2>
            <p>하락은 샘플링/양자화 신호</p>
          </div>
          <div className="chartwrap">
            <TrendChart history={history} models={shown} get={(e) => Math.round(e.consistency * 100)} domain={[0, 100]} unit="%" markPeak />
          </div>
        </section>
      </div>

      {/* details (revealed; allows scroll) */}
      {details && (
        <div className="details-extra">
          <div className="grid-2">
            <section className="card">
              <div className="card-head">
                <h2>출력 토큰 (장황함)</h2>
                <p>응답당 평균 output tokens</p>
              </div>
              <div style={{ height: 240 }}>
                <TrendChart history={history} models={shown} get={(e) => e.avgOutputTokens} unit="" markPeak />
              </div>
            </section>
            <section className="card">
              <div className="card-head">
                <h2>문제군별 정확도 (최근)</h2>
                <p>어느 유형에서 먼저 깨지는지</p>
              </div>
              {lastRun && <CapabilityRadar run={lastRun} models={shown} families={families} />}
            </section>
          </div>
          {latest && (
            <section className="card">
              <div className="card-head">
                <h2>문제군 상세 (최근 런)</h2>
                <p>행을 클릭하면 실제 생성된 문제·정답·모델 답안 · level <b>{latest.level}</b> · effort <b>{latest.effort}</b> · 문제 {latest.instances}개 × {latest.reps}회</p>
              </div>
              <FamilyTable latest={latest} models={shown} />
            </section>
          )}
          <p className="method-line">
            방법: 프런티어 모델은 객관 과제에서 effort를 낮춰도 거의 항상 정답이라 <b>정확도는 천장</b> → 고정 난이도 L{meta?.level} <b>트립와이어</b>로 유지. 평상시 컨디션은 <b>응답 지연(TTFT)</b>을 자기 <b>고정 기준선</b>과 비교 — 과부하·스로틀링의 직접 신호. 피크창(평일 5–11 AM PT, ◎)은 Pro/Max는 2026-05-06 해제됐지만 지연 상관을 보기 위해 표시. 구독 계정 <code>claude -p</code>, 도구 OFF·최소 프롬프트·effort 고정. Anthropic과 무관한 비공식 측정.
          </p>
        </div>
      )}
    </div>
  );
}
