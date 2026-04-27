import {
  buildSideBySide,
  runRedlineCompare,
} from "../redline.mjs";

const modeButtons = [...document.querySelectorAll('.mode-btn')];
const panels = {
  text: document.getElementById('panel-text'),
  files: document.getElementById('panel-files'),
  urls: document.getElementById('panel-urls'),
};

const compareBtn = document.getElementById('compare-btn');
const loadSampleBtn = document.getElementById('load-sample');
const downloadHtmlBtn = document.getElementById('download-html');
const downloadPdfBtn = document.getElementById('download-pdf');
const exportActionsEl = document.getElementById('export-actions');
const statusEl = document.getElementById('status');
const emptyStateEl = document.getElementById('empty-state');
const resultsEl = document.getElementById('results');
const summaryListEl = document.getElementById('summary-list');
const toggleInlineBtn = document.getElementById('toggle-inline');
const toggleSideBtn = document.getElementById('toggle-side');
const inlineSectionEl = document.getElementById('inline-section');
const sideSectionEl = document.getElementById('side-section');
const inlineDiffEl = document.getElementById('inline-diff');
const sideBodyEl = document.getElementById('side-body');

let activeMode = 'text';
let lastResult = null;

const SAMPLE_TEXT_A = `Project Launch Plan
Owner: Alex

1. Build the version compare UI
2. Add diff summary
3. Review with design
4. Share with team on Friday`;

const SAMPLE_TEXT_B = `Project Launch Plan
Owner: Alex Rivera

1. Build the version compare UI
2. Add summary and side-by-side diff
3. Review with design and security
4. Share with team on Thursday
5. Publish to Blockcell`;

const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
const PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
const JSPDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

let pdfJsLibPromise = null;
let jsPdfPromise = null;

function loadExternalScript(src, globalPathCheck) {
  if (globalPathCheck()) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

async function ensurePdfJsLib() {
  if (!pdfJsLibPromise) {
    pdfJsLibPromise = loadExternalScript(PDFJS_CDN, () => Boolean(window.pdfjsLib)).then(() => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
      return window.pdfjsLib;
    });
  }
  return pdfJsLibPromise;
}

async function ensureJsPdfLib() {
  if (!jsPdfPromise) {
    jsPdfPromise = loadExternalScript(JSPDF_CDN, () => Boolean(window.jspdf)).then(() => window.jspdf);
  }
  return jsPdfPromise;
}

function setStatus(state = 'ready', detail = '') {
  const labels = {
    ready: 'Ready',
    comparing: 'Comparing…',
    done: 'Done',
    needs_input: 'Needs input',
    error: 'Error',
  };

  const label = labels[state] || labels.ready;
  const cleanDetail = String(detail || '').replace(/\s+/g, ' ').trim().replace(/\.$/, '');
  statusEl.textContent = cleanDetail ? `${label}: ${cleanDetail}` : label;

  const tone = state === 'done' ? 'ok' : state === 'needs_input' || state === 'error' ? 'error' : 'neutral';
  statusEl.className = `status ${tone}`;
}

function setExportEnabled(enabled) {
  downloadHtmlBtn.disabled = !enabled;
  downloadPdfBtn.disabled = !enabled;
  exportActionsEl?.classList.toggle('hidden', !enabled);
}

function getEmptyStateMessage(mode = activeMode) {
  if (mode === 'files') {
    return 'Upload two files and click Compare.';
  }
  if (mode === 'urls') {
    return 'Paste two URLs and click Compare.';
  }
  return 'Paste two versions and click Compare.';
}

function setEmptyState(visible, mode = activeMode) {
  if (!emptyStateEl) return;
  emptyStateEl.classList.toggle('hidden', !visible);
  if (visible) {
    emptyStateEl.textContent = getEmptyStateMessage(mode);
  } else {
    emptyStateEl.textContent = '';
  }
}

function clearRenderedResults() {
  summaryListEl.innerHTML = '';
  inlineDiffEl.innerHTML = '';
  sideBodyEl.innerHTML = '';
}

function setResultSectionVisibility(section, visible) {
  if (!section) return;
  section.classList.toggle('hidden', !visible);
}

