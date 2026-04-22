import {
  DOCUMENT_TYPES,
  analyzeDocuments,
  extractTextFromHtml,
  isGoogleAuthPage,
  normalizeGoogleExportUrl,
  parseCsv,
} from "./analysis.mjs";
import { SAMPLE_DOCUMENTS, SAMPLE_URLS } from "./sample-data.mjs";

const state = {
  includeSampleData: false,
  activeSourceTab: "demo",
  analysisView: {
    query: "",
    filter: "all",
    documents: [],
    threshold: 0.45,
    levelOverrides: {},
    result: null,
    issues: [],
  },
};

const DEPLOYMENT_API_URL =
  "https://api.github.com/repos/hreynolds95/policy-rationalization/pages/builds/latest";

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

async function loadDocumentsFromFiles(fileList, onProgress = () => {}) {
  const files = [...fileList];
  const documents = [];
  const issues = [];

  for (const [index, file] of files.entries()) {
    onProgress({
      current: index + 1,
      total: files.length,
      label: file.name,
    });
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

async function loadDocumentsFromUrls(rawUrls, onProgress = () => {}) {
  const urls = rawUrls
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);

  const documents = [];
  const issues = [];

  for (const [index, originalUrl] of urls.entries()) {
    onProgress({
      current: index + 1,
      total: urls.length,
      label: originalUrl,
    });
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

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
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

function countUrlEntries() {
  return document
    .querySelector("#urls")
    .value.split("\n")
    .map((value) => value.trim())
    .filter(Boolean).length;
}

function countManualEntries() {
  return loadManualDocuments().length;
}

function updateSourceSummary() {
  const target = document.querySelector("[data-source-summary]");
  if (!target) {
    return;
  }

  const fileCount = document.querySelector("#files").files.length;
  const urlCount = countUrlEntries();
  const manualCount = countManualEntries();
  const sampleEnabled = state.includeSampleData;

  const chips = [
    `<span class="source-chip ${sampleEnabled ? "source-chip--active" : ""}">Demo library ${sampleEnabled ? "on" : "off"}</span>`,
    `<span class="source-chip ${urlCount ? "source-chip--active" : ""}">${urlCount} URL${urlCount === 1 ? "" : "s"}</span>`,
    `<span class="source-chip ${fileCount ? "source-chip--active" : ""}">${fileCount} file${fileCount === 1 ? "" : "s"}</span>`,
    `<span class="source-chip ${manualCount ? "source-chip--active" : ""}">${manualCount} pasted doc${manualCount === 1 ? "" : "s"}</span>`,
  ];

  target.innerHTML = chips.join("");
}

function computeWorkspaceReadiness() {
  const urlCount = countUrlEntries();
  const fileCount = document.querySelector("#files").files.length;
  const manualCount = countManualEntries();
  const estimatedDocuments = (state.includeSampleData ? SAMPLE_DOCUMENTS.length : 0) + urlCount + fileCount + manualCount;

  let tone = "warning";
  let headline = "Add at least two documents to start";
  let detail = "The analysis needs at least two documents. The fastest path is the demo setup or a small file upload set.";

  if (estimatedDocuments >= 2) {
    tone = "ready";
    headline = "Ready to run analysis";
    detail =
      "You have enough source material to run the workflow. The app will start with document-level evaluation, then move into duplicate groups and detailed review surfaces.";
  } else if (estimatedDocuments === 1) {
    headline = "Almost ready";
    detail = "One document is loaded. Add one more source so the rationalization analysis can compare documents meaningfully.";
  }

  return {
    tone,
    headline,
    detail,
    estimatedDocuments,
    sampleEnabled: state.includeSampleData,
    urlCount,
    fileCount,
    manualCount,
  };
}

function renderReadinessCard() {
  const target = document.querySelector("[data-readiness-card]");
  if (!target) {
    return;
  }

  const readiness = computeWorkspaceReadiness();
  target.className = `readiness-card readiness-card--${readiness.tone}`;
  target.innerHTML = `
    <div class="readiness-card__header">
      <strong>${readiness.headline}</strong>
      <span class="doc-badge ${readiness.tone === "ready" ? "doc-badge--ok" : "doc-badge--warn"}">
        ${readiness.estimatedDocuments} estimated doc${readiness.estimatedDocuments === 1 ? "" : "s"}
      </span>
    </div>
    <p>${readiness.detail}</p>
    <ul class="readiness-list">
      <li>Demo library: ${readiness.sampleEnabled ? "included" : "off"}</li>
      <li>URLs loaded: ${readiness.urlCount}</li>
      <li>Files selected: ${readiness.fileCount}</li>
      <li>Manual docs with text: ${readiness.manualCount}</li>
    </ul>
  `;
}

function setActiveSourceTab(tab) {
  state.activeSourceTab = tab;
  document.querySelectorAll("[data-source-tab]").forEach((button) => {
    button.classList.toggle("active", button.getAttribute("data-source-tab") === tab);
  });
  document.querySelectorAll("[data-source-panel]").forEach((panel) => {
    panel.classList.toggle("is-active", panel.getAttribute("data-source-panel") === tab);
  });
}

function renderEmptyResults() {
  const output = document.querySelector("[data-results]");
  output.innerHTML = `
    <section class="results-shell">
      <div class="panel table-panel">
        <div class="empty-state">
          <p class="eyebrow">Ready to analyze</p>
          <h2>Start with the demo or assemble your own document set</h2>
          <p>
            The cleanest path is to load the demo setup, then run the analysis to show the full workflow.
            For real work, add public URLs, uploads, or pasted text and run the same process.
          </p>
          <ol class="empty-state__steps">
            <li>Choose the demo path or add your own sources.</li>
            <li>Adjust the similarity threshold if needed.</li>
            <li>Run the analysis and start with document level evaluation before consolidation review.</li>
          </ol>
        </div>
      </div>
    </section>
  `;
}

function renderStatus(message, tone = "neutral") {
  const status = document.querySelector("[data-status]");
  status.textContent = message;
  status.dataset.tone = tone;
}

export function buildAnalysisProgressView(progress) {
  const sourceParts = [];
  if (progress.sampleCount) {
    sourceParts.push(pluralize(progress.sampleCount, "demo doc"));
  }
  if (progress.manualCount) {
    sourceParts.push(pluralize(progress.manualCount, "pasted doc"));
  }
  if (progress.fileCount) {
    sourceParts.push(pluralize(progress.fileCount, "file"));
  }
  if (progress.urlCount) {
    sourceParts.push(pluralize(progress.urlCount, "URL"));
  }

  const sourceSummary = sourceParts.length ? sourceParts.join(", ") : "no sources";
  const totalStartingSources =
    progress.sampleCount + progress.manualCount + progress.fileCount + progress.urlCount;

  const stepState = (stage) => {
    const order = ["collect", "files", "urls", "analysis", "complete"];
    const currentIndex = order.indexOf(progress.phase);
    const stageIndex = order.indexOf(stage);
    if (stage === "files" && !progress.fileCount) {
      return "skipped";
    }
    if (stage === "urls" && !progress.urlCount) {
      return "skipped";
    }
    if (currentIndex > stageIndex) {
      return "complete";
    }
    if (currentIndex === stageIndex) {
      return "active";
    }
    return "pending";
  };

  const detailByPhase = {
    collect: `Preparing ${pluralize(totalStartingSources, "starting source")} across ${sourceSummary}.`,
    files: progress.fileCount
      ? `Parsing file ${progress.filesProcessed + 1} of ${progress.fileCount}: ${progress.currentFileName || "current file"}`
      : "No files to parse in this run.",
    urls: progress.urlCount
      ? `Fetching URL ${progress.urlsProcessed + 1} of ${progress.urlCount}: ${progress.currentUrlLabel || "current URL"}`
      : "No URLs to fetch in this run.",
    analysis: `Running document-level evaluation and consolidation analysis across ${pluralize(progress.loadedDocumentCount, "document")}.`,
    complete: `Analysis finished for ${pluralize(progress.loadedDocumentCount, "document")}.`,
  };

  return {
    headline:
      progress.phase === "analysis"
        ? "Running rationalization analysis"
        : progress.phase === "urls"
          ? "Fetching URL content"
          : progress.phase === "files"
            ? "Parsing uploaded files"
            : "Preparing analysis",
    detail: detailByPhase[progress.phase] || detailByPhase.collect,
    steps: [
      {
        label: "Gather inputs",
        state: stepState("collect"),
        detail: sourceSummary,
      },
      {
        label: "Parse files",
        state: stepState("files"),
        detail: progress.fileCount
          ? `${progress.filesProcessed}/${progress.fileCount} processed`
          : "No uploaded files",
      },
      {
        label: "Fetch URLs",
        state: stepState("urls"),
        detail: progress.urlCount
          ? `${progress.urlsProcessed}/${progress.urlCount} fetched`
          : "No URLs queued",
      },
      {
        label: "Compute analysis",
        state: stepState("analysis"),
        detail:
          progress.phase === "analysis" || progress.phase === "complete"
            ? `${pluralize(progress.loadedDocumentCount, "document")} ready for scoring`
            : "Waiting for source collection",
      },
    ],
  };
}

function renderProgressStatus(progress) {
  const status = document.querySelector("[data-status]");
  const view = buildAnalysisProgressView(progress);
  status.dataset.tone = "loading";
  status.innerHTML = `
    <div class="status__eyebrow">Analysis in progress</div>
    <strong class="status__headline">${escapeHtml(view.headline)}</strong>
    <p class="status__detail">${escapeHtml(view.detail)}</p>
    <ul class="status__steps">
      ${view.steps
        .map(
          (step) => `
            <li class="status__step status__step--${step.state}">
              <span class="status__step-dot" aria-hidden="true"></span>
              <div>
                <strong>${escapeHtml(step.label)}</strong>
                <span>${escapeHtml(step.detail)}</span>
              </div>
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}

function setAnalysisBusy(isBusy) {
  const selectors = [
    "[data-analyze]",
    "[data-run-demo]",
    "[data-load-sample-urls]",
    "[data-reset-workspace]",
    "[data-source-tab]",
    "#include-sample",
    "#threshold",
    "#threshold-slider",
    "#urls",
    "#files",
    "[data-add-manual]",
    ".manual-card__title",
    ".manual-card__text",
    "[data-remove-manual]",
  ];

  document.querySelectorAll(selectors.join(",")).forEach((node) => {
    node.disabled = isBusy;
  });
}

function formatDeploymentTimestamp(value) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function setDeploymentBadge(label, timestamp) {
  const labelNode = document.querySelector("#deployLabel");
  const timestampNode = document.querySelector("#deployTimestamp");
  if (labelNode) {
    labelNode.textContent = label;
  }
  if (timestampNode) {
    timestampNode.textContent = timestamp;
  }
}

async function loadDeploymentBadge() {
  try {
    const response = await fetch(DEPLOYMENT_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`);
    }

    const payload = await response.json();
    const updatedAt = payload.updated_at || payload.created_at;
    setDeploymentBadge(
      "Last updated:",
      formatDeploymentTimestamp(updatedAt)
    );
  } catch {
    const fallback = document.lastModified
      ? formatDeploymentTimestamp(document.lastModified)
      : "timestamp unavailable";
    setDeploymentBadge("Last updated:", fallback);
  }
}

function loadDemoSetup() {
  const toggle = document.querySelector("#include-sample");
  const urlsField = document.querySelector("#urls");
  toggle.checked = true;
  state.includeSampleData = true;
  urlsField.value = SAMPLE_URLS.join("\n");
  setActiveSourceTab("demo");
  updateSourceSummary();
  renderReadinessCard();
  renderStatus(
    "Demo setup loaded. The sample library is enabled and illustrative sample URLs are ready in the workspace."
  );
}

function resetWorkspace() {
  const toggle = document.querySelector("#include-sample");
  const urlsField = document.querySelector("#urls");
  const filesField = document.querySelector("#files");
  const manualContainer = document.querySelector("[data-manual-documents]");

  toggle.checked = false;
  state.includeSampleData = false;
  urlsField.value = "";
  filesField.value = "";
  manualContainer.innerHTML = "";
  ensureMinimumManualCards();

  state.analysisView.query = "";
  state.analysisView.filter = "all";
  state.analysisView.documents = [];
  state.analysisView.threshold = 0.45;
  state.analysisView.levelOverrides = {};
  state.analysisView.result = null;
  state.analysisView.issues = [];

  setActiveSourceTab("demo");
  updateSourceSummary();
  renderReadinessCard();
  renderEmptyResults();
  renderStatus("Workspace reset. Add demo data or your own documents to begin again.");
}

function renderResults(result, issues) {
  state.analysisView.result = result;
  state.analysisView.issues = issues;
  renderAnalysisView();
}

function renderAnalysisView() {
  const output = document.querySelector("[data-results]");
  const { result, issues, query, filter } = state.analysisView;
  if (!result) {
    output.innerHTML = "";
    return;
  }

  const summary = buildSummary(result);
  const filtered = filterAnalysisView(result, issues, query, filter);
  const levelHtml = buildLevelMarkup(filtered.documents);
  const groupsHtml = buildGroupMarkup(result, filtered.groups);
  const pairsHtml = buildPairMarkup(result, filtered.edges);
  const issuesHtml = buildIssuesMarkup(filtered.issues);
  const documentsHtml = buildDocumentMarkup(filtered.documents);
  const strongestGroup = result.groups[0];
  const strongestCanonical = strongestGroup
    ? result.documents.find((document) => document.id === strongestGroup.recommendedPrimaryId)?.title || "None"
    : "None";
  const viewModel = buildDocumentViewModel(result);
  const kpiCards = [
    {
      label: "Level review",
      value: viewModel.filter((document) => document.documentLevel.levelFit !== "aligned").length,
      filter: "level",
      target: "levelSection",
      tone: "warning",
      helper: "Documents operating at the wrong requirement level.",
    },
    {
      label: "Review flags",
      value: result.groups.filter((group) => groupHasReviewFlags(group)).length,
      filter: "review",
      target: "groupsSection",
      tone: "warning",
      helper: "Groups with mixed level, scope, or procedural concerns.",
    },
    {
      label: "Cleaner fits",
      value: result.groups.filter((group) => !groupHasReviewFlags(group)).length,
      filter: "ready",
      target: "groupsSection",
      tone: "success",
      helper: "Groups that appear cleaner for consolidation review.",
    },
    {
      label: "Ungrouped docs",
      value: viewModel.filter((document) => document.groupLabel === "Ungrouped").length,
      filter: "orphan",
      target: "documentsSection",
      tone: "info",
      helper: "Documents not currently assigned to a duplicate cluster.",
    },
  ];

  output.innerHTML = `
    <section class="results-shell">
      <div class="panel table-panel">
        <div class="results-hero">
          <div>
          <p class="eyebrow">Analysis complete</p>
            <h2>Consolidation candidates and review flags</h2>
            <p class="section-subtitle">
              Strongest canonical candidate: ${strongestCanonical}
            </p>
            <p>${summary}</p>
          </div>
          <div class="snapshot-kpis results-stats">
            ${kpiCards
              .map((card) => buildShortcutCard(card, filter))
              .join("")}
          </div>
        </div>
      </div>

      <section class="panel table-panel" id="analysisExplorer">
        <div class="analysis-controls">
          <div class="search-header">
            <h3>Analysis explorer</h3>
            <div class="search-bar">
              <input
                type="text"
                id="analysisSearch"
                placeholder="Search titles, sources, canonical candidates, or recommendations..."
                autocomplete="off"
                value="${escapeHtml(query)}"
              />
              <span class="search-count">${filtered.groups.length} groups / ${filtered.documents.length} docs</span>
            </div>
          </div>
          <div class="export-actions">
            <button class="ghost-button ghost-button--small" type="button" data-export-format="csv">
              Export CSV
            </button>
            <button class="ghost-button ghost-button--small" type="button" data-export-format="md">
              Export Markdown
            </button>
          </div>
        </div>
        <div class="filter-toolbar">
          <div class="toggle-group" data-filter-group>
            ${buildFilterButton("all", "All", filter)}
            ${buildFilterButton("level", "Level review", filter)}
            ${buildFilterButton("review", "Review flags", filter)}
            ${buildFilterButton("ready", "Cleaner fits", filter)}
            ${buildFilterButton("orphan", "Ungrouped docs", filter)}
          </div>
          <p class="section-subtitle">
            Search and filters update the review surface without rerunning the analysis. Exports reflect the current filtered view.
          </p>
        </div>
      </section>

      <section class="workflow-panel">
        <div class="panel table-panel workflow-intro">
          <div class="results-section-heading">
            <p class="eyebrow">Review sequence</p>
            <h3>Work through the rationalization in order</h3>
            <p class="section-subtitle">Start with document level fit, then move into consolidation candidates, supporting evidence, and import blockers.</p>
          </div>
        </div>

        <article class="workflow-step panel table-panel collapsible" id="levelSection">
          <div class="workflow-step__rail">
            <span class="workflow-step__number">1</span>
            <span class="workflow-step__line" aria-hidden="true"></span>
          </div>
          <div class="workflow-step__content">
            <div class="collapsible-header" data-toggle="levelSection">
              <div class="collapsible-title-group">
                <p class="workflow-step__eyebrow">Step 1</p>
                <h3>Document level evaluation</h3>
                <p class="section-subtitle">Check whether each document is operating at the right level of requirements before consolidation.</p>
              </div>
              <span class="collapse-icon"></span>
            </div>
            <div class="collapsible-body">
              <div class="results-section">
                ${levelHtml}
              </div>
            </div>
          </div>
        </article>

        <article class="workflow-step panel table-panel collapsible" id="groupsSection">
          <div class="workflow-step__rail">
            <span class="workflow-step__number">2</span>
            <span class="workflow-step__line" aria-hidden="true"></span>
          </div>
          <div class="workflow-step__content">
            <div class="collapsible-header" data-toggle="groupsSection">
              <div class="collapsible-title-group">
                <p class="workflow-step__eyebrow">Step 2</p>
                <h3>Consolidation groups</h3>
                <p class="section-subtitle">Review canonical candidates, review checks, and source membership for each duplicate cluster.</p>
              </div>
              <span class="collapse-icon"></span>
            </div>
            <div class="collapsible-body">
              <div class="results-section">
                ${groupsHtml}
              </div>
            </div>
          </div>
        </article>

        <article class="workflow-step panel table-panel collapsible collapsed" id="documentsSection">
          <div class="workflow-step__rail">
            <span class="workflow-step__number">3</span>
            <span class="workflow-step__line" aria-hidden="true"></span>
          </div>
          <div class="workflow-step__content">
            <div class="collapsible-header" data-toggle="documentsSection">
              <div class="collapsible-title-group">
                <p class="workflow-step__eyebrow">Step 3</p>
                <h3>Document review surface</h3>
                <p class="section-subtitle">Browse the analyzed source set with cluster membership and inherited review posture.</p>
              </div>
              <span class="collapse-icon"></span>
            </div>
            <div class="collapsible-body">
              <div class="results-section">
                ${documentsHtml}
              </div>
            </div>
          </div>
        </article>

        <article class="workflow-step panel table-panel collapsible collapsed" id="pairsSection">
          <div class="workflow-step__rail">
            <span class="workflow-step__number">4</span>
            <span class="workflow-step__line" aria-hidden="true"></span>
          </div>
          <div class="workflow-step__content">
            <div class="collapsible-header" data-toggle="pairsSection">
              <div class="collapsible-title-group">
                <p class="workflow-step__eyebrow">Step 4</p>
                <h3>Pair overlap triage</h3>
                <p class="section-subtitle">Use the strongest similarity pairs to spot near-duplicates that may not form a full cluster yet.</p>
              </div>
              <span class="collapse-icon"></span>
            </div>
            <div class="collapsible-body">
              <div class="results-section">
                ${pairsHtml}
              </div>
            </div>
          </div>
        </article>

        <article class="workflow-step workflow-step--last panel table-panel collapsible collapsed" id="issuesSection">
          <div class="workflow-step__rail">
            <span class="workflow-step__number">5</span>
          </div>
          <div class="workflow-step__content">
            <div class="collapsible-header" data-toggle="issuesSection">
              <div class="collapsible-title-group">
                <p class="workflow-step__eyebrow">Step 5</p>
                <h3>Import issues and blockers</h3>
                <p class="section-subtitle">Review CORS, authentication, parsing, and empty-content warnings that could affect confidence in the analysis.</p>
              </div>
              <span class="collapse-icon"></span>
            </div>
            <div class="collapsible-body">
              <div class="results-section">
                ${issuesHtml}
              </div>
            </div>
          </div>
        </article>
      </section>
    </section>
  `;

  wireCollapsibles(output);
  wireResultControls(output);
}

function buildSummary(result) {
  const levelReviewCount = result.documents.filter(
    (document) => document.documentLevel.levelFit !== "aligned"
  ).length;
  if (!result.groups.length) {
    if (!result.edges.length) {
      return `No consolidation cluster cleared the current threshold. ${levelReviewCount ? `${levelReviewCount} document(s) still need level review before consolidation work.` : "The document set may simply be cleanly separated."}`;
    }
    return `A few documents overlap, but they do not yet form a strong duplicate group. ${levelReviewCount ? `${levelReviewCount} document(s) also need level review first.` : "Review the top pairs first and consider lowering the threshold slightly if you want broader clustering."}`;
  }

  const strongest = result.groups[0];
  const primary = result.documents.find((document) => document.id === strongest.recommendedPrimaryId);
  return `${strongest.documentIds.length} documents cluster around ${primary.title} as the strongest canonical candidate. ${levelReviewCount ? `${levelReviewCount} document(s) show possible policy-versus-standard-versus-procedure level issues and should be corrected before consolidation.` : "The recommendation keeps required structure intact and pushes brand scope, regulatory coverage, and procedural content into explicit review checks."}`;
}

function buildLevelMarkup(documents) {
  if (!documents.length) {
    return `<article class="result-card"><p>No documents match the current search and filter.</p></article>`;
  }

  return `
    <article class="result-card">
      <ul class="document-list">
        ${documents
          .map(
            (document) => `
              <li class="document-row">
                <div class="document-row__main">
                  <strong>${document.title}</strong>
                  <span>${document.source}</span>
                  ${document.documentLevel.levelIssues.length ? `<p class="document-note">${document.documentLevel.levelIssues.join("; ")}</p>` : ""}
                </div>
                <div class="document-row__meta">
                  ${buildDocumentTypeOverrideControl(document)}
                  <span class="doc-badge">${document.documentLevel.inferredType}</span>
                  ${document.documentLevel.isOverrideApplied ? `<span class="doc-badge">Manual override</span>` : ""}
                  <span class="doc-badge ${document.documentLevel.levelFit === "aligned" ? "doc-badge--ok" : "doc-badge--warn"}">
                    ${document.documentLevel.levelFit}
                  </span>
                </div>
              </li>
            `
          )
          .join("")}
      </ul>
    </article>
  `;
}

function buildGroupMarkup(result, groups) {
  if (!groups.length) {
    return `<article class="result-card"><p>No duplicate groups were found at the current threshold.</p></article>`;
  }

  return groups
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

function buildPairMarkup(result, edges) {
  if (!edges.length) {
    return `<article class="result-card"><p>No document pairs cleared the threshold.</p></article>`;
  }

  return `
    <article class="result-card">
      <ul class="pair-list">
        ${edges
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

function buildDocumentMarkup(documents) {
  if (!documents.length) {
    return `<article class="result-card"><p>No documents match the current search and filter.</p></article>`;
  }

  return `
    <article class="result-card">
      <ul class="document-list">
        ${documents
          .map(
            (document) => `
              <li class="document-row">
                <div class="document-row__main">
                  <strong>${document.title}</strong>
                  <span>${document.source}</span>
                </div>
                <div class="document-row__meta">
                  ${buildDocumentTypeOverrideControl(document)}
                  <span class="doc-badge">${document.documentLevel.inferredType}</span>
                  ${document.documentLevel.isOverrideApplied ? `<span class="doc-badge">Manual override</span>` : ""}
                  <span class="doc-badge">${document.groupLabel}</span>
                  <span class="doc-badge ${document.needsReview ? "doc-badge--warn" : "doc-badge--ok"}">
                    ${document.needsReview ? "Review flags" : "No major flags"}
                  </span>
                </div>
              </li>
            `
          )
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

function buildDocumentTypeOverrideControl(document) {
  const overrideType = document.documentLevel.overrideType || "";
  const currentLabel = toTitleCase(document.documentLevel.autoInferredType);
  const selectId = `doc-type-${String(document.id).replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return `
    <label class="doc-type-control" for="${selectId}">
      <span class="doc-type-control__label">Review level</span>
      <select
        class="doc-type-select"
        id="${selectId}"
        data-doc-type-select
        data-document-id="${escapeHtml(String(document.id))}"
      >
        <option value="">Auto: ${currentLabel}</option>
        ${DOCUMENT_TYPES.map(
          (type) => `<option value="${type}" ${overrideType === type ? "selected" : ""}>${toTitleCase(type)}</option>`
        ).join("")}
      </select>
    </label>
  `;
}

function formatLabel(value) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (match) => match.toUpperCase());
}

function toTitleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildFilterButton(value, label, activeFilter) {
  const activeClass = value === activeFilter ? "active" : "";
  return `<button class="toggle-btn ${activeClass}" type="button" data-view-filter="${value}">${label}</button>`;
}

function buildShortcutCard(card, activeFilter) {
  const activeClass = activeFilter === card.filter ? "active" : "";
  return `
    <button
      class="panel snapshot-kpi-card snapshot-kpi-card--shortcut ${activeClass}"
      type="button"
      data-kpi-filter="${card.filter}"
      data-kpi-target="${card.target}"
    >
      <span class="snapshot-kpi-label">${card.label}</span>
      <span class="snapshot-kpi-value ${card.tone}">${card.value}</span>
      <span class="snapshot-kpi-helper">${card.helper}</span>
    </button>
  `;
}

function groupHasReviewFlags(group) {
  return (
    group.checks.documentLevelConsistency === "mixed-level" ||
    group.checks.documentLevelFit === "review-needed" ||
    group.checks.brandScopeCoverage === "missing" ||
    group.checks.regulatoryReflection === "missing" ||
    group.checks.proceduralContentDetected === "yes"
  );
}

function buildDocumentViewModel(result) {
  const groupsByDocumentId = new Map();
  for (const group of result.groups) {
    for (const documentId of group.documentIds) {
      groupsByDocumentId.set(documentId, group);
    }
  }

  return result.documents.map((document) => {
    const group = groupsByDocumentId.get(document.id);
    const isCanonical = group && group.recommendedPrimaryId === document.id;
    const needsReview = group ? groupHasReviewFlags(group) : false;
    return {
      ...document,
      groupLabel: group
        ? isCanonical
          ? "Canonical candidate"
          : "Grouped document"
        : "Ungrouped",
      needsReview: group ? needsReview || document.documentLevel.levelFit !== "aligned" : document.documentLevel.levelFit !== "aligned",
      canonicalTitle: group
        ? result.documents.find((candidate) => candidate.id === group.recommendedPrimaryId)?.title || ""
        : "",
    };
  });
}

export function buildExportPayload(result, issues, rawQuery, filter, threshold = 0.45) {
  const filtered = filterAnalysisView(result, issues, rawQuery, filter);
  return {
    createdAt: new Date().toISOString(),
    threshold,
    query: rawQuery.trim(),
    filter,
    summary: buildSummary(result),
    strongestCanonicalTitle:
      result.groups[0] && result.documents.find((document) => document.id === result.groups[0].recommendedPrimaryId)
        ? result.documents.find((document) => document.id === result.groups[0].recommendedPrimaryId).title
        : "None",
    filtered,
  };
}

function csvEscape(value) {
  const stringValue = String(value ?? "");
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

export function buildCsvExport(payload) {
  const rows = [
    [
      "title",
      "source",
      "inferred_type",
      "auto_inferred_type",
      "override_type",
      "level_fit",
      "level_issues",
      "group_label",
      "canonical_title",
      "needs_review",
    ],
  ];

  for (const document of payload.filtered.documents) {
    rows.push([
      document.title,
      document.source,
      document.documentLevel.inferredType,
      document.documentLevel.autoInferredType || document.documentLevel.inferredType,
      document.documentLevel.overrideType || "",
      document.documentLevel.levelFit,
      document.documentLevel.levelIssues.join("; "),
      document.groupLabel || "",
      document.canonicalTitle || "",
      document.needsReview ? "yes" : "no",
    ]);
  }

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function buildMarkdownExport(payload) {
  const lines = [
    "# Policy Rationalization Analysis",
    "",
    `Generated: ${payload.createdAt}`,
    `Similarity threshold: ${payload.threshold.toFixed(2)}`,
    `Active filter: ${payload.filter}`,
    `Search query: ${payload.query || "None"}`,
    "",
    "## Summary",
    "",
    payload.summary,
    "",
    `Strongest canonical candidate: ${payload.strongestCanonicalTitle}`,
    "",
    "## Snapshot",
    "",
    `- Visible duplicate groups: ${payload.filtered.groups.length}`,
    `- Visible documents: ${payload.filtered.documents.length}`,
    `- Visible similarity pairs: ${payload.filtered.edges.length}`,
    `- Visible import issues: ${payload.filtered.issues.length}`,
    "",
    "## Consolidation Groups",
    "",
  ];

  if (!payload.filtered.groups.length) {
    lines.push("No duplicate groups are visible in the current view.", "");
  } else {
    payload.filtered.groups.forEach((group, index) => {
      const groupDocuments = group.documentIds
        .map((id) => payload.filtered.documents.find((document) => document.id === id))
        .filter(Boolean);
      lines.push(`### Group ${index + 1}`);
      lines.push("");
      lines.push(`- Average similarity: ${group.avgInternalSimilarity.toFixed(4)}`);
      lines.push(`- Recommendation: ${group.recommendation}`);
      lines.push(`- Checks: ${Object.entries(group.checks).map(([label, value]) => `${formatLabel(label)} = ${value}`).join("; ")}`);
      lines.push("- Documents:");
      lines.push(...groupDocuments.map((document) => `  - ${document.title} (${document.documentLevel.inferredType})`));
      lines.push("");
    });
  }

  lines.push("## Document Review Surface", "");

  if (!payload.filtered.documents.length) {
    lines.push("No documents are visible in the current view.", "");
  } else {
    payload.filtered.documents.forEach((document) => {
      lines.push(`### ${document.title}`);
      lines.push("");
      lines.push(`- Source: ${document.source}`);
      lines.push(`- Evaluated level: ${document.documentLevel.inferredType}`);
      lines.push(`- Auto-inferred level: ${document.documentLevel.autoInferredType || document.documentLevel.inferredType}`);
      lines.push(`- Manual override: ${document.documentLevel.overrideType || "None"}`);
      lines.push(`- Level fit: ${document.documentLevel.levelFit}`);
      lines.push(`- Group status: ${document.groupLabel || "Ungrouped"}`);
      lines.push(`- Canonical candidate: ${document.canonicalTitle || "None"}`);
      lines.push(`- Review needed: ${document.needsReview ? "Yes" : "No"}`);
      lines.push(`- Level issues: ${document.documentLevel.levelIssues.join("; ") || "None"}`);
      lines.push("");
    });
  }

  lines.push("## Top Similarity Pairs", "");

  if (!payload.filtered.edges.length) {
    lines.push("No similarity pairs are visible in the current view.", "");
  } else {
    payload.filtered.edges.slice(0, 12).forEach((edge) => {
      const left = payload.filtered.documents.find((document) => document.id === edge.leftId);
      const right = payload.filtered.documents.find((document) => document.id === edge.rightId);
      lines.push(`- ${left?.title || edge.leftId} <-> ${right?.title || edge.rightId}: ${edge.score.toFixed(4)}`);
    });
    lines.push("");
  }

  lines.push("## Import Issues", "");
  lines.push(...(payload.filtered.issues.length ? payload.filtered.issues.map((issue) => `- ${issue}`) : ["- None"]));
  lines.push("");

  return lines.join("\n");
}

function sanitizeFileLabel(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "all";
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function matchesSearch(haystacks, query) {
  if (!query) {
    return true;
  }
  return haystacks.some((value) => value.toLowerCase().includes(query));
}

function filterAnalysisView(result, issues, rawQuery, filter) {
  const query = rawQuery.trim().toLowerCase();
  const documents = buildDocumentViewModel(result);
  const visibleDocumentMap = new Map(documents.map((document) => [document.id, document]));

  const filteredGroups = result.groups.filter((group) => {
    const primary = result.documents.find((document) => document.id === group.recommendedPrimaryId);
    const groupReview = groupHasReviewFlags(group);
    const memberDocuments = group.documentIds.map((id) => visibleDocumentMap.get(id)).filter(Boolean);
    const searchMatch = matchesSearch(
      [
        primary?.title || "",
        group.recommendation,
        ...memberDocuments.flatMap((document) => [document.title, document.source]),
      ],
      query
    );
    if (!searchMatch) {
      return false;
    }
    if (filter === "review") {
      return groupReview;
    }
    if (filter === "level") {
      return group.checks.documentLevelConsistency === "mixed-level" || group.checks.documentLevelFit === "review-needed";
    }
    if (filter === "ready") {
      return !groupReview;
    }
    if (filter === "orphan") {
      return false;
    }
    return true;
  });

  const filteredDocuments = documents.filter((document) => {
    const searchMatch = matchesSearch(
      [document.title, document.source, document.groupLabel, document.canonicalTitle],
      query
    );
    if (!searchMatch) {
      return false;
    }
    if (filter === "review") {
      return document.needsReview;
    }
    if (filter === "level") {
      return document.documentLevel.levelFit !== "aligned";
    }
    if (filter === "ready") {
      return document.groupLabel !== "Ungrouped" && !document.needsReview;
    }
    if (filter === "orphan") {
      return document.groupLabel === "Ungrouped";
    }
    return true;
  });

  const filteredDocumentIds = new Set(filteredDocuments.map((document) => document.id));
  const filteredEdges = result.edges.filter(
    (edge) => filteredDocumentIds.has(edge.leftId) && filteredDocumentIds.has(edge.rightId)
  );
  const filteredIssues = issues.filter((issue) => matchesSearch([issue], query));

  return {
    groups: filteredGroups,
    documents: filteredDocuments,
    edges: filteredEdges,
    issues: filteredIssues,
  };
}

function wireCollapsibles(scope) {
  scope.querySelectorAll("[data-toggle]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const id = trigger.getAttribute("data-toggle");
      const section = scope.querySelector(`#${id}`);
      section?.classList.toggle("collapsed");
    });
  });
}

function wireResultControls(scope) {
  const searchInput = scope.querySelector("#analysisSearch");
  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      state.analysisView.query = event.target.value;
      const caret = event.target.selectionStart ?? state.analysisView.query.length;
      renderAnalysisView();
      requestAnimationFrame(() => {
        const nextInput = document.querySelector("#analysisSearch");
        if (!nextInput) {
          return;
        }
        nextInput.focus();
        nextInput.setSelectionRange(caret, caret);
      });
    });
  }

  scope.querySelectorAll("[data-view-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.analysisView.filter = button.getAttribute("data-view-filter");
      renderAnalysisView();
    });
  });

  scope.querySelectorAll("[data-kpi-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextFilter = button.getAttribute("data-kpi-filter");
      const targetId = button.getAttribute("data-kpi-target");
      state.analysisView.query = "";
      state.analysisView.filter = nextFilter;
      renderAnalysisView();
      requestAnimationFrame(() => {
        revealWorkflowSection(targetId);
      });
    });
  });

  scope.querySelectorAll("[data-doc-type-select]").forEach((select) => {
    select.addEventListener("change", (event) => {
      const documentId = event.target.getAttribute("data-document-id");
      const nextType = event.target.value;
      const sectionId = event.target.closest(".collapsible")?.id || "levelSection";
      if (nextType) {
        state.analysisView.levelOverrides[documentId] = nextType;
      } else {
        delete state.analysisView.levelOverrides[documentId];
      }
      rerunAnalysisWithOverrides();
      requestAnimationFrame(() => {
        revealWorkflowSection(sectionId);
        focusDocumentTypeSelect(documentId);
      });
    });
  });

  scope.querySelectorAll("[data-export-format]").forEach((button) => {
    button.addEventListener("click", () => {
      exportCurrentView(button.getAttribute("data-export-format"));
    });
  });
}

