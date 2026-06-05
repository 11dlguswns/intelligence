import { generateLadder, gradeInstance, formatAnswer, DIMENSIONS, LADDER_LEVELS } from './problems.mjs';

let fails = 0;
const seeds = ['s-1', 's-2', 's-3', 'run-abc', 'run-xyz', '2026-06-05T07-00-00'];

for (const seed of seeds) {
  const ladder = generateLadder(seed);
  if (ladder.length !== DIMENSIONS.length) {
    console.log(`✗ ladder has ${ladder.length} dims, expected ${DIMENSIONS.length}`);
    fails++;
  }
  for (const d of ladder) {
    if (d.levels.length !== LADDER_LEVELS.length) {
      console.log(`✗ [${d.dim}] ${d.levels.length} levels`);
      fails++;
    }
    for (const inst of d.levels) {
      // correct answer grades 100
      const ok = gradeInstance(inst, `풀이.\n정답: ${formatAnswer(inst)}`);
      if (ok !== 100) {
        console.log(`✗ [${d.dim} L${inst.level}] correct scored ${ok} (ans=${formatAnswer(inst)})`);
        fails++;
      }
      // a wrong answer must NOT score 100
      let wrong;
      if (inst.type === 'int') wrong = `정답: ${inst.answer + 13}`;
      else if (inst.type === 'frac') wrong = `정답: ${inst.answer.n + 1}/${inst.answer.d + 5}`;
      else if (inst.type === 'set') wrong = `정답: ${inst.meta.people.filter((p) => !inst.answer.includes(p)).join(', ') || '없음'}`;
      if (gradeInstance(inst, wrong) === 100) {
        console.log(`✗ [${d.dim} L${inst.level}] WRONG scored 100 (ans=${formatAnswer(inst)} wrong=${wrong})`);
        fails++;
      }
    }
  }
}

// show one ladder so difficulty growth is eyeballable
console.log('\n──── sample ladder (seed demo) ────');
for (const d of generateLadder('demo')) {
  console.log(`\n● ${d.dim} (${d.title})`);
  for (const inst of d.levels) {
    const oneLine = inst.prompt.split('\n').filter((l) => l && !l.startsWith('반드시')).join(' ').slice(0, 120);
    console.log(`  L${inst.level}: ${oneLine}…  ⟶ ${formatAnswer(inst)}`);
  }
}

console.log(`\n${fails === 0 ? '✔ ALL CHECKS PASSED' : '✗ ' + fails + ' FAILURES'} · dims=${DIMENSIONS.length} × levels=${LADDER_LEVELS.join(',')}`);
process.exit(fails === 0 ? 0 : 1);
