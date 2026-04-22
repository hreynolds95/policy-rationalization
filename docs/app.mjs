import {
  analyzeDocuments,
  extractTextFromHtml,
  isGoogleAuthPage,
  normalizeGoogleExportUrl,
  parseCsv,
} from "./analysis.mjs";
import { SAMPLE_DOCUMENTS, SAMPLE_URLS } from "./sample-data.mjs";

const state = {
  includeSampleData: false,
};

function createManualDocumentCard(title = "", text = "") {
  const wrapper = document.createElement("article");
  wrapper.className = "manual-card";
  wrapper.innerHTML = `
    <div class="manual-card__header">
      <input class="manual-card__title" type="text" placeholder="Document title" value="${escapeHtml(title)}">
      <button class="ghost-button ghost-button--small" type="button" data-remove-manual>Remove</button>
    </div>
    <textarea class="manual-card__text" rows="7" placeholder="Paste policy or standard text here">${escapeHtml(
      text
    )}</textarea>
  `;
  return wrapper;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function ensureMinimumManualCards() {
  const container = document.querySelector("[data-manual-documents]");
  if (!container.children.length) {
    container.appendChild(createManualDocumentCard());
    container.appendChild(createManualDocumentCard());
  }
}

function setupManualDocuments() {
  const container = document.querySelector("[data-manual-documents]");
  const addButton = document.querySelector("[data-add-manual]");

  addButton.addEventListener("click", () => {
    container.appendChild(createManualDocumentCard());
  });

  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-manual]");
    if (!button) {
      return;
    }
    button.closest(".manual-card")?.remove();
    ensureMinimumManualCards();
  });

  ensureMinimumManualCards();
}

async function loadDocumentsFromFiles(fileList) {
  const files = [...fileList];
  const documents = [];
  const issues = [];

  for (const file of files) {
    const text = await file.text();
    if (file.name.toLowerCase().endsWith(".csv")) {
      const csvDocuments = parseCsv(text, file.name);
      if (!csvDocuments.length) {
        issues.push(`${file.name}: could not infer a content column in the CSV`);
        continue;
      }
      documents.push(...csvDocuments);
      continue;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      issues.push(`${file.name}: file was empty`);
      continue;
    }
    documents.push({
      id: `${file.name}-file`,
      title: file.name.replace(/\.[^.]+$/, ""),
      source: `file://${file.name}`,
      text: trimmed,
    });
  }

  return { documents, issues };
}

async function loadDocumentsFromUrls(rawUrls) {
  const urls = rawUrls
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);

  const documents = [];
  const issues = [];

  for (const originalUrl of urls) {
    const url = normalizeGoogleExportUrl(originalUrl);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        issues.push(`${originalUrl}: request failed with status ${response.status}`);
        continue;
      }

      const text = await response.text();
      if (isGoogleAuthPage(text)) {
        issues.push(`${originalUrl}: Google auth is required, so use a public export or upload a file instead`);
        continue;
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/csv") || url.toLowerCase().includes("format=csv") || url.endsWith(".csv")) {
        const csvDocuments = parseCsv(text, originalUrl);
        if (!csvDocuments.length) {
          issues.push(`${originalUrl}: CSV loaded but no supported content column was found`);
          continue;
        }
        documents.push(...csvDocuments);
        continue;
      }

      const extractedText = contentType.includes("text/html") ? extractTextFromHtml(text) : text.trim();
      if (!extractedText) {
        issues.push(`${originalUrl}: no readable text was extracted`);
        continue;
      }

      documents.push({
        id: `${originalUrl}-url`,
        title: deriveTitleFromUrl(originalUrl),
        source: originalUrl,
        text: extractedText,
      });
    } catch (error) {
      issues.push(`${originalUrl}: ${error.message}. Public URLs may still fail in-browser because of CORS`);
    }
  }

  return { documents, issues };
}

function deriveTitleFromUrl(url) {
  try {
    const parsed = new URL(url);
    const tail = parsed.pathname.split("/").filter(Boolean).pop();
    return tail || url;
  } catch {
    return url;
  }
}

function loadManualDocuments() {
  const cards = [...document.querySelectorAll(".manual-card")];
  return cards
    .map((card, index) => ({
      id: `manual-${index + 1}`,
      title: card.querySelector(".manual-card__title").value.trim() || `Manual Document ${index + 1}`,
      source: `manual://document-${index + 1}`,
      text: card.querySelector(".manual-card__text").value.trim(),
    }))
    .filter((document) => document.text);
}

function renderStatus(message, tone = "neutral") {
  const status = document.querySelector("[data-status]");
  status.textContent = message;
  status.dataset.tone = tone;
}

function renderResults(result, issues) {
  const output = document.querySelector("[data-results]");
  const summary = buildSummary(result);
  const groupsHtml = buildGroupMarkup(result);
  const pairsHtml = buildPairMarkup(result);
  const issuesHtml = buildIssuesMarkup(issues);

  output.innerHTML = `
    <section class="results-shell">
      <div class="results-hero">
        <div>
          <p class="eyebrow">Analysis complete</p>
          <h2>Consolidation candidates and review flags</h2>
          <p>${summary}</p>
        </div>
        <div class="results-stats">
          <article class="stat">
            <span class="stat__label">Documents</span>
            <strong>${result.documents.length}</strong>
          </article>
          <article class="stat">
            <span class="stat__label">High-similarity pairs</span>
            <strong>${result.edges.length}</strong>
          </article>
          <article class="stat">
            <span class="stat__label">Duplicate groups</span>
            <strong>${result.groups.length}</strong>
          </article>
        </div>
      </div>
      <section class="results-section">
        <h3>Recommended consolidation groups</h3>
        ${groupsHtml}
      </section>
      <section class="results-section">
        <h3>Top similarity pairs</h3>
        ${pairsHtml}
      </section>
      <section class="results-section">
        <h3>Import issues</h3>
        ${issuesHtml}
      </section>
    </section>
  `;
}

