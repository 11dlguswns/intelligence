import { useEffect, useState } from 'react';
import type { History, RunDetail, Meta } from './types';
import { loadJson } from './lib/data';
import { modelColor, modelLabel } from './lib/model';
import { shortDate } from './lib/format';
import { TrendChart } from './components/TrendChart';
import { CapabilityRadar } from './components/CapabilityRadar';
import { QuestionTable } from './components/QuestionTable';

export default function App() {
  const [history, setHistory] = useState<History | null>(null);
  const [latest, setLatest] = useState<RunDetail | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const [h, l, m] = await Promise.all([
        loadJson<History>('history.json'),
        loadJson<RunDetail>('latest.json'),
        loadJson<Meta>('meta.json'),
      ]);
      setHistory(h);
      setLatest(l);
      setMeta(m);
      setSelected(h?.models ?? []);
      setLoading(false);
    })();
  }, []);

  const allModels = history?.models ?? [];
  const lastRun = history?.runs[history.runs.length - 1];

  const toggle = (m: string) =>
    setSelected((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]));

  function deltaFor(model: string): number | null {
    if (!history) return null;
    const runsWith = history.runs.filter((r) => r.byModel[model]);
    if (runsWith.length < 2) return null;
    const cur = runsWith[runsWith.length - 1].byModel[model].index;
    const prev = runsWith[runsWith.length - 2].byModel[model].index;
    return Math.round((cur - prev) * 10) / 10;
  }

  if (loading) return <div className="state">불러오는 중…</div>;

  if (!history || history.runs.length === 0) {
    return (
      <div className="app">
        <Header meta={meta} history={history} />
        <div className="card empty">
          <h2>아직 측정 데이터가 없습니다</h2>
          <p>러너를 한 번 돌리면 이 대시보드가 채워집니다.</p>
          <pre>{`npm install
npm run bench        # 기본: haiku
npm run bench:all    # opus, sonnet, haiku`}</pre>
        </div>
      </div>
    );
  }

  const shown = selected.length ? selected : allModels;

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

      <div className="hero">
        {shown.map((m, i) => {
          const e = lastRun?.byModel[m];
          if (!e) return null;
          const d = deltaFor(m);
          return (
            <div className="card stat" key={m}>
              <div className="stat-model" style={{ color: modelColor(m, i) }}>
                <span className="dot" style={{ background: modelColor(m, i) }} />
                {modelLabel(m)}
              </div>
              <div className="stat-index">
                {e.index}
                <span className="stat-max">/100</span>
              </div>
              <div className={`stat-delta ${d == null ? 'flat' : d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}`}>
                {d == null ? '신규 측정' : d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${Math.abs(d)}` : '— 0'}
                {d != null && <span className="stat-delta-label"> 직전 대비</span>}
              </div>
              <div className="stat-sub">
                <span>일관성 {Math.round(e.consistency * 100)}%</span>
                <span>TTFT {e.avgTtftMs ?? '–'}ms</span>
              </div>
            </div>
          );
        })}
      </div>

      <section className="card">
        <div className="card-head">
          <h2>지능지수 추이</h2>
          <p>차원별 통과율의 균등 평균 (0–100). 점수가 내려가면 무언가 바뀐 것입니다.</p>
        </div>
        <TrendChart history={history} models={shown} get={(e) => e.index} domain={[0, 100]} height={320} />
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>역량 프로파일 (최근 런)</h2>
            <p>차원별 통과율 %</p>
          </div>
          {lastRun && <CapabilityRadar run={lastRun} models={shown} dimensions={history.dimensions} />}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>자기일관성 추이</h2>
            <p>같은 질문에 같은 답을 내는 비율 %</p>
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
            <h2>응답 지연 (TTFT)</h2>
            <p>첫 토큰까지의 시간 (ms)</p>
          </div>
          <TrendChart history={history} models={shown} get={(e) => e.avgTtftMs} unit="ms" height={240} />
        </section>
        <section className="card">
          <div className="card-head">
            <h2>출력 토큰 (장황함)</h2>
            <p>응답당 평균 output tokens</p>
          </div>
          <TrendChart history={history} models={shown} get={(e) => e.avgOutputTokens} unit="" height={240} />
        </section>
      </div>

      {latest && (
        <section className="card">
          <div className="card-head">
            <h2>질문별 상세 (최근 런)</h2>
            <p>
              행을 클릭하면 표본 답안이 보입니다 · profile <b>{latest.profile}</b> · effort{' '}
              <b>{latest.effort}</b> · 반복 {latest.repeat}회
            </p>
          </div>
          <QuestionTable latest={latest} models={shown} />
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
          <h1>Claude Intelligence Monitor</h1>
          <p className="tagline">플랜 계정으로 측정하는 Claude의 시계열 지능 지표</p>
        </div>
      </div>
      <div className="masthead-meta">
        {meta && (
          <span>
            profile <b>{meta.profile}</b>
          </span>
        )}
        {meta && (
          <span>
            effort <b>{meta.defaultEffort}</b>
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
          Claude Code 헤드리스(<code>claude -p</code>)로 <b>구독 계정</b>을 통해 호출합니다. 모든 도구를 끄고
          시스템 프롬프트를 최소화한 "순수 능력" 프로파일을 쓰며, effort를 상수로 고정해 재현성을 확보합니다.
          각 질문을 여러 번 반복해 통과율과 자기일관성을 함께 측정합니다.
        </p>
        {meta && <pre className="sysprompt">{meta.systemPrompt}</pre>}
        <p className="disclaimer">
          Anthropic과 무관한 비공식 측정입니다. 절대 성능 공시값이 아니라, 구독 경로로 전달되는 Claude의 상대적
          변화를 추적하기 위한 도구입니다.
        </p>
      </div>
    </footer>
  );
}
