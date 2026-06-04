import { useEffect, useState } from 'react';
import type { History, RunDetail, Meta, Baselines, Status } from './types';
import { loadJson } from './lib/data';
import { modelColor, modelLabel } from './lib/model';
import { shortDate } from './lib/format';
import { TrendChart } from './components/TrendChart';
import { CapabilityRadar } from './components/CapabilityRadar';
import { FamilyTable } from './components/FamilyTable';

const STATUS: Record<Status, { label: string; cls: string; icon: string }> = {
  normal: { label: '정상', cls: 'st-normal', icon: '●' },
  warn: { label: '주의', cls: 'st-warn', icon: '▲' },
  degraded: { label: '저하', cls: 'st-degraded', icon: '▼' },
  above: { label: '평소보다 빠름', cls: 'st-above', icon: '▼' },
  baselining: { label: '기준선 형성중', cls: 'st-base', icon: '…' },
};

export default function App() {
  const [history, setHistory] = useState<History | null>(null);
  const [latest, setLatest] = useState<RunDetail | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [baselines, setBaselines] = useState<Baselines | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);

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
        <Header meta={meta} history={history} />
        <div className="card empty">
          <h2>아직 측정 데이터가 없습니다</h2>
          <p>모니터링을 몇 번 돌리면 기준선이 형성되고 컨디션이 채워집니다.</p>
          <pre>{`npm install
npm run bench -- --models opus,sonnet,haiku   # 반복할수록 기준선이 형성/고정됨`}</pre>
        </div>
      </div>
    );
  }

  const allModels = history.models;
  const lastRun = history.runs[history.runs.length - 1];
  const families = history.families ?? [];
  const shown = selected.length ? selected : allModels;
  const baselineRuns = baselines?.baselineRuns ?? meta?.baselineRuns ?? 4;

  const toggle = (m: string) =>
    setSelected((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));

  // baseline TTFT reference lines for the latency chart
  const ttftRefs = shown
    .map((m, i) => {
      const bm = baselines?.models[m];
      if (!bm?.locked || bm.ttftMs.mean == null) return null;
      return { y: bm.ttftMs.mean, label: `${modelLabel(m)} 기준`, color: modelColor(m, i) };
    })
    .filter(Boolean) as { y: number; label: string; color: string }[];

  return (
    <div className="app">
      <Header meta={meta} history={history} />

      <div className="chips">
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

      {/* condition cards — latency primary */}
      <div className="hero">
        {shown.map((m, i) => {
          const e = lastRun?.byModel[m];
          if (!e) return null;
          const st = STATUS[e.condition.status] ?? STATUS.baselining;
          const bm = baselines?.models[m];
          const ratio = e.condition.latencyRatio;
          return (
            <div className={`card stat ${st.cls}`} key={m}>
              <div className="stat-top">
                <div className="stat-model" style={{ color: modelColor(m, i) }}>
                  <span className="dot" style={{ background: modelColor(m, i) }} />
                  {modelLabel(m)}
                </div>
                <span className="level-badge">트립와이어 L{e.level}</span>
              </div>

              <div className={`status-badge ${st.cls}`}>
                {st.icon} {st.label}
              </div>

              <div className="stat-index">
                {e.avgTtftMs ?? '–'}
                <span className="stat-max">ms</span>
              </div>
              <div className="stat-caption">응답 지연 (TTFT)</div>

              <div className="stat-sub">
                {e.baseline.locked && e.baseline.ttftMean != null ? (
                  <>
                    <span>
                      기준 {e.baseline.ttftMean}ms
                      {e.baseline.ttftStd != null ? ` ±${e.baseline.ttftStd}` : ''}
                    </span>
                    {ratio != null && (
                      <span className={ratio > 1.05 ? 'neg' : ratio < 0.95 ? 'pos' : ''}>×{ratio}</span>
                    )}
                  </>
                ) : (
                  <span>기준선 형성중 {e.baseline.n}/{baselineRuns}</span>
                )}
              </div>
              <div className="stat-sub2">
                <span className={e.passRate >= 0.999 ? 'ok-acc' : 'bad-acc'}>
                  정확도 {Math.round(e.passRate * 100)}%
                </span>
                <span>일관성 {Math.round(e.consistency * 100)}%</span>
                <span>{e.avgOutputTokens ?? '–'}tok</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* primary: TTFT trend with per-model baseline lines */}
      <section className="card">
        <div className="card-head">
          <h2>응답 지연 추이 (TTFT)</h2>
          <p>각 모델의 점선 = 자기 기준선. 위로 꾸준히 벗어나면 과부하·스로틀링 신호입니다.</p>
        </div>
        <TrendChart history={history} models={shown} get={(e) => e.avgTtftMs} unit="ms" height={320} refLines={ttftRefs} />
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>정확도 트립와이어</h2>
            <p>객관 과제 정답률. 평상시 100% — 떨어지면 진짜 능력 저하 경보 (%)</p>
          </div>
          <TrendChart
            history={history}
            models={shown}
            get={(e) => Math.round(e.passRate * 100)}
            domain={[0, 100]}
            unit="%"
            height={260}
          />
        </section>
        <section className="card">
          <div className="card-head">
            <h2>자기일관성 추이</h2>
            <p>하락은 샘플링/양자화 신호일 수 있습니다 (%)</p>
          </div>
          <TrendChart
            history={history}
            models={shown}
            get={(e) => Math.round(e.consistency * 100)}
            domain={[0, 100]}
            unit="%"
            height={260}
          />
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>출력 토큰 (장황함)</h2>
            <p>응답당 평균 output tokens — 변화는 동작 변경 신호</p>
          </div>
          <TrendChart history={history} models={shown} get={(e) => e.avgOutputTokens} unit="" height={240} />
        </section>
        <section className="card">
          <div className="card-head">
            <h2>문제군별 정확도 (최근, 트립와이어)</h2>
            <p>어느 유형에서 먼저 깨지는지</p>
          </div>
          {lastRun && <CapabilityRadar run={lastRun} models={shown} families={families} />}
        </section>
      </div>

      {latest && (
        <section className="card">
          <div className="card-head">
            <h2>문제군 상세 (최근 런)</h2>
            <p>
              행을 클릭하면 실제 생성된 문제·정답·모델 답안 · level <b>{latest.level}</b> · effort{' '}
              <b>{latest.effort}</b> · 문제 {latest.instances}개 × {latest.reps}회
            </p>
          </div>
          <FamilyTable latest={latest} models={shown} />
        </section>
      )}

      <Footer meta={meta} />
    </div>
  );
}

function Header({ meta, history }: { meta: Meta | null; history: History | null }) {
  return (
    <header className="masthead">
      <div className="brand">
        <div className="logo" aria-hidden />
        <div>
          <h1>Claude Condition Monitor</h1>
          <p className="tagline">플랜 계정으로 Claude의 컨디션(과부하·스로틀링)을 자기 기준선과 비교</p>
        </div>
      </div>
      <div className="masthead-meta">
        {meta && (
          <span>
            트립와이어 <b>L{meta.level}</b>
          </span>
        )}
        {meta && (
          <span>
            effort <b>{meta.effort}</b>
          </span>
        )}
        {history?.updatedAt && <span>업데이트 {shortDate(history.updatedAt)}</span>}
        {history && <span>{history.runs.length} runs</span>}
      </div>
    </header>
  );
}

function Footer({ meta }: { meta: Meta | null }) {
  return (
    <footer className="footer">
      <div className="card method">
        <h3>측정 방법</h3>
        <p>
          실험 결과, 프런티어 모델은 객관·기계적 과제에서 effort를 낮춰도 거의 항상 정답이라 <b>정확도는 천장</b>입니다.
          그래서 정확도는 고정 난이도(L{meta?.level ?? 8})의 <b>트립와이어</b>로 두고, 평상시 컨디션은
          <b> 응답 지연(TTFT)</b>을 자기 <b>고정 기준선</b>과 비교해 봅니다 — 사용자가 의심한 "자원 축소/스로틀링"의
          가장 직접적인 신호입니다. 문제는 매번 새로 생성(캐시·암기 무력화), 구독 계정으로 Claude Code
          헤드리스(<code>claude -p</code>), 도구 OFF·최소 시스템 프롬프트·effort 고정.
        </p>
        {meta && <pre className="sysprompt">{meta.systemPrompt}</pre>}
        <p className="disclaimer">
          Anthropic과 무관한 비공식 측정입니다. 절대 성능 공시값이 아니라, 구독 경로로 전달되는 각 모델의 상대적
          컨디션(특히 지연) 변화를 추적하기 위한 도구입니다.
        </p>
      </div>
    </footer>
  );
}
