import { useEffect, useState } from 'react';
import type { History, RunDetail, Meta, Baselines, Status, HistoryModelEntry } from './types';
import { loadJson } from './lib/data';
import { modelColor, modelLabel } from './lib/model';
import { currentPeak } from './lib/peak';
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
const secs = (ms: number | null | undefined) => (ms == null ? '–' : (ms / 1000).toFixed(1));

function ago(updatedAt: string | null | undefined, nowTs: number): string {
  if (!updatedAt) return '—';
  const d = Math.max(0, Math.floor((nowTs - new Date(updatedAt).getTime()) / 1000));
  if (d < 60) return `${d}초 전`;
  if (d < 3600) return `${Math.floor(d / 60)}분 전`;
  if (d < 86400) return `${Math.floor(d / 3600)}시간 전`;
  return `${Math.floor(d / 86400)}일 전`;
}

function phrase(e: HistoryModelEntry, pct: number | null): string {
  if (!e.baseline.locked) return '기준 만드는 중';
  const accDrop = e.condition.accDelta != null && e.condition.accDelta <= -0.07;
  if (e.condition.status === 'degraded') return accDrop ? '정답이 평소보다 틀려짐' : `평소보다 ${pct}% 느림`;
  if (e.condition.status === 'warn') return `평소보다 ${pct}% 느림`;
  if (e.condition.status === 'above') return `평소보다 ${Math.abs(pct ?? 0)}% 빠름`;
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

  // live clock — the always-changing element (proves the page is alive)
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // auto-refresh — pick up newly published measurements without a manual reload
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
  const families = history.families ?? [];
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
  let worst: Status = 'normal';
  for (const { e } of entries) if (RANK[e.condition.status] > RANK[worst]) worst = e.condition.status;
  const vchip = STATUS[worst];

  return (
    <div className="app board simple">
      <header className="bar">
        <div className="brand-min">
          <div className="logo sm" aria-hidden />
          <b>지금 Claude는 멍청한가?</b>
          <span className={`vchip ${vchip.cls}`}>{vchip.icon} {worst === 'degraded' ? '저하' : worst === 'warn' ? '주의' : worst === 'baselining' ? '측정중' : '정상'}</span>
        </div>
        <div className="bar-right">
          <span className="live" title="페이지는 25초마다 자동 새로고침되어 새 측정을 가져옵니다.">
            <span className="live-dot" />LIVE · 측정 {ago(history.updatedAt, nowTs)}
          </span>
          <span className={`peak-badge ${peak.peak ? 'on' : ''}`} title="과거 피크창: 평일 5–11 AM PT(붐비는 시간). Pro/Max는 2026-05-06 해제됨.">
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
            const st = STATUS[e.condition.status] ?? STATUS.baselining;
            const ratio = e.condition.latencyRatio;
            const pct = ratio != null ? Math.round((ratio - 1) * 100) : null;
            return (
              <div className={`scard ${st.cls}`} key={m}>
                <div className="sc-emoji">{st.icon}</div>
                <div className="sc-model" style={{ color: modelColor(m, i) }}>{modelLabel(m)}</div>
                <div className={`sc-word ${st.cls}`}>{st.label}</div>
                <div className="sc-phrase">{phrase(e, pct)}</div>
                <div className="sc-nums">
                  <div className="sc-num">
                    <span className="sc-n">{secs(e.avgTtftMs)}</span><span className="sc-u">초</span>
                    <span className="sc-base">응답속도 · 평소 {secs(e.baseline.ttftMean)}초</span>
                  </div>
                  <div className="sc-num">
                    <span className="sc-n">{Math.round(e.passRate * 100)}</span><span className="sc-u">%</span>
                    <span className="sc-base">정답률</span>
                  </div>
                </div>
                <div className="sc-when">측정 {ago(at, nowTs)}</div>
              </div>
            );
          })}
        </div>
        <div className="legend-line">🟢 정상 · 🟡 주의 · 🔴 저하 — 각 모델의 <b>평소</b>와 비교 (지금 {peak.peak ? '붐빔' : '한산'})</div>
      </div>

      {details && (
        <div className="details-extra">
          <div className="explain">
            <div className="ex-item"><b>응답속도</b> — 평소보다 크게 <span className="neg">느려지면</span> 서버가 붐비거나(과부하) 자원을 줄인(스로틀링) 신호.</div>
            <div className="ex-item"><b>정답률</b> — 객관 문제 정답률. 평소 거의 100%, <span className="neg">떨어지면</span> 진짜 능력 저하 경보.</div>
            <div className="ex-item"><b>붐빔(피크창)</b> — 평일 5–11 AM PT. Pro/Max는 2026-05-06 해제. 지금 <b>{peak.peak ? '붐빔' : '한산'}</b>.</div>
            <div className="ex-item"><b>비교 방식</b> — 모델끼리가 아니라 <b>각 모델을 자기 평소(기준선)와</b> 비교합니다.</div>
            <div className="ex-foot">매 측정마다 새 문제를 생성(캐시·암기 무력화), 구독 계정 <code>claude -p</code>·도구 OFF·effort 고정. 비공식 측정.</div>
          </div>
          <div className="panels">
            <section className="card panel">
              <div className="card-head"><h2>응답속도 추이 <span className="legend">◎ 붐빔</span></h2><p>점선 = 평소</p></div>
              <div className="chartwrap"><TrendChart history={history} models={shown} get={(e) => e.avgTtftMs} unit="ms" refLines={shown.map((m, i) => { const bm = baselines?.models[m]; return bm?.locked && bm.ttftMs.mean != null ? { y: bm.ttftMs.mean, label: '', color: modelColor(m, i) } : null; }).filter(Boolean) as { y: number; label: string; color: string }[]} markPeak /></div>
            </section>
            <section className="card panel">
              <div className="card-head"><h2>정답률 추이</h2><p>평상시 100% — 떨어지면 경보</p></div>
              <div className="chartwrap"><TrendChart history={history} models={shown} get={(e) => Math.round(e.passRate * 100)} domain={[0, 100]} unit="%" markPeak /></div>
            </section>
            <section className="card panel">
              <div className="card-head"><h2>자기일관성</h2><p>하락 = 샘플링/양자화</p></div>
              <div className="chartwrap"><TrendChart history={history} models={shown} get={(e) => Math.round(e.consistency * 100)} domain={[0, 100]} unit="%" markPeak /></div>
            </section>
          </div>
          {latest && (
            <section className="card">
              <div className="card-head"><h2>문제군 상세 (최근 측정)</h2><p>행을 클릭하면 실제 문제·정답·모델 답안 · 난이도 L{latest.level} · effort {latest.effort}</p></div>
              <FamilyTable latest={latest} models={shown} />
            </section>
          )}
          <section className="card">
            <div className="card-head"><h2>문제 유형별 정답률 (최근)</h2><p>어느 유형에서 먼저 깨지는지</p></div>
            {lastRun && <CapabilityRadar run={lastRun} models={shown} families={families} />}
          </section>
        </div>
      )}
    </div>
  );
}