function revealWorkflowSection(targetId) {
  const section = document.querySelector(`#${targetId}`);
  if (!section) {
    return;
  }
  section.classList.remove("collapsed");
  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

function focusDocumentTypeSelect(documentId) {
  const select = [...document.querySelectorAll("[data-doc-type-select]")].find(
    (candidate) => candidate.getAttribute("data-document-id") === documentId
  );
  select?.focus();
}

function rerunAnalysisWithOverrides() {
  if (!state.analysisView.documents.length) {
    return;
  }
  const nextResult = analyzeDocuments(
    state.analysisView.documents,
    state.analysisView.threshold,
    state.analysisView.levelOverrides
  );
  state.analysisView.result = nextResult;
  renderAnalysisView();
}

function exportCurrentView(format) {
  if (!state.analysisView.result) {
    return;
  }

  const payload = buildExportPayload(
    state.analysisView.result,
    state.analysisView.issues,
    state.analysisView.query,
    state.analysisView.filter,
    state.analysisView.threshold
  );
  const filterLabel = sanitizeFileLabel(state.analysisView.filter);
  const dateLabel = payload.createdAt.slice(0, 10);

  if (format === "csv") {
    downloadTextFile(
      `policy-rationalization-${dateLabel}-${filterLabel}.csv`,
      buildCsvExport(payload),
      "text/csv;charset=utf-8"
    );
    renderStatus("Exported CSV for the current filtered view.", "success");
    return;
  }

  downloadTextFile(
    `policy-rationalization-${dateLabel}-${filterLabel}.md`,
    buildMarkdownExport(payload),
    "text/markdown;charset=utf-8"
  );
  renderStatus("Exported Markdown summary for the current filtered view.", "success");
}

async function runAnalysis() {
  const threshold = Number(document.querySelector("#threshold").value || "0.45");
  const urlsValue = document.querySelector("#urls").value;
  const fileInput = document.querySelector("#files");
  const manualDocuments = loadManualDocuments();
  const sampleDocuments = state.includeSampleData ? SAMPLE_DOCUMENTS : [];
  const urlCount = urlsValue
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean).length;
  const progress = {
    phase: "collect",
    sampleCount: sampleDocuments.length,
    manualCount: manualDocuments.length,
    fileCount: fileInput.files.length,
    urlCount,
    filesProcessed: 0,
    urlsProcessed: 0,
    currentFileName: "",
    currentUrlLabel: "",
    loadedDocumentCount: sampleDocuments.length + manualDocuments.length,
  };

  setAnalysisBusy(true);
  renderProgressStatus(progress);

  try {
    const issues = [];

    progress.phase = "files";
    renderProgressStatus(progress);
    const fileResult = await loadDocumentsFromFiles(fileInput.files, ({ current, label }) => {
      progress.filesProcessed = current - 1;
      progress.currentFileName = label;
      renderProgressStatus(progress);
    });
    progress.filesProcessed = progress.fileCount;
    progress.loadedDocumentCount += fileResult.documents.length;
    renderProgressStatus(progress);

    progress.phase = "urls";
    renderProgressStatus(progress);
    const urlResult = await loadDocumentsFromUrls(urlsValue, ({ current, label }) => {
      progress.urlsProcessed = current - 1;
      progress.currentUrlLabel = label;
      renderProgressStatus(progress);
    });
    progress.urlsProcessed = urlCount;
    progress.loadedDocumentCount += urlResult.documents.length;
    renderProgressStatus(progress);

    issues.push(...fileResult.issues, ...urlResult.issues);

    const documents = [
      ...sampleDocuments,
      ...manualDocuments,
      ...fileResult.documents,
      ...urlResult.documents,
    ];

    if (documents.length < 2) {
      renderStatus(
        "Add at least two documents. The quickest path is the built-in demo library or a small file upload set.",
        "warning"
      );
      renderEmptyResults();
      return;
    }

    progress.phase = "analysis";
    progress.loadedDocumentCount = documents.length;
    renderProgressStatus(progress);

    state.analysisView.documents = documents;
    state.analysisView.threshold = threshold;
    const validDocumentIds = new Set(documents.map((document) => String(document.id)));
    state.analysisView.levelOverrides = Object.fromEntries(
      Object.entries(state.analysisView.levelOverrides).filter(([documentId]) => validDocumentIds.has(documentId))
    );

    const result = analyzeDocuments(documents, threshold, state.analysisView.levelOverrides);
    state.analysisView.query = "";
    state.analysisView.filter = "all";
    renderResults(result, issues);
    renderStatus(
      `Analyzed ${result.documents.length} documents with a ${threshold.toFixed(2)} similarity threshold.`,
      "success"
    );
  } catch (error) {
    renderStatus(`Analysis could not finish: ${error.message}`, "warning");
  } finally {
    setAnalysisBusy(false);
  }
}

