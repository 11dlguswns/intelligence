// Deterministic answer extraction + checking. No LLM judge — everything here is
// a pure function so scoring is reproducible and free.
//
// The "pure capability" profile instructs the model to answer tersely, so these
// extractors stay lenient enough to forgive a stray word but strict on the value.

function firstNumber(text) {
  // First integer or decimal, tolerating a leading $/sign and thousands commas.
  const m = String(text).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function firstWord(text) {
  const m = String(text).trim().toLowerCase().match(/[a-z']+/);
  return m ? m[0].replace(/'/g, '') : null;
}

/**
 * @param {{type:string,equals?:any,pattern?:string,anyOf?:string[]}} spec
 * @param {string} raw  the model's `result` text
 * @returns {{parsed:string|null, correct:boolean}}
 */
export function verify(spec, raw) {
  const text = (raw ?? '').toString().trim();
  switch (spec.type) {
    case 'numeric': {
      const n = firstNumber(text);
      return { parsed: n === null ? null : String(n), correct: n === spec.equals };
    }
    case 'word': {
      const w = firstWord(text);
      return { parsed: w, correct: w === spec.equals };
    }
    case 'regex': {
      // Tests the whole (trimmed) response — used for strict format adherence.
      const re = new RegExp(spec.pattern);
      return { parsed: text, correct: re.test(text) };
    }
    case 'wordset': {
      const w = firstWord(text);
      return { parsed: w, correct: Array.isArray(spec.anyOf) && spec.anyOf.includes(w) };
    }
    default:
      return { parsed: text, correct: false };
  }
}