function setToggleButtonState(button, visible, showLabel, hideLabel) {
  if (!button) return;
  button.setAttribute('aria-expanded', visible ? 'true' : 'false');
  button.textContent = visible ? hideLabel : showLabel;
}

function resetResultPanels() {
  setResultSectionVisibility(inlineSectionEl, false);
  setResultSectionVisibility(sideSectionEl, false);
  setToggleButtonState(toggleInlineBtn, false, 'Show Redline', 'Hide Redline');
  setToggleButtonState(toggleSideBtn, false, 'Show Side-by-Side', 'Hide Side-by-Side');
}

function setMode(mode) {
  activeMode = mode;
  modeButtons.forEach((btn) => {
    const isActive = btn.dataset.mode === mode;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  Object.entries(panels).forEach(([name, panel]) => {
    const isActivePanel = name === mode;
    panel.classList.toggle('hidden', !isActivePanel);
    panel.setAttribute('aria-hidden', isActivePanel ? 'false' : 'true');
  });
}

function clearComparisonState() {
  lastResult = null;
  resultsEl.classList.add('hidden');
  setExportEnabled(false);
  clearRenderedResults();
  resetResultPanels();
  setEmptyState(true, activeMode);
}

modeButtons.forEach((btn) =>
  btn.addEventListener('click', () => {
    const nextMode = btn.dataset.mode;
    if (nextMode === activeMode) return;
    setMode(nextMode);
    clearComparisonState();
    setStatus('ready');
  })
);

modeButtons.forEach((btn, index) => {
  btn.addEventListener('keydown', (event) => {
    const key = event.key;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
    event.preventDefault();

    let nextIndex = index;
    if (key === 'ArrowRight') nextIndex = (index + 1) % modeButtons.length;
    if (key === 'ArrowLeft') nextIndex = (index - 1 + modeButtons.length) % modeButtons.length;
    if (key === 'Home') nextIndex = 0;
    if (key === 'End') nextIndex = modeButtons.length - 1;

    const nextButton = modeButtons[nextIndex];
    const nextMode = nextButton.dataset.mode;
    if (nextMode !== activeMode) {
      setMode(nextMode);
      clearComparisonState();
      setStatus('ready');
    }
    nextButton.focus();
  });
});
setMode(activeMode);
clearComparisonState();
setStatus('ready');

toggleInlineBtn?.addEventListener('click', () => {
  const isVisible = !inlineSectionEl.classList.contains('hidden');
  const next = !isVisible;
  setResultSectionVisibility(inlineSectionEl, next);
  setToggleButtonState(toggleInlineBtn, next, 'Show Redline', 'Hide Redline');
});

toggleSideBtn?.addEventListener('click', () => {
  const isVisible = !sideSectionEl.classList.contains('hidden');
  const next = !isVisible;
  if (!next) {
    setResultSectionVisibility(sideSectionEl, false);
    setToggleButtonState(toggleSideBtn, false, 'Show Side-by-Side', 'Hide Side-by-Side');
    return;
  }

  if (!lastResult) {
    setStatus('needs_input', 'run compare first');
    return;
  }

  setStatus('comparing', 'preparing side-by-side');
  const rows = ensureSideBySide(lastResult);
  renderSideBySide(rows);
  setResultSectionVisibility(sideSectionEl, true);
  setToggleButtonState(toggleSideBtn, true, 'Show Side-by-Side', 'Hide Side-by-Side');
  setStatus('done');
});

function ensureSideBySide(result) {
  if (!result) return [];
  if (Array.isArray(result.side_by_side)) return result.side_by_side;

  const left = result.raw?.textA ?? '';
  const right = result.raw?.textB ?? '';
  result.side_by_side = buildSideBySide(left, right);
  return result.side_by_side;
}

function renderSummary(summary) {
  const rows = [
    ['Original word count', summary.original_word_count],
    ['Updated word count', summary.updated_word_count],
    ['Words added', summary.added_words],
    ['Words removed', summary.removed_words],
    ['Net word change', summary.net_word_change],
  ];

  summaryListEl.innerHTML = '';
  for (const [label, value] of rows) {
    const li = document.createElement('li');
    li.textContent = `${label}: ${value}`;
    summaryListEl.appendChild(li);
  }
}

function buildLegacyPreservingEntries(segments) {
  const entries = [];

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];

    if (segment.type === 'equal') {
      entries.push({ kind: 'legacy', text: segment.text });
      continue;
    }

    if (segment.type === 'remove') {
      const next = segments[index + 1];
      entries.push({ kind: 'legacy', text: segment.text });
      if (next?.type === 'add') {
        entries.push({ kind: 'suggestion', text: `[proposed replace with: ${next.text}]` });
        index += 1;
      } else {
        entries.push({ kind: 'suggestion', text: '[proposed remove]' });
      }
      continue;
    }

    if (segment.type === 'add') {
      entries.push({ kind: 'suggestion', text: `[proposed add: ${segment.text}]` });
    }
  }

  return entries;
}

