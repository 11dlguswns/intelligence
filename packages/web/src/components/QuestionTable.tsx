import { Fragment, useState } from 'react';
import type { RunDetail } from '../types';
import { modelColor, modelLabel } from '../lib/model';

interface Props {
  latest: RunDetail;
  models: string[];
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const cls = (rate: number) => (rate >= 0.999 ? 'pass-full' : rate <= 0.001 ? 'pass-zero' : 'pass-part');

export function QuestionTable({ latest, models }: Props) {
  const [open, setOpen] = useState<string | null>(null);

  const present = models.filter((m) => latest.models.some((mm) => mm.resolved === m));
  const byModel = new Map(latest.models.map((m) => [m.resolved, m]));
  const base = present[0] ? byModel.get(present[0]) : latest.models[0];
  const questions = base?.questions ?? [];

  if (present.length === 0) return <p className="muted">선택된 모델이 최근 런에 없습니다.</p>;

  return (
    <div className="qtable-wrap">
      <table className="qtable">
        <thead>
          <tr>
            <th>질문</th>
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
                    <span className="qdim">{row.dimension}</span>
                  </td>
                  {present.map((m) => {
                    const q = byModel.get(m)?.questions.find((qq) => qq.id === row.id);
                    if (!q) return <td key={m}>–</td>;
                    return (
                      <td key={m} className={`scorecell ${cls(q.passRate)}`}>
                        <span className="qpct">{pct(q.passRate)}</span>
                        <span className="qmodal">{q.modalAnswer ?? '∅'}</span>
                      </td>
                    );
                  })}
                </tr>
                {isOpen && (
                  <tr className="qdetail">
                    <td colSpan={present.length + 1}>
                      <div className="qsamples">
                        {present.map((m) => {
                          const q = byModel.get(m)?.questions.find((qq) => qq.id === row.id);
                          return (
                            <div key={m} className="qsample">
                              <div className="qsample-head">
                                <span style={{ color: modelColor(m) }}>{modelLabel(m)}</span>
                                <span className="muted">일관성 {pct(q?.modalFreq ?? 0)}</span>
                              </div>
                              <div className="qsample-answers">
                                {(q?.attempts ?? []).map((a, idx) => (
                                  <code
                                    key={idx}
                                    className={a.error ? 'ans-err' : a.correct ? 'ans-ok' : 'ans-bad'}
                                    title={a.error ?? a.raw}
                                  >
                                    {a.error ? '⚠ error' : a.raw?.slice(0, 48) || '∅'}
                                  </code>
                                ))}
                              </div>
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
