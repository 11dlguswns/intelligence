import { Fragment, useState } from 'react';
import type { RunDetail } from '../types';
import { modelColor, modelLabel } from '../lib/model';

const cls = (s: number) => (s >= 85 ? 'pass-full' : s <= 40 ? 'pass-zero' : 'pass-part');

// Per-question judge scores for the latest run; click a row to see the actual
// question, each model's answer, and the score.
export function QuestionTable({ latest, models }: { latest: RunDetail; models: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const present = models.filter((m) => latest.models.some((mm) => mm.resolved === m));
  const byModel = new Map(latest.models.map((m) => [m.resolved, m]));
  const base = present[0] ? byModel.get(present[0]) : latest.models[0];
  const questions = base?.questions ?? [];

  if (present.length === 0) return <p className="muted">선택된 모델이 최근 측정에 없습니다.</p>;

  return (
    <div className="qtable-wrap">
      <table className="qtable">
        <thead>
          <tr>
            <th>차원 (어려움 단계)</th>
            {present.map((m, i) => (
              <th key={m} style={{ color: modelColor(m, i) }}>
                {modelLabel(m)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {questions.map((row) => {
            const isOpen = open === row.id;
            return (
              <Fragment key={row.id}>
                <tr className="qrow" onClick={() => setOpen(isOpen ? null : row.id)}>
                  <td className="qcell">
                    <span className="qchevron">{isOpen ? '▾' : '▸'}</span>
                    <span className="qtitle">{row.title}</span>
                  </td>
                  {present.map((m) => {
                    const q = byModel.get(m)?.questions.find((x) => x.id === row.id);
                    if (!q) return <td key={m}>–</td>;
                    return (
                      <td key={m} className={`scorecell ${cls(q.score)}`}>
                        <span className="qpct">{q.score}</span>
                      </td>
                    );
                  })}
                </tr>
                {isOpen && (
                  <tr className="qdetail">
                    <td colSpan={present.length + 1}>
                      <div className="qprompt-mono">{row.prompt}</div>
                      {row.correct != null && <div className="qcorrect">✓ 정답: <b>{row.correct}</b></div>}
                      <div className="qsamples">
                        {present.map((m) => {
                          const q = byModel.get(m)?.questions.find((x) => x.id === row.id);
                          return (
                            <div key={m} className="qsample">
                              <div className="qsample-head">
                                <span style={{ color: modelColor(m) }}>{modelLabel(m)}</span>
                                <span className="muted">{q?.levelInfo ?? ''}{q?.objScore != null ? ` 객관 ${q.objScore}` : ''} · 품질 {q?.score ?? '–'}</span>
                              </div>
                              <div className="qanswer">{q?.answer || '∅'}</div>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