function buildSummary(result) {
  if (!result.groups.length) {
    if (!result.edges.length) {
      return "No consolidation cluster cleared the current threshold. That usually means the document set is either cleanly separated or the threshold is too strict for the material you loaded.";
    }
    return "A few documents overlap, but they do not yet form a strong duplicate group. Review the top pairs first and consider lowering the threshold slightly if you want broader clustering.";
  }

  const strongest = result.groups[0];
  const primary = result.documents.find((document) => document.id === strongest.recommendedPrimaryId);
  return `${strongest.documentIds.length} documents cluster around ${primary.title} as the strongest canonical candidate. The recommendation keeps required structure intact and pushes brand scope, regulatory coverage, and procedural content into explicit review checks.`;
}

function buildGroupMarkup(result) {
  if (!result.groups.length) {
    return `<article class="result-card"><p>No duplicate groups were found at the current threshold.</p></article>`;
  }

  return result.groups
    .map((group, index) => {
      const documents = group.documentIds
        .map((id) => result.documents.find((document) => document.id === id))
        .filter(Boolean);
      const primary = result.documents.find((document) => document.id === group.recommendedPrimaryId);
      return `
        <article class="result-card">
          <div class="result-card__header">
            <p class="eyebrow">Group ${index + 1}</p>
            <span class="pill">${group.avgInternalSimilarity.toFixed(4)} avg similarity</span>
          </div>
          <h4>${primary.title}</h4>
          <p>${group.recommendation}</p>
          <div class="check-grid">
            ${Object.entries(group.checks)
              .map(
                ([label, value]) => `
                  <div class="check">
                    <span>${formatLabel(label)}</span>
                    <strong>${value}</strong>
                  </div>
                `
              )
              .join("")}
          </div>
          <ul class="source-list">
            ${documents
              .map(
                (document) => `
                  <li>
                    <strong>${document.title}</strong>
                    <span>${document.source}</span>
                  </li>
                `
              )
              .join("")}
          </ul>
        </article>
      `;
    })
    .join("");
}

function buildPairMarkup(result) {
  if (!result.edges.length) {
    return `<article class="result-card"><p>No document pairs cleared the threshold.</p></article>`;
  }

  return `
    <article class="result-card">
      <ul class="pair-list">
        ${result.edges
          .slice(0, 12)
          .map((edge) => {
            const left = result.documents.find((document) => document.id === edge.leftId);
            const right = result.documents.find((document) => document.id === edge.rightId);
            return `
              <li>
                <span>${left.title}</span>
                <strong>${edge.score.toFixed(4)}</strong>
                <span>${right.title}</span>
              </li>
            `;
          })
          .join("")}
      </ul>
    </article>
  `;
}

function buildIssuesMarkup(issues) {
  if (!issues.length) {
    return `<article class="result-card"><p>No import issues detected.</p></article>`;
  }

  return `
    <article class="result-card">
      <ul class="issue-list">
        ${issues.map((issue) => `<li>${issue}</li>`).join("")}
      </ul>
    </article>
  `;
}

function formatLabel(value) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (match) => match.toUpperCase());
}

async function runAnalysis() {
  renderStatus("Collecting documents and running rationalization analysis...");
  const threshold = Number(document.querySelector("#threshold").value || "0.45");
  const urlsValue = document.querySelector("#urls").value;
  const fileInput = document.querySelector("#files");
  const issues = [];

  const manualDocuments = loadManualDocuments();
  const [fileResult, urlResult] = await Promise.all([
    loadDocumentsFromFiles(fileInput.files),
    loadDocumentsFromUrls(urlsValue),
  ]);

  issues.push(...fileResult.issues, ...urlResult.issues);

  const documents = [
    ...(state.includeSampleData ? SAMPLE_DOCUMENTS : []),
    ...manualDocuments,
    ...fileResult.documents,
    ...urlResult.documents,
  ];

  if (documents.length < 2) {
    renderStatus(
      "Add at least two documents. The quickest path is the built-in demo library or a small file upload set.",
      "warning"
    );
    document.querySelector("[data-results]").innerHTML = "";
    return;
  }

  const result = analyzeDocuments(documents, threshold);
  renderResults(result, issues);
  renderStatus(`Analyzed ${result.documents.length} documents with a ${threshold.toFixed(2)} similarity threshold.`, "success");
}

function wireDemoControls() {
  const toggle = document.querySelector("#include-sample");
  const urlsField = document.querySelector("#urls");
  const loadUrlsButton = document.querySelector("[data-load-sample-urls]");
  const runDemoButton = document.querySelector("[data-run-demo]");

  toggle.addEventListener("change", () => {
    state.includeSampleData = toggle.checked;
  });

  loadUrlsButton.addEventListener("click", () => {
    urlsField.value = SAMPLE_URLS.join("\n");
    renderStatus("Sample URLs loaded into the textarea. These are illustrative placeholders for team walkthroughs.");
  });

  runDemoButton.addEventListener("click", async () => {
    toggle.checked = true;
    state.includeSampleData = true;
    await runAnalysis();
  });
}

function wireForm() {
  document.querySelector("[data-analyze]").addEventListener("click", async (event) => {
    event.preventDefault();
    await runAnalysis();
  });
}

function initialize() {
  setupManualDocuments();
  wireDemoControls();
  wireForm();
  renderStatus("Ready. Load the demo library, upload files, paste URLs, or add manual documents.");
}

initialize();
