export function tokenizeWords(text) {
  return String(text || "").match(/\s+|[^\s]+/g) || [];
}

export function myersDiff(a, b) {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const trace = [];
  let v = new Map();
  v.set(1, 0);

  for (let d = 0; d <= max; d += 1) {
    const current = new Map(v);
    trace.push(current);

    for (let k = -d; k <= d; k += 2) {
      const vKMinus = v.get(k - 1);
      const vKPlus = v.get(k + 1);

      let x;
      if (k === -d || (k !== d && (vKMinus ?? -Infinity) < (vKPlus ?? -Infinity))) {
        x = vKPlus ?? 0;
      } else {
        x = (vKMinus ?? 0) + 1;
      }

      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }

      v.set(k, x);
      if (x >= n && y >= m) {
        return backtrack(trace, a, b);
      }
    }
  }

  return [];
}

function backtrack(trace, a, b) {
  let x = a.length;
  let y = b.length;
  const ops = [];

  for (let d = trace.length - 1; d >= 0; d -= 1) {
    const v = trace[d];
    const k = x - y;

    let prevK;
    const vKMinus = v.get(k - 1);
    const vKPlus = v.get(k + 1);
    if (k === -d || (k !== d && (vKMinus ?? -Infinity) < (vKPlus ?? -Infinity))) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = v.get(prevK) ?? 0;
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      ops.push({ type: "equal", value: a[x - 1] });
      x -= 1;
      y -= 1;
    }

    if (d === 0) {
      break;
    }

    if (x === prevX) {
      ops.push({ type: "add", value: b[y - 1] });
      y -= 1;
    } else {
      ops.push({ type: "remove", value: a[x - 1] });
      x -= 1;
    }
  }

  ops.reverse();
  return ops;
}

export function mergeSegments(ops) {
  const out = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    if (last && last.type === op.type) {
      last.text += op.value;
    } else {
      out.push({ type: op.type, text: op.value });
    }
  }
  return out;
}

export function buildSideBySide(oldText, newText) {
  const oldLines = String(oldText || "").split(/\r?\n/);
  const newLines = String(newText || "").split(/\r?\n/);
  const ops = myersDiff(oldLines, newLines);

  const rows = [];
  let i = 0;

  while (i < ops.length) {
    const op = ops[i];
    if (op.type === "equal") {
      rows.push({ type: "equal", left: op.value, right: op.value });
      i += 1;
      continue;
    }

    const removed = [];
    const added = [];

    while (i < ops.length && ops[i].type !== "equal") {
      if (ops[i].type === "remove") {
        removed.push(ops[i].value);
      }
      if (ops[i].type === "add") {
        added.push(ops[i].value);
      }
      i += 1;
    }

    const max = Math.max(removed.length, added.length);
    for (let idx = 0; idx < max; idx += 1) {
      const left = removed[idx] || "";
      const right = added[idx] || "";
      let type = "equal";
      if (left && right) {
        type = "replace";
      } else if (left) {
        type = "remove";
      } else if (right) {
        type = "add";
      }
      rows.push({ type, left, right });
    }
  }

  return rows;
}

function countWords(text) {
  return (String(text || "").match(/\S+/g) || []).length;
}

export function summarizeRedline(oldText, newText, segments) {
  const addedWords = segments
    .filter((segment) => segment.type === "add")
    .reduce((total, segment) => total + countWords(segment.text), 0);
  const removedWords = segments
    .filter((segment) => segment.type === "remove")
    .reduce((total, segment) => total + countWords(segment.text), 0);

  const originalWordCount = countWords(oldText);
  const updatedWordCount = countWords(newText);

  return {
    original_word_count: originalWordCount,
    updated_word_count: updatedWordCount,
    added_words: addedWords,
    removed_words: removedWords,
    net_word_change: updatedWordCount - originalWordCount,
  };
}

export function runRedlineCompare(textA, textB, source = {}) {
  const tokenOps = myersDiff(tokenizeWords(textA), tokenizeWords(textB));
  const segments = mergeSegments(tokenOps);

  return {
    summary: summarizeRedline(textA, textB, segments),
    segments,
    side_by_side: buildSideBySide(textA, textB),
    raw: {
      textA,
      textB,
    },
    source,
    generated_at_utc: new Date().toISOString(),
  };
}