function wireDemoControls() {
  const toggle = document.querySelector("#include-sample");
  const loadUrlsButton = document.querySelector("[data-load-sample-urls]");
  const runDemoButton = document.querySelector("[data-run-demo]");

  toggle.addEventListener("change", () => {
    state.includeSampleData = toggle.checked;
    updateSourceSummary();
    renderReadinessCard();
  });

  loadUrlsButton.addEventListener("click", () => {
    loadDemoSetup();
  });

  runDemoButton.addEventListener("click", async () => {
    loadDemoSetup();
    await runAnalysis();
  });
}

function wireForm() {
  document.querySelector("[data-analyze]").addEventListener("click", async (event) => {
    event.preventDefault();
    await runAnalysis();
  });

  document.querySelector("[data-reset-workspace]").addEventListener("click", () => {
    resetWorkspace();
  });
}

function wireSourceTabs() {
  document.querySelectorAll("[data-source-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveSourceTab(button.getAttribute("data-source-tab"));
    });
  });

  document.querySelector("#urls").addEventListener("input", () => {
    updateSourceSummary();
    renderReadinessCard();
  });

  document.querySelector("#files").addEventListener("change", () => {
    updateSourceSummary();
    renderReadinessCard();
  });

  document.querySelector("[data-manual-documents]").addEventListener("input", () => {
    updateSourceSummary();
    renderReadinessCard();
  });
}

function initialize() {
  setupManualDocuments();
  wireDemoControls();
  wireForm();
  wireSourceTabs();
  setActiveSourceTab(state.activeSourceTab);
  updateSourceSummary();
  renderReadinessCard();
  void loadDeploymentBadge();
  renderEmptyResults();
  renderStatus("Ready. Load the demo library, upload files, paste URLs, or add manual documents.");
}

if (typeof document !== "undefined") {
  initialize();
}