function renderInlineDiff(segments) {
  inlineDiffEl.innerHTML = '';
  for (const entry of buildLegacyPreservingEntries(segments)) {
    const span = document.createElement('span');
    span.textContent = entry.text;
    span.className = entry.kind === 'suggestion' ? 'suggestion-chip' : 'legacy-token';
    inlineDiffEl.appendChild(span);
  }
}

function renderSideBySide(rows) {
  sideBodyEl.innerHTML = '';
  for (const row of rows) {
    const tr = document.createElement('tr');
    const left = document.createElement('td');
    const right = document.createElement('td');

    left.textContent = row.left || '';
    right.textContent = row.right || '';

    if (row.type === 'remove' || row.type === 'replace') left.classList.add('removed-cell');
    if (row.type === 'add' || row.type === 'replace') right.classList.add('added-cell');

    tr.appendChild(left);
    tr.appendChild(right);
    sideBodyEl.appendChild(tr);
  }
}

async function extractPdfText(arrayBuffer) {
  const pdfjsLib = await ensurePdfJsLib();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(' '));
  }

  return pages.join('\n');
}

async function readLocalFile(file) {
  if (!file) throw new Error('Both files are required.');
  const buf = await file.arrayBuffer();

  if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
    return extractPdfText(buf);
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

function toGoogleDocExportUrl(url) {
  const m = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return null;
  return `https://docs.google.com/document/d/${m[1]}/export?format=txt`;
}

async function fetchUrlText(url) {
  const maybeDoc = toGoogleDocExportUrl(url);
  const target = maybeDoc || url;

  const response = await fetch(target, { method: 'GET', credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Failed to fetch URL (${response.status}).`);
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/pdf') || target.toLowerCase().endsWith('.pdf')) {
    const buffer = await response.arrayBuffer();
    return extractPdfText(buffer);
  }

  return await response.text();
}

async function getInputsByMode() {
  if (activeMode === 'text') {
    const textA = document.getElementById('text-a').value;
    const textB = document.getElementById('text-b').value;
    if (!textA.trim() || !textB.trim()) {
      throw new Error('Both text fields are required.');
    }
    return {
      textA,
      textB,
      source: { original_label: 'Pasted Text A', updated_label: 'Pasted Text B' },
    };
  }

  if (activeMode === 'files') {
    const fileA = document.getElementById('file-a').files[0];
    const fileB = document.getElementById('file-b').files[0];
    const textA = await readLocalFile(fileA);
    const textB = await readLocalFile(fileB);
    return {
      textA,
      textB,
      source: {
        original_label: `File: ${fileA?.name || ''}`,
        updated_label: `File: ${fileB?.name || ''}`,
      },
    };
  }

  if (activeMode === 'urls') {
    const urlA = document.getElementById('url-a').value.trim();
    const urlB = document.getElementById('url-b').value.trim();
    if (!urlA || !urlB) throw new Error('Both URLs are required.');

    try {
      const [textA, textB] = await Promise.all([fetchUrlText(urlA), fetchUrlText(urlB)]);
      return {
        textA,
        textB,
        source: { original_label: urlA, updated_label: urlB },
      };
    } catch (error) {
      throw new Error(
        `URL mode failed (${error.message}). This is usually CORS/auth. Use paste or files for private docs.`
      );
    }
  }

  throw new Error('Invalid mode.');
}

function escapeHtml(raw) {
  return String(raw)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildReportHtml(data) {
  const summary = data.summary || {};
  const source = data.source || {};

  const summaryRows = [
    ['Original word count', summary.original_word_count],
    ['Updated word count', summary.updated_word_count],
    ['Words added', summary.added_words],
    ['Words removed', summary.removed_words],
    ['Net word change', summary.net_word_change],
  ];

  const summaryHtml = summaryRows
    .map(([k, v]) => `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</li>`)
    .join('');

  const inlineHtml = buildLegacyPreservingEntries(data.segments || [])
    .map((entry) => {
      const cls = entry.kind === 'suggestion' ? 'suggestion-chip' : 'legacy-token';
      return `<span class="${cls}">${escapeHtml(entry.text || '')}</span>`;
    })
    .join('');

  const sideRows = (data.side_by_side || [])
    .map((r) => {
      const leftCls = r.type === 'remove' || r.type === 'replace' ? 'removed-cell' : '';
      const rightCls = r.type === 'add' || r.type === 'replace' ? 'added-cell' : '';
      return `<tr><td class="${leftCls}">${escapeHtml(r.left || '')}</td><td class="${rightCls}">${escapeHtml(r.right || '')}</td></tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Version Compare Report</title>
<style>
body { font-family: Arial, sans-serif; margin: 0; color: #f5f5f5; background: radial-gradient(circle at 10% 10%, #1b1b1b, #050505); }
.report { max-width: 1040px; margin: 20px auto; background: #0b0b0c; border: 1px solid #2f2f2f; border-radius: 14px; padding: 20px; }
h1, h2 { color: #fff; }
.meta { color: #d3d3d3; margin: 6px 0; }
.diff { border: 1px solid #2f2f2f; border-radius: 8px; background: #0f0f0f; padding: 12px; white-space: pre-wrap; line-height: 1.5; }
.legacy-token { color: #f5f5f5; }
.suggestion-chip { background: rgba(239, 68, 68, 0.22); color: #ffc4c4; border-radius: 6px; padding: 1px 4px; }
.added-cell { background: rgba(34, 197, 94, 0.22); color: #b7f8cb; }
.removed-cell { background: rgba(239, 68, 68, 0.22); color: #ffc4c4; }
table { width: 100%; border-collapse: collapse; margin-top: 12px; }
th, td { border: 1px solid #2f2f2f; padding: 8px; vertical-align: top; white-space: pre-wrap; }
th { background: #151515; color: #f5f5f5; text-align: left; }
</style>
</head>
<body>
<div class="report">
<h1>Version Compare Report</h1>
<div class="meta"><strong>Generated:</strong> ${escapeHtml(data.generated_at_utc || '')}</div>
<div class="meta"><strong>Original Source:</strong> ${escapeHtml(source.original_label || '')}</div>
<div class="meta"><strong>Updated Source:</strong> ${escapeHtml(source.updated_label || '')}</div>
<h2>Summary</h2>
<ul>${summaryHtml}</ul>
<h2>Legacy-Preserving Redline</h2>
<div class="diff">${inlineHtml}</div>
<h2>Side-by-Side Diff</h2>
<table><thead><tr><th>Original</th><th>Updated</th></tr></thead><tbody>${sideRows}</tbody></table>
</div>
</body>
</html>`;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadHtmlReport() {
  if (!lastResult) {
    setStatus('needs_input', 'run compare first');
    return;
  }

  ensureSideBySide(lastResult);
  const html = buildReportHtml(lastResult);
  const name = `version-compare-report-${new Date().toISOString().replaceAll(':', '-')}.html`;
  downloadBlob(name, new Blob([html], { type: 'text/html;charset=utf-8' }));
  setStatus('done', 'HTML report downloaded');
}

async function downloadPdfReport() {
  if (!lastResult) {
    setStatus('needs_input', 'run compare first');
    return;
  }
  ensureSideBySide(lastResult);
  setStatus('comparing', 'building PDF');

  let jspdf;
  try {
    jspdf = await ensureJsPdfLib();
  } catch {
    setStatus('error', 'PDF library could not be loaded');
    return;
  }

  const { jsPDF } = jspdf;
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const frame = { x: 20, y: 20, w: pageWidth - 40, h: pageHeight - 40 };
  const contentX = frame.x + 18;
  const contentW = frame.w - 36;
  const contentBottom = frame.y + frame.h - 18;
  const colGap = 10;
  const colW = (contentW - colGap) / 2;

  const palette = {
    pageBg: [5, 5, 5],
    cardBg: [11, 11, 12],
    border: [47, 47, 47],
    heading: [245, 245, 245],
    text: [229, 229, 229],
    muted: [189, 189, 189],
    tableHeaderBg: [21, 21, 21],
    addText: [183, 248, 203],
    addBg: [25, 57, 39],
    removeText: [255, 196, 196],
    removeBg: [67, 28, 28],
  };

  let y = frame.y + 22;
  let pageIndex = 0;

  function paintPageFrame() {
    pdf.setFillColor(...palette.pageBg);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');
    pdf.setDrawColor(...palette.border);
    pdf.setFillColor(...palette.cardBg);
    pdf.roundedRect(frame.x, frame.y, frame.w, frame.h, 10, 10, 'FD');
    y = frame.y + 22;
  }

  function newPage() {
    if (pageIndex > 0) pdf.addPage();
    pageIndex += 1;
    paintPageFrame();
  }

  function ensureSpace(heightNeeded) {
    if (y + heightNeeded > contentBottom) {
      newPage();
    }
  }

  function writeWrapped(text, opts = {}) {
    const {
      x = contentX,
      width = contentW,
      size = 10,
      color = palette.text,
      lineHeight = 12,
      font = 'normal',
    } = opts;

    pdf.setFont('helvetica', font);
    pdf.setFontSize(size);
    pdf.setTextColor(...color);

    const lines = pdf.splitTextToSize(String(text), width);
    for (const line of lines) {
      ensureSpace(lineHeight + 2);
      pdf.text(line, x, y);
      y += lineHeight;
    }
    return lines.length;
  }

  function sectionTitle(title) {
    y += 4;
    ensureSpace(20);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(...palette.heading);
    pdf.text(title, contentX, y);
    y += 16;
  }

  function drawInlineRow(text, kind) {
    const rowText = (text || '').replace(/\s+/g, ' ').trim();
    if (!rowText) return;

    const lines = pdf.splitTextToSize(rowText, contentW - 10);
    const rowHeight = lines.length * 11 + 6;
    ensureSpace(rowHeight + 4);

    if (kind === 'suggestion') {
      pdf.setFillColor(...palette.removeBg);
      pdf.roundedRect(contentX, y - 9, contentW, rowHeight, 4, 4, 'F');
    }

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    if (kind === 'suggestion') pdf.setTextColor(...palette.removeText);
    else pdf.setTextColor(...palette.text);

    let lineY = y;
    for (const line of lines) {
      pdf.text(line, contentX + 5, lineY);
      lineY += 11;
    }
    y += rowHeight;
  }

  function drawTableHeader() {
    ensureSpace(24);
    pdf.setFillColor(...palette.tableHeaderBg);
    pdf.rect(contentX, y - 10, colW, 18, 'F');
    pdf.rect(contentX + colW + colGap, y - 10, colW, 18, 'F');
    pdf.setDrawColor(...palette.border);
    pdf.rect(contentX, y - 10, colW, 18);
    pdf.rect(contentX + colW + colGap, y - 10, colW, 18);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(...palette.heading);
    pdf.text('Original', contentX + 5, y + 2);
    pdf.text('Updated', contentX + colW + colGap + 5, y + 2);
    y += 20;
  }

  function drawSideBySideRow(row) {
    const leftLines = pdf.splitTextToSize((row.left || '').replace(/\n/g, ' '), colW - 8);
    const rightLines = pdf.splitTextToSize((row.right || '').replace(/\n/g, ' '), colW - 8);
    const lineCount = Math.max(leftLines.length || 1, rightLines.length || 1);
    const rowH = lineCount * 10 + 8;

    if (y + rowH > contentBottom) {
      newPage();
      sectionTitle('Side-by-Side Diff (cont.)');
      drawTableHeader();
    }

    const leftType = row.type === 'remove' || row.type === 'replace';
    const rightType = row.type === 'add' || row.type === 'replace';

    if (leftType) {
      pdf.setFillColor(...palette.removeBg);
      pdf.rect(contentX, y - 8, colW, rowH, 'F');
    }
    if (rightType) {
      pdf.setFillColor(...palette.addBg);
      pdf.rect(contentX + colW + colGap, y - 8, colW, rowH, 'F');
    }

    pdf.setDrawColor(...palette.border);
    pdf.rect(contentX, y - 8, colW, rowH);
    pdf.rect(contentX + colW + colGap, y - 8, colW, rowH);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);

    for (let i = 0; i < lineCount; i += 1) {
      const lineY = y + i * 10;

      pdf.setTextColor(...(leftType ? palette.removeText : palette.text));
      pdf.text(leftLines[i] || '', contentX + 4, lineY);

      pdf.setTextColor(...(rightType ? palette.addText : palette.text));
      pdf.text(rightLines[i] || '', contentX + colW + colGap + 4, lineY);
    }

    y += rowH;
  }

  newPage();

  writeWrapped('Version Compare Report', { size: 16, font: 'bold', color: palette.heading });
  y += 2;
  writeWrapped(`Generated: ${lastResult.generated_at_utc}`, { size: 9, color: palette.muted });
  writeWrapped(`Original Source: ${lastResult.source?.original_label || ''}`, {
    size: 9,
    color: palette.muted,
  });
  writeWrapped(`Updated Source: ${lastResult.source?.updated_label || ''}`, {
    size: 9,
    color: palette.muted,
  });

  sectionTitle('Summary');
  const s = lastResult.summary || {};
  writeWrapped(`Original word count: ${s.original_word_count ?? 0}`);
  writeWrapped(`Updated word count: ${s.updated_word_count ?? 0}`);
  writeWrapped(`Words added: ${s.added_words ?? 0}`);
  writeWrapped(`Words removed: ${s.removed_words ?? 0}`);
  writeWrapped(`Net word change: ${s.net_word_change ?? 0}`);

  sectionTitle('Legacy-Preserving Redline');
  for (const entry of buildLegacyPreservingEntries(lastResult.segments || []).slice(0, 450)) {
    drawInlineRow(entry.text, entry.kind);
  }

  sectionTitle('Side-by-Side Diff');
  drawTableHeader();
  for (const row of (lastResult.side_by_side || []).slice(0, 220)) {
    drawSideBySideRow(row);
  }

  const name = `version-compare-report-${new Date().toISOString().replaceAll(':', '-')}.pdf`;
  pdf.save(name);
  setStatus('done', 'PDF report downloaded');
}

async function compareCurrentInputs() {
  setStatus('comparing');
  resultsEl.classList.add('hidden');
  setExportEnabled(false);
  resetResultPanels();
  setEmptyState(false);

  try {
    const { textA, textB, source } = await getInputsByMode();
    const result = runRedlineCompare(textA, textB, source);
    lastResult = result;

    renderSummary(result.summary);
    renderInlineDiff(result.segments);

    setExportEnabled(true);
    resultsEl.classList.remove('hidden');
    setEmptyState(false);
    setStatus('done');
  } catch (error) {
    setExportEnabled(false);
    setEmptyState(true, activeMode);
    const detail = String(error?.message || 'Comparison failed').replace(/\s+/g, ' ').trim();
    if (/\brequired\b/i.test(detail)) {
      setStatus('needs_input', detail);
    } else {
      setStatus('error', detail);
    }
  }
}

compareBtn.addEventListener('click', compareCurrentInputs);

loadSampleBtn.addEventListener('click', () => {
  setMode('text');
  clearComparisonState();
  document.getElementById('text-a').value = SAMPLE_TEXT_A;
  document.getElementById('text-b').value = SAMPLE_TEXT_B;
  setStatus('ready', 'sample loaded');
});

downloadHtmlBtn.addEventListener('click', downloadHtmlReport);
downloadPdfBtn.addEventListener('click', downloadPdfReport);

function hydrateFromQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const originalText = params.get('a');
  const updatedText = params.get('b');
  if (!originalText || !updatedText) {
    return;
  }

  setMode('text');
  clearComparisonState();
  document.getElementById('text-a').value = originalText;
  document.getElementById('text-b').value = updatedText;
  setStatus('ready', 'redline loaded');

  if (params.get('autorun') === '1') {
    compareCurrentInputs();
  }
}

hydrateFromQueryParams();
