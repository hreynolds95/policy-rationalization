import {
  DOCUMENT_TYPES,
  analyzeDocuments,
  extractTextFromHtml,
  isGoogleAuthPage,
  normalizeGoogleExportUrl,
  parseCsv,
} from "./analysis.mjs";
import { runRedlineCompare } from "./redline.mjs";
import { SAMPLE_DOCUMENTS, SAMPLE_URLS } from "./sample-data.mjs";

const SESSION_STORAGE_KEY = "policy-rationalization-wizard-state-v2";
const STATIC_LAST_UPDATED = "Apr 27, 2026, 5:52 PM EDT";
const WORKFLOW_SEQUENCE = [
  "levelSection",
  "groupsSection",
  "documentsSection",
  "pairsSection",
  "issuesSection",
];
const DEFAULT_MANUAL_ENTRIES = [
  { title: "", text: "" },
  { title: "", text: "" },
];
const SOURCE_TABS = ["urls", "files", "manual"];
const WIZARD_ROUTES = [
  {
    id: "sources",
    hash: "#/sources",
    step: "Step 1",
    title: "Load sources",
    subtitle: "Assemble the document set, tune the threshold, and run the analysis.",
  },
  {
    id: "level-review",
    hash: "#/level-review",
    step: "Step 2",
    title: "Review requirement inventory",
    subtitle: "Confirm the extracted requirement units before moving into mapping and consolidation review.",
  },
  {
    id: "groups",
    hash: "#/groups",
    step: "Step 3",
    title: "Review requirement mapping",
    subtitle: "Review requirement-to-requirement matches, 1:1 conflicts, hierarchy watch-outs, and redline previews.",
  },
  {
    id: "details",
    hash: "#/details",
    step: "Step 4",
    title: "Review supporting detail",
    subtitle: "Inspect the analyzed documents and highest-overlap requirement pairs.",
  },
  {
    id: "export",
    hash: "#/export",
    step: "Step 5",
    title: "Export and wrap up",
    subtitle: "Capture the current review view, note import blockers, and share the output with stakeholders.",
  },
];

const state = {
  route: "sources",
  includeSampleData: false,
  activeSourceTab: "urls",
  isBusy: false,
  workspace: {
    urlsText: "",
    uploadedFiles: [],
    manualEntries: cloneManualEntries(DEFAULT_MANUAL_ENTRIES),
  },
  analysisView: {
    query: "",
    filter: "all",
    documents: [],
    threshold: 0.45,
    levelOverrides: {},
    usedSampleData: false,
    result: null,
    issues: [],
  },
};

function cloneManualEntries(entries) {
  return (entries || []).map((entry) => ({
    title: entry?.title || "",
    text: entry?.text || "",
  }));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function encodeUrlParam(value) {
  return encodeURIComponent(String(value ?? ""));
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

function normalizeManualEntries(entries) {
  const normalized = cloneManualEntries(entries);
  while (normalized.length < 2) {
    normalized.push({ title: "", text: "" });
  }
  return normalized;
}

function normalizeSourceTab(tab) {
  return SOURCE_TABS.includes(tab) ? tab : "urls";
}

function countUrlEntries(text = state.workspace.urlsText) {
  return text
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean).length;
}

function countManualEntries(entries = state.workspace.manualEntries) {
  return entries.filter((entry) => entry.text.trim()).length;
}

function getWizardRoute(routeId) {
  return WIZARD_ROUTES.find((route) => route.id === routeId) || WIZARD_ROUTES[0];
}

function getRouteHash(routeId) {
  return getWizardRoute(routeId).hash;
}

function getRouteIdFromHash(hash) {
  return WIZARD_ROUTES.find((route) => route.hash === hash)?.id || "sources";
}

function getHasAnalysis() {
  return Boolean(state.analysisView.result);
}

function ensureAccessibleRoute(routeId) {
  if (routeId === "sources") {
    return routeId;
  }
  return getHasAnalysis() ? routeId : "sources";
}

function persistState() {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  const payload = {
    route: state.route,
    includeSampleData: state.includeSampleData,
    activeSourceTab: state.activeSourceTab,
    workspace: {
      urlsText: state.workspace.urlsText,
      uploadedFiles: state.workspace.uploadedFiles,
      manualEntries: state.workspace.manualEntries,
    },
    analysisView: {
      query: state.analysisView.query,
      filter: state.analysisView.filter,
      documents: state.analysisView.documents,
      threshold: state.analysisView.threshold,
      levelOverrides: state.analysisView.levelOverrides,
      usedSampleData: state.analysisView.usedSampleData,
      result: state.analysisView.result,
      issues: state.analysisView.issues,
    },
  };
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures.
  }
}

function restoreState() {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    state.route = ensureAccessibleRoute(parsed.route || "sources");
    state.includeSampleData = Boolean(parsed.includeSampleData);
    state.activeSourceTab = normalizeSourceTab(parsed.activeSourceTab);
    state.workspace.urlsText = parsed.workspace?.urlsText || "";
    state.workspace.uploadedFiles = Array.isArray(parsed.workspace?.uploadedFiles)
      ? parsed.workspace.uploadedFiles.map((file) => ({
          name: file?.name || "uploaded.txt",
          text: file?.text || "",
        }))
      : [];
    state.workspace.manualEntries = normalizeManualEntries(parsed.workspace?.manualEntries || DEFAULT_MANUAL_ENTRIES);
    state.analysisView.query = parsed.analysisView?.query || "";
    state.analysisView.filter = parsed.analysisView?.filter || "all";
    state.analysisView.documents = Array.isArray(parsed.analysisView?.documents)
      ? parsed.analysisView.documents
      : [];
    state.analysisView.threshold = Number(parsed.analysisView?.threshold || 0.45);
    state.analysisView.levelOverrides = parsed.analysisView?.levelOverrides || {};
    state.analysisView.usedSampleData = Boolean(parsed.analysisView?.usedSampleData);
    state.analysisView.result = parsed.analysisView?.result || null;
    state.analysisView.issues = Array.isArray(parsed.analysisView?.issues) ? parsed.analysisView.issues : [];
  } catch {
    // Ignore corrupted session state and fall back to defaults.
  }
}

function buildSourceSummaryMarkup() {
  const fileCount = state.workspace.uploadedFiles.length;
  const urlCount = countUrlEntries();
  const manualCount = countManualEntries();
  const sampleEnabled = state.includeSampleData;

  const chips = [
    `<span class="source-chip ${sampleEnabled ? "source-chip--active" : ""}">Demo library ${sampleEnabled ? "on" : "off"}</span>`,
    `<span class="source-chip ${urlCount ? "source-chip--active" : ""}">${urlCount} URL${urlCount === 1 ? "" : "s"}</span>`,
    `<span class="source-chip ${fileCount ? "source-chip--active" : ""}">${fileCount} staged file${fileCount === 1 ? "" : "s"}</span>`,
    `<span class="source-chip ${manualCount ? "source-chip--active" : ""}">${manualCount} pasted doc${manualCount === 1 ? "" : "s"}</span>`,
  ];

  return chips.join("");
}

export function buildDemoBannerContent(sampleCount, context = "workspace") {
  const descriptor =
    context === "results"
      ? "The current analysis includes illustrative demo content."
      : "Demo mode is active in this workspace.";

  return {
    title: "Demo mode",
    body: `${descriptor} Built-in sample documents and example URLs are intended for walkthroughs and quick feedback, not policy decisions.`,
    detail: `${pluralize(sampleCount, "sample document")} available in the bundled library.`,
  };
}

function buildDemoBannerMarkup(context = "workspace") {
  if (!state.includeSampleData && context === "workspace") {
    return "";
  }
  if (!state.analysisView.usedSampleData && context === "results") {
    return "";
  }
  const banner = buildDemoBannerContent(SAMPLE_DOCUMENTS.length, context);
  return `
    <div class="demo-banner ${context === "results" ? "demo-banner--results" : ""}">
      <p class="demo-banner__eyebrow">${banner.title}</p>
      <strong>${banner.body}</strong>
      <span>${banner.detail}</span>
    </div>
  `;
}

export function buildWorkflowStepStates(currentStepId = "levelSection") {
  const fallbackStep = WORKFLOW_SEQUENCE.includes(currentStepId) ? currentStepId : WORKFLOW_SEQUENCE[0];
  const activeIndex = WORKFLOW_SEQUENCE.indexOf(fallbackStep);

  return Object.fromEntries(
    WORKFLOW_SEQUENCE.map((stepId, index) => [
      stepId,
      index < activeIndex ? "complete" : index === activeIndex ? "current" : "upcoming",
    ])
  );
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

function setStatusShellVisibility(isVisible) {
  const shell = document.querySelector("[data-status-shell]");
  if (!shell) {
    return;
  }
  shell.hidden = !isVisible;
}

function loadDeploymentBadge() {
  const pageTimestamp = typeof document !== "undefined" && document.lastModified
    ? formatDeploymentTimestamp(document.lastModified)
    : "";
  setDeploymentBadge("Last updated:", pageTimestamp || STATIC_LAST_UPDATED || "timestamp unavailable");
}

function computeWorkspaceReadiness() {
  const urlCount = countUrlEntries();
  const fileCount = state.workspace.uploadedFiles.length;
  const manualCount = countManualEntries();
  const estimatedDocuments = (state.includeSampleData ? SAMPLE_DOCUMENTS.length : 0) + urlCount + fileCount + manualCount;

  let tone = "warning";
  let headline = "Add at least two documents to start";
  let detail = "The analysis needs at least two documents. The fastest path is the demo setup or a small file upload set.";

  if (estimatedDocuments >= 2) {
    tone = "ready";
    headline = "Ready to run analysis";
    detail =
      "You have enough source material to run the workflow. The app will move from source intake into one focused review page at a time.";
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

function buildRunPanelMarkup() {
  const readiness = computeWorkspaceReadiness();
  return `
    <div class="run-panel run-panel--${readiness.tone}">
      <div class="run-panel__header">
        <div>
          <p class="eyebrow">Ready check</p>
          <strong>${readiness.headline}</strong>
        </div>
        <span class="doc-badge ${readiness.tone === "ready" ? "doc-badge--ok" : "doc-badge--warn"}">
          ${readiness.estimatedDocuments} estimated doc${readiness.estimatedDocuments === 1 ? "" : "s"}
        </span>
      </div>
      <p class="run-panel__detail">${readiness.detail}</p>
      <div class="run-panel__metrics">
        <span class="source-chip ${readiness.sampleEnabled ? "source-chip--active" : ""}">Demo ${readiness.sampleEnabled ? "on" : "off"}</span>
        <span class="source-chip ${readiness.urlCount ? "source-chip--active" : ""}">${readiness.urlCount} URL${readiness.urlCount === 1 ? "" : "s"}</span>
        <span class="source-chip ${readiness.fileCount ? "source-chip--active" : ""}">${readiness.fileCount} file${readiness.fileCount === 1 ? "" : "s"}</span>
        <span class="source-chip ${readiness.manualCount ? "source-chip--active" : ""}">${readiness.manualCount} pasted</span>
      </div>
      <div class="run-panel__controls">
        <button class="primary-button" type="button" data-analyze>${readiness.estimatedDocuments >= 2 ? "Analyze and continue" : "Analyze document set"}</button>
        <button class="ghost-button" type="button" data-reset-workspace>Reset inputs</button>
      </div>
    </div>
  `;
}

function renderStatus(message, tone = "neutral") {
  const status = document.querySelector("[data-status]");
  if (!status) {
    return;
  }
  if (!message) {
    status.textContent = "";
    delete status.dataset.tone;
    setStatusShellVisibility(false);
    return;
  }
  status.textContent = message;
  status.dataset.tone = tone;
  setStatusShellVisibility(true);
}

function renderProgressStatus(progress) {
  const status = document.querySelector("[data-status]");
  if (!status) {
    return;
  }
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
  setStatusShellVisibility(true);
}

function buildManualCardsMarkup() {
  return normalizeManualEntries(state.workspace.manualEntries)
    .map(
      (entry, index) => `
        <article class="manual-card">
          <div class="manual-card__header">
            <input
              class="manual-card__title"
              type="text"
              placeholder="Document title"
              value="${escapeHtml(entry.title)}"
              data-manual-title
              data-manual-index="${index}"
            >
            <button
              class="ghost-button ghost-button--small"
              type="button"
              data-remove-manual
              data-manual-index="${index}"
            >Remove</button>
          </div>
          <textarea
            class="manual-card__text"
            rows="7"
            placeholder="Paste policy or standard text here"
            data-manual-text
            data-manual-index="${index}"
          >${escapeHtml(entry.text)}</textarea>
        </article>
      `
    )
    .join("");
}

function buildUploadedFilesMarkup() {
  if (!state.workspace.uploadedFiles.length) {
    return `<p class="hint">No uploaded files are currently staged.</p>`;
  }

  return `
    <ul class="source-list staged-file-list">
      ${state.workspace.uploadedFiles
        .map(
          (file) => `
            <li>
              <strong>${escapeHtml(file.name)}</strong>
              <span>Loaded into this review session</span>
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}

function buildStartPathMarkup() {
  const readiness = computeWorkspaceReadiness();
  const hasLiveInputs = readiness.urlCount || readiness.fileCount || readiness.manualCount;

  return `
    <div class="wizard-grid wizard-grid--source-start">
      <section class="panel table-panel start-path-card ${state.includeSampleData ? "start-path-card--active" : ""}">
        <div class="start-path-card__header">
          <div>
            <p class="eyebrow">Path A</p>
            <h3>Walk through the demo</h3>
          </div>
          <span class="doc-badge ${state.includeSampleData ? "doc-badge--ok" : ""}">
            ${state.includeSampleData ? "Demo ready" : "Fastest setup"}
          </span>
        </div>
        <p class="section-subtitle">Use the bundled sample library and example URLs to show the full guided review flow to stakeholders quickly.</p>
        <div class="flow-card flow-card--compact">
          <strong>Best for first-time reviewers</strong>
          <p>Run a clean walkthrough without collecting source material first.</p>
        </div>
        <div class="control-row">
          <button class="ghost-button" type="button" data-load-demo>Load demo setup</button>
          <button class="primary-button" type="button" data-run-demo>Run demo analysis</button>
        </div>
        <label class="toggle start-path-card__toggle">
          <input type="checkbox" data-include-sample ${state.includeSampleData ? "checked" : ""}>
          Keep the built-in demo library included
        </label>
      </section>

      <section class="panel table-panel start-path-card ${hasLiveInputs ? "start-path-card--active" : ""}">
        <div class="start-path-card__header">
          <div>
            <p class="eyebrow">Path B</p>
            <h3>Review real documents</h3>
          </div>
          <span class="doc-badge ${hasLiveInputs ? "doc-badge--ok" : ""}">
            ${hasLiveInputs ? "Inputs started" : "Bring your own sources"}
          </span>
        </div>
        <p class="section-subtitle">Assemble a real review set from public URLs, exported files, or pasted document text. All source types combine into one analysis run.</p>
        <div class="source-summary start-path-card__summary">${buildSourceSummaryMarkup()}</div>
        <div class="control-row control-row--wrap">
          <button class="ghost-button" type="button" data-source-tab-jump="urls">Add URLs</button>
          <button class="ghost-button" type="button" data-source-tab-jump="files">Stage files</button>
          <button class="ghost-button" type="button" data-source-tab-jump="manual">Paste text</button>
        </div>
      </section>
    </div>
  `;
}

function buildSourceHelpMarkup() {
  return `
    <details class="help-disclosure">
      <summary>Need help choosing a source type?</summary>
      <div class="help-disclosure__body">
        <ul class="help-disclosure__list">
          <li><strong>URLs:</strong> best for public Google exports or web pages that can be fetched directly in the browser.</li>
          <li><strong>Files:</strong> best for exported TXT, MD, or CSV source material when a document is private or blocked.</li>
          <li><strong>Manual:</strong> best for quick copy/paste review or small excerpts you want to compare immediately.</li>
        </ul>
      </div>
    </details>
  `;
}

function buildSourcesStepMarkup() {
  const route = getWizardRoute("sources");
  const hasAnalysis = getHasAnalysis();
  return `
    <section class="wizard-step-page">
      <div class="wizard-step-page__header">
        <p class="eyebrow">${route.step}</p>
        <h2>${route.title}</h2>
        <p class="section-subtitle">Choose a starting path, assemble the source set, then run the analysis to unlock the review pages.</p>
      </div>

      ${buildDemoBannerMarkup("workspace")}
      <div data-start-path-live>${buildStartPathMarkup()}</div>

      <div class="wizard-grid wizard-grid--sources">
        <section class="panel table-panel">
          <div class="step-card-header">
            <h3>Source intake workspace</h3>
            <p class="section-subtitle">Use one or more source types below. Everything loaded here rolls into the same review session.</p>
          </div>
          ${buildSourceHelpMarkup()}
          <div class="workspace-switcher">
            <div class="toggle-group toggle-group--full">
              <button class="toggle-btn ${state.activeSourceTab === "urls" ? "active" : ""}" type="button" data-source-tab="urls">URLs</button>
              <button class="toggle-btn ${state.activeSourceTab === "files" ? "active" : ""}" type="button" data-source-tab="files">Files</button>
              <button class="toggle-btn ${state.activeSourceTab === "manual" ? "active" : ""}" type="button" data-source-tab="manual">Manual</button>
            </div>
            <div class="source-summary" data-source-summary-live>${buildSourceSummaryMarkup()}</div>
          </div>

          <div class="source-panel ${state.activeSourceTab === "urls" ? "is-active" : ""}">
            <p class="eyebrow">URL imports</p>
            <h3>Paste URLs to public exports or pages</h3>
            <div class="field">
              <label for="urlsText">One URL per line</label>
              <textarea id="urlsText" data-urls-input placeholder="https://example.com/policy-a&#10;https://docs.google.com/document/d/.../edit">${escapeHtml(state.workspace.urlsText)}</textarea>
            </div>
          </div>

          <div class="source-panel ${state.activeSourceTab === "files" ? "is-active" : ""}">
            <p class="eyebrow">File imports</p>
            <h3>Stage exported source material</h3>
            <div class="field">
              <label for="sourceFiles">Accepted file types</label>
              <input id="sourceFiles" type="file" accept=".txt,.md,.markdown,.csv" multiple data-source-files>
            </div>
            <div class="control-row">
              <button class="ghost-button ghost-button--small" type="button" data-clear-files ${state.workspace.uploadedFiles.length ? "" : "disabled"}>Clear staged files</button>
            </div>
            ${buildUploadedFilesMarkup()}
          </div>

          <div class="source-panel ${state.activeSourceTab === "manual" ? "is-active" : ""}">
            <p class="eyebrow">Manual paste</p>
            <h3>Add documents directly</h3>
            <div class="manual-stack">${buildManualCardsMarkup()}</div>
            <div class="control-row">
              <button class="ghost-button" type="button" data-add-manual>Add another document</button>
            </div>
          </div>
        </section>

        <section class="panel table-panel">
          <div class="step-card-header">
            <h3>Run and continue</h3>
            <p class="section-subtitle">Check readiness, tune the threshold, then start the analysis when the source set is ready.</p>
          </div>

          <div data-run-panel-live>${buildRunPanelMarkup()}</div>

          <div class="field">
            <label for="thresholdSlider">Similarity threshold</label>
            <div class="threshold-row">
              <input id="thresholdSlider" type="range" min="0.2" max="0.9" step="0.01" value="${state.analysisView.threshold.toFixed(2)}" data-threshold-slider>
              <input id="thresholdInput" type="number" min="0.2" max="0.9" step="0.01" value="${state.analysisView.threshold.toFixed(2)}" data-threshold-input>
            </div>
            <details class="help-disclosure help-disclosure--compact">
              <summary>Threshold guidance</summary>
              <div class="help-disclosure__body">
                Lower values broaden clustering. Higher values keep only stronger near-duplicates.
              </div>
            </details>
          </div>

          ${hasAnalysis ? `
            <div class="flow-card flow-card--compact">
              <strong>Last analysis is ready</strong>
              <p>${pluralize(state.analysisView.result.documents.length, "document")} analyzed with a ${state.analysisView.threshold.toFixed(2)} similarity threshold.</p>
              <div class="control-row">
                <button class="primary-button" type="button" data-route="level-review">Continue to Step 2</button>
              </div>
            </div>
          ` : ""}
        </section>
      </div>

      ${buildStepFooter("sources")}
    </section>
  `;
}

function buildStepHero(routeId, context) {
  const route = getWizardRoute(routeId);
  const subtitle = routeId === "sources" ? route.subtitle : "";
  return `
    <div class="wizard-step-page__header">
      <p class="eyebrow">${route.step}</p>
      <h2>${route.title}</h2>
      ${subtitle ? `<p class="section-subtitle">${subtitle}</p>` : ""}
      ${context || ""}
    </div>
  `;
}

function buildAnalysisSummaryMarkup() {
  const result = state.analysisView.result;
  const summary = buildSummary(result);
  const strongestGroup = result.requirementGroups[0];
  const mappedRequirementCount = new Set(
    result.requirementGroups.flatMap((group) => group.requirementIds)
  ).size;
  const unmappedRequirementCount = Math.max(0, result.requirements.length - mappedRequirementCount);
  const hierarchyReviewCount = result.requirements.filter(
    (requirement) => requirement.hierarchyReview.alignment !== "aligned"
  ).length;
  const strongestCanonical = strongestGroup
    ? result.requirements.find((requirement) => requirement.requirementId === strongestGroup.recommendedPrimaryRequirementId)?.sourceDocumentTitle || "None"
    : "None";
  return `
    ${buildDemoBannerMarkup("results")}
    <div class="panel table-panel summary-strip">
      <div class="review-context">
        <div class="review-context__copy">
          <p class="eyebrow">Review context</p>
          <p class="review-context__summary">${summary}</p>
        </div>
        <div class="review-context__meta">
          <span class="source-chip source-chip--active">Canonical: ${escapeHtml(strongestCanonical)}</span>
          <span class="doc-badge">Docs ${result.documents.length}</span>
          <span class="doc-badge">Reqs ${result.requirements.length}</span>
          <span class="doc-badge doc-badge--ok">Mapped ${mappedRequirementCount}</span>
          <span class="doc-badge ${unmappedRequirementCount ? "doc-badge--warn" : "doc-badge--ok"}">Unmapped ${unmappedRequirementCount}</span>
          <span class="doc-badge ${hierarchyReviewCount ? "doc-badge--warn" : "doc-badge--ok"}">Hierarchy ${hierarchyReviewCount}</span>
          <span class="doc-badge doc-badge--warn">Pairs ${result.requirementEdges.length}</span>
          <span class="doc-badge doc-badge--ok">Groups ${result.requirementGroups.length}</span>
        </div>
      </div>
    </div>
  `;
}

function buildHierarchyReferenceMarkup() {
  return `
    <section class="panel table-panel">
      <div class="step-card-header">
        <h3>Policy on policies hierarchy</h3>
        <p class="section-subtitle">Requirement review is anchored to the expected document structure before any consolidation recommendation is treated as clean.</p>
      </div>
      <div class="check-grid">
        <div class="check">
          <span class="check__label">Policy</span>
          <strong class="check__value">High-level intent and binding requirements</strong>
        </div>
        <div class="check">
          <span class="check__label">Standard</span>
          <strong class="check__value">Control detail and minimum requirements beneath policy</strong>
        </div>
        <div class="check">
          <span class="check__label">Procedure</span>
          <strong class="check__value">Step-based execution content and out of scope for Policy Team artifacts</strong>
        </div>
      </div>
      <p class="document-note">Direct policy-to-procedure mapping, procedure-heavy policy text, and standard or procedure language embedded in the wrong level are flagged for review.</p>
    </section>
  `;
}

function buildLevelReviewStepMarkup() {
  const requirementInventoryHtml = buildRequirementInventoryMarkup(state.analysisView.result.documents);
  return `
    <section class="wizard-step-page">
      ${buildStepHero("level-review")}
      ${buildAnalysisSummaryMarkup()}
      ${buildHierarchyReferenceMarkup()}
      <section class="panel table-panel">
        <div class="step-card-header">
          <h3>Requirement inventory</h3>
          <p class="section-subtitle">Review the extracted requirement units and source anchors before moving into mapping and consolidation.</p>
        </div>
        <div class="results-section">${requirementInventoryHtml}</div>
      </section>
      ${buildStepFooter("level-review")}
    </section>
  `;
}

function buildGroupsStepMarkup() {
  const groupsHtml = buildRequirementGroupMarkup(state.analysisView.result, state.analysisView.result.requirementGroups);
  return `
    <section class="wizard-step-page">
      ${buildStepHero("groups")}
      ${buildAnalysisSummaryMarkup()}
      <section class="panel table-panel">
        <div class="step-card-header">
          <h3>Requirement mapping groups</h3>
          <p class="section-subtitle">Review cross-document requirement matches, 1:1 mapping conflicts, hierarchy watch-outs, and inline redline proposals.</p>
        </div>
        <div class="results-section">${groupsHtml}</div>
      </section>
      ${buildStepFooter("groups")}
    </section>
  `;
}

function buildDetailsStepMarkup() {
  const filtered = filterAnalysisView(
    state.analysisView.result,
    state.analysisView.issues,
    state.analysisView.query,
    state.analysisView.filter
  );
  const documentsHtml = buildDocumentMarkup(filtered.documents);
  const pairsHtml = buildPairMarkup(state.analysisView.result, filtered.edges);

  return `
    <section class="wizard-step-page">
      ${buildStepHero("details")}
      ${buildAnalysisSummaryMarkup()}
      <section class="panel table-panel">
        <div class="review-toolbar">
          <div class="search-bar review-toolbar__search">
            <input
              type="text"
              id="analysisSearch"
              placeholder="Search requirement text, source sections, document titles, or canonical candidates..."
              autocomplete="off"
              value="${escapeHtml(state.analysisView.query)}"
            >
          </div>
          <span class="doc-badge">${filtered.documents.length} docs / ${filtered.requirements.length} reqs / ${filtered.edges.length} pairs</span>
        </div>
        <div class="filter-toolbar">
          <div class="toggle-group" data-filter-group>
            ${buildFilterButton("all", "All", state.analysisView.filter)}
            ${buildFilterButton("level", "Hierarchy review", state.analysisView.filter)}
            ${buildFilterButton("review", "Conflict flags", state.analysisView.filter)}
            ${buildFilterButton("ready", "Clean mappings", state.analysisView.filter)}
            ${buildFilterButton("orphan", "Unmapped docs", state.analysisView.filter)}
          </div>
        </div>
      </section>
      <div class="review-stack">
        <section class="panel table-panel">
          <div class="step-card-header">
            <h3>Analyzed documents</h3>
            <p class="section-subtitle">Cluster membership and review posture.</p>
          </div>
          <div class="results-section">${documentsHtml}</div>
        </section>
        <section class="panel table-panel">
          <div class="step-card-header">
            <h3>Top similarity pairs</h3>
            <p class="section-subtitle">High-overlap pairs that may not form a full cluster yet.</p>
          </div>
          <div class="results-section">${pairsHtml}</div>
        </section>
      </div>
      ${buildStepFooter("details")}
    </section>
  `;
}

function buildExportStepMarkup() {
  const filtered = filterAnalysisView(
    state.analysisView.result,
    state.analysisView.issues,
    state.analysisView.query,
    state.analysisView.filter
  );
  const issuesHtml = buildIssuesMarkup(filtered.issues);
  const viewLabel = state.analysisView.filter === "all" ? "All results" : `${state.analysisView.filter} filter`;
  return `
    <section class="wizard-step-page">
      ${buildStepHero("export")}
      <section class="panel table-panel export-finish-card">
        <div class="step-card-header">
          <h3>Download current review view</h3>
          <p class="section-subtitle">Exports include the current view, reviewer overrides, and visible issues from this session.</p>
        </div>
        <div class="export-finish-card__meta">
          <span class="source-chip source-chip--active">${escapeHtml(viewLabel)}</span>
          ${state.analysisView.query ? `<span class="source-chip source-chip--active">Search: ${escapeHtml(state.analysisView.query)}</span>` : ""}
          <span class="doc-badge">Docs ${filtered.documents.length}</span>
          <span class="doc-badge doc-badge--warn">Issues ${filtered.issues.length}</span>
        </div>
        <div class="control-row">
          <button class="primary-button" type="button" data-export-format="csv">Export CSV</button>
          <button class="ghost-button" type="button" data-export-format="md">Export Markdown</button>
        </div>
      </section>

      <section class="panel table-panel">
        <div class="step-card-header">
          <h3>Issues and blockers</h3>
          <p class="section-subtitle">Warnings to review before sharing the output.</p>
        </div>
        <div class="results-section">${issuesHtml}</div>
      </section>
    </section>
  `;
}

function buildStepFooter(routeId) {
  if (routeId === "sources" || routeId === "export") {
    return "";
  }

  const currentIndex = WIZARD_ROUTES.findIndex((route) => route.id === routeId);
  const previousRoute = currentIndex > 0 ? WIZARD_ROUTES[currentIndex - 1] : null;
  const nextRoute = currentIndex < WIZARD_ROUTES.length - 1 ? WIZARD_ROUTES[currentIndex + 1] : null;
  const canContinue = Boolean(nextRoute);

  return `
    <footer class="wizard-footer">
      <div>
        ${previousRoute ? `<button class="ghost-button" type="button" data-route="${previousRoute.id}">Back</button>` : ""}
      </div>
      <div class="wizard-footer__meta">${getWizardRoute(routeId).step} of ${WIZARD_ROUTES.length}</div>
      <div>
        ${canContinue && nextRoute ? `<button class="primary-button" type="button" data-route="${nextRoute.id}">Next</button>` : ""}
      </div>
    </footer>
  `;
}

function buildWizardRouteStates() {
  const currentIndex = WIZARD_ROUTES.findIndex((route) => route.id === state.route);
  const hasAnalysis = getHasAnalysis();

  return Object.fromEntries(
    WIZARD_ROUTES.map((route, index) => {
      if (route.id !== "sources" && !hasAnalysis) {
        return [route.id, "locked"];
      }
      if (index < currentIndex) {
        return [route.id, "complete"];
      }
      if (index === currentIndex) {
        return [route.id, "current"];
      }
      return [route.id, "upcoming"];
    })
  );
}

function renderProgressHeader() {
  const target = document.querySelector("[data-step-progress]");
  if (!target) {
    return;
  }
  const routeStates = buildWizardRouteStates();
  target.innerHTML = `
    <div class="wizard-progress-header">
      <div class="wizard-progress-copy">
        <p class="eyebrow">Guided review flow</p>
        <h2>Five-step review</h2>
        <p class="section-subtitle">Only the current step asks for action.</p>
      </div>
      <nav class="wizard-route-list" aria-label="Wizard progress">
        ${WIZARD_ROUTES.map((route, index) => {
          const stateLabel = routeStates[route.id];
          const isCurrent = stateLabel === "current";
          const disabled = stateLabel === "locked" || state.isBusy;
          if (isCurrent) {
            const currentLabel =
              route.id === "sources" && isSourcesWorkspaceEmpty()
                ? "Load demo setup"
                : "Current";
            return `
              <button
                class="wizard-route wizard-route--${stateLabel}"
                type="button"
                data-current-route="true"
                data-scroll-current="true"
                aria-current="step"
                ${state.isBusy ? "disabled" : ""}
              >
                <span class="wizard-route__number">${index + 1}</span>
                <span class="wizard-route__text">
                  <strong>${route.title}</strong>
                  <span>${currentLabel}</span>
                </span>
              </button>
            `;
          }
          return `
            <button
              class="wizard-route wizard-route--${stateLabel}"
              type="button"
              data-route="${route.id}"
              ${disabled ? "disabled" : ""}
            >
              <span class="wizard-route__number">${index + 1}</span>
              <span class="wizard-route__text">
                <strong>${route.title}</strong>
                <span>${stateLabel === "locked" ? "Locked" : stateLabel === "complete" ? "Done" : "Up next"}</span>
              </span>
            </button>
          `;
        }).join("")}
      </nav>
    </div>
  `;
  wireStepEvents(target);
}

function renderCurrentStep() {
  const target = document.querySelector("[data-step-content]");
  if (!target) {
    return;
  }

  if (!getHasAnalysis() && state.route !== "sources") {
    state.route = "sources";
  }

  let markup = "";
  if (state.route === "sources") {
    markup = buildSourcesStepMarkup();
  } else if (state.route === "level-review") {
    markup = buildLevelReviewStepMarkup();
  } else if (state.route === "groups") {
    markup = buildGroupsStepMarkup();
  } else if (state.route === "details") {
    markup = buildDetailsStepMarkup();
  } else {
    markup = buildExportStepMarkup();
  }

  target.innerHTML = markup;
  wireStepEvents(target);
}

function renderApp() {
  persistState();
  renderProgressHeader();
  renderCurrentStep();
  if (state.isBusy) {
    setAnalysisBusy(true);
  }
}

function refreshSourcesStepFragments() {
  const startPathTarget = document.querySelector("[data-start-path-live]");
  if (startPathTarget) {
    startPathTarget.innerHTML = buildStartPathMarkup();
    wireStepEvents(startPathTarget);
  }
  const summaryTarget = document.querySelector("[data-source-summary-live]");
  if (summaryTarget) {
    summaryTarget.innerHTML = buildSourceSummaryMarkup();
  }
  const runPanelTarget = document.querySelector("[data-run-panel-live]");
  if (runPanelTarget) {
    runPanelTarget.innerHTML = buildRunPanelMarkup();
    wireStepEvents(runPanelTarget);
  }
}

function setAnalysisBusy(isBusy) {
  state.isBusy = isBusy;
  document.querySelectorAll("[data-step-content] button, [data-step-content] input, [data-step-content] textarea, [data-step-content] select, [data-step-progress] button")
    .forEach((node) => {
      node.disabled = isBusy || node.hasAttribute("data-disabled-route");
    });
}

async function cacheUploadedFiles(fileList) {
  const files = [...fileList];
  if (!files.length) {
    state.workspace.uploadedFiles = [];
    persistState();
    renderApp();
    renderStatus("Cleared staged uploaded files.");
    return;
  }

  const cachedFiles = [];
  setAnalysisBusy(true);
  try {
    for (const [index, file] of files.entries()) {
      renderStatus(`Loading uploaded file ${index + 1} of ${files.length}: ${file.name}`);
      cachedFiles.push({
        name: file.name,
        text: await file.text(),
      });
    }
    state.workspace.uploadedFiles = cachedFiles;
    persistState();
    renderApp();
    renderStatus(`Staged ${pluralize(cachedFiles.length, "uploaded file")} for analysis.`, "success");
  } finally {
    setAnalysisBusy(false);
  }
}

async function loadDocumentsFromStoredFiles(storedFiles, onProgress = () => {}) {
  const documents = [];
  const issues = [];

  for (const [index, file] of storedFiles.entries()) {
    onProgress({ current: index + 1, total: storedFiles.length, label: file.name });
    const text = file.text || "";
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
    onProgress({ current: index + 1, total: urls.length, label: originalUrl });
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

function loadManualDocuments(entries = state.workspace.manualEntries) {
  return normalizeManualEntries(entries)
    .map((entry, index) => ({
      id: `manual-${index + 1}`,
      title: entry.title.trim() || `Manual Document ${index + 1}`,
      source: `manual://document-${index + 1}`,
      text: entry.text.trim(),
    }))
    .filter((document) => document.text);
}

function buildSummary(result) {
  const levelReviewCount = result.requirements.filter(
    (requirement) => requirement.hierarchyReview.alignment !== "aligned"
  ).length;
  const requirementCount = result.requirements.length;
  const mappedRequirementCount = new Set(
    result.requirementGroups.flatMap((group) => group.requirementIds)
  ).size;
  const unmappedRequirementCount = Math.max(0, requirementCount - mappedRequirementCount);
  const quickWinCount = result.requirementGroups.filter((group) => group.recommendationBucket === "quick-win").length;
  const materialChangeCount = result.requirementGroups.filter((group) => group.recommendationBucket === "material-change").length;
  if (!result.requirementGroups.length) {
    if (!result.requirementEdges.length) {
      return `Extracted ${requirementCount} requirement unit(s) across ${result.documents.length} document(s). No cross-document requirement mapping group cleared the current threshold yet. ${levelReviewCount ? `${levelReviewCount} requirement(s) still show hierarchy issues worth cleaning up before consolidation work.` : "The current set may simply be cleanly separated at the requirement level."}`;
    }
    return `Extracted ${requirementCount} requirement unit(s) across ${result.documents.length} document(s). A few requirements overlap across documents, but they do not yet form a strong mapping group. ${levelReviewCount ? `${levelReviewCount} requirement(s) still show hierarchy issues worth cleaning up first.` : "Review the top requirement pairs first and consider lowering the threshold slightly if you want broader mapping."}`;
  }

  const strongest = result.requirementGroups[0];
  const primary = result.requirements.find((requirement) => requirement.requirementId === strongest.recommendedPrimaryRequirementId);
  return `Extracted ${requirementCount} requirement unit(s) across ${result.documents.length} document(s). ${strongest.requirementIds.length} requirements cluster around ${primary.sourceDocumentTitle} as the strongest canonical starting point. ${mappedRequirementCount} requirement(s) are mapped, ${unmappedRequirementCount} remain unmapped, and ${quickWinCount} quick win mapping group(s) plus ${materialChangeCount} material change mapping group(s) are visible. ${levelReviewCount ? `${levelReviewCount} requirement(s) show hierarchy issues against the policy-on-policies structure and should be corrected before consolidation.` : "The current review compares every extracted requirement across documents and against the expected policy-standard-procedure hierarchy."}`;
}

function buildLevelMarkup(documents) {
  if (!documents.length) {
    return `<article class="result-card"><p>No documents match the current view.</p></article>`;
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

function buildRequirementInventoryMarkup(documents) {
  if (!documents.length) {
    return `<article class="result-card"><p>No requirement inventory is available yet.</p></article>`;
  }

  const requirementGroupById = new Map();
  for (const group of state.analysisView.result.requirementGroups) {
    for (const requirementId of group.requirementIds) {
      requirementGroupById.set(requirementId, group);
    }
  }

  return documents
    .map((document) => `
      <article class="result-card">
        <div class="result-card__header result-card__header--tight">
          <div>
            <h4>${document.title}</h4>
            <p class="result-card__meta">${document.requirementCount} extracted requirement${document.requirementCount === 1 ? "" : "s"}</p>
          </div>
          <div class="result-card__badges">
            <span class="doc-badge">${document.documentLevel.inferredType}</span>
            <span class="doc-badge ${document.documentLevel.levelFit === "aligned" ? "doc-badge--ok" : "doc-badge--warn"}">
              ${document.documentLevel.levelFit}
            </span>
          </div>
        </div>
        ${document.documentLevel.levelIssues.length ? `<p class="document-note">${document.documentLevel.levelIssues.join("; ")}</p>` : ""}
        <ul class="requirement-list">
          ${document.requirements.map((requirement) => {
            const requirementGroup = requirementGroupById.get(requirement.requirementId);
            const hierarchyAlignment = requirement.hierarchyReview.alignment;
            return `
            <li class="requirement-row ${hierarchyAlignment === "aligned" ? "" : "requirement-row--flagged"}">
              <div class="requirement-row__main">
                <strong>R${requirement.sourceLocation.paragraphIndex}.${requirement.sourceLocation.itemIndex}</strong>
                <p>${requirement.requirementText}</p>
                <span>${requirement.sourceLocation.section || "Document body"}</span>
                ${requirement.hierarchyReview.issues.length ? `<p class="document-note">${requirement.hierarchyReview.issues.join("; ")}</p>` : ""}
              </div>
              <div class="requirement-row__meta">
                <span class="doc-badge">${requirement.requirementType}</span>
                <span class="doc-badge ${hierarchyAlignment === "aligned" ? "doc-badge--ok" : "doc-badge--warn"}">
                  ${hierarchyAlignment}
                </span>
                <span class="doc-badge ${requirement.hierarchyReview.scopeStatus === "in-scope" ? "doc-badge--ok" : "doc-badge--warn"}">
                  ${requirement.hierarchyReview.scopeStatus === "in-scope" ? "In scope" : "Out of scope"}
                </span>
                <span class="doc-badge ${requirementGroup ? "doc-badge--ok" : ""}">
                  ${requirementGroup ? `Mapped group (${requirementGroup.requirementIds.length})` : "No match group"}
                </span>
              </div>
            </li>
          `;
          }).join("")}
        </ul>
      </article>
    `)
    .join("");
}

function buildStandaloneRedlineUrl(currentText, proposedText) {
  return `./version-compare/?a=${encodeUrlParam(currentText)}&b=${encodeUrlParam(proposedText)}&autorun=1`;
}

function scoreRequirementForProposal(requirement, primary) {
  let score = requirement.requirementText.length;
  if (requirement.hierarchyReview.scopeStatus === "in-scope") {
    score += 200;
  }
  if (requirement.hierarchyReview.alignment === "aligned") {
    score += 75;
  } else if (requirement.hierarchyReview.alignment === "review") {
    score += 20;
  }
  if (requirement.sourceDocumentType === primary.sourceDocumentType) {
    score += 25;
  }
  return score;
}

export function buildRequirementRedlineModel(result, group) {
  const requirements = group.requirementIds
    .map((id) => result.requirements.find((requirement) => requirement.requirementId === id))
    .filter(Boolean);
  const primary = result.requirements.find(
    (requirement) => requirement.requirementId === group.recommendedPrimaryRequirementId
  );

  if (!primary) {
    return null;
  }

  const rankedCandidates = [...requirements].sort(
    (left, right) => scoreRequirementForProposal(right, primary) - scoreRequirementForProposal(left, primary)
  );
  const strongestInScopeCandidate =
    rankedCandidates.find((requirement) => requirement.hierarchyReview.scopeStatus === "in-scope") || primary;

  let proposedText = strongestInScopeCandidate.requirementText;
  let autoRedlineStatus = "ready";
  let reviewNote =
    "Proposed text is based on the strongest in-scope requirement wording in this mapping group.";

  if (group.checks.scopeStatus === "contains-out-of-scope" || group.checks.hierarchyRelationship === "policy-to-procedure-gap") {
    proposedText = primary.requirementText;
    autoRedlineStatus = "blocked";
    reviewNote =
      "Automatic redline is blocked because this mapping includes procedure content or a direct policy-to-procedure hierarchy gap.";
  } else if (group.checks.oneToOneMappingStatus === "conflict") {
    autoRedlineStatus = "caution";
    reviewNote =
      "Automatic redline is advisory only because multiple requirements from the same source document map into this group.";
  } else if (strongestInScopeCandidate.requirementId === primary.requirementId) {
    reviewNote =
      "No stronger in-scope wording displaced the canonical requirement, so this is mostly a deduplication decision rather than a text rewrite.";
  }

  const compareResult = runRedlineCompare(primary.requirementText, proposedText, {
    original_label: `${primary.sourceDocumentTitle} current canonical text`,
    updated_label: "Proposed consolidated requirement",
  });

  return {
    primary,
    proposedText,
    compareResult,
    autoRedlineStatus,
    reviewNote,
    standaloneUrl: buildStandaloneRedlineUrl(primary.requirementText, proposedText),
  };
}

function buildInlineDiffHtml(segments) {
  return segments
    .map((segment) => {
      const className =
        segment.type === "add"
          ? "redline-token redline-token--add"
          : segment.type === "remove"
            ? "redline-token redline-token--remove"
            : "redline-token";
      return `<span class="${className}">${escapeHtml(segment.text)}</span>`;
    })
    .join("");
}

function buildSideBySideDiffHtml(rows) {
  return `
    <div class="redline-side-table">
      <table>
        <thead>
          <tr><th>Current</th><th>Proposed</th></tr>
        </thead>
        <tbody>
          ${rows
            .map((row) => `
              <tr>
                <td class="${row.type === "remove" || row.type === "replace" ? "removed-cell" : ""}">${escapeHtml(row.left || "")}</td>
                <td class="${row.type === "add" || row.type === "replace" ? "added-cell" : ""}">${escapeHtml(row.right || "")}</td>
              </tr>
            `)
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function buildRequirementRedlineMarkup(result, group) {
  const model = buildRequirementRedlineModel(result, group);
  if (!model) {
    return "";
  }

  const summary = model.compareResult.summary;
  return `
    <details class="redline-disclosure">
      <summary>Open redline preview</summary>
      <div class="redline-preview">
        <div class="redline-preview__meta">
          <span class="doc-badge ${model.autoRedlineStatus === "ready" ? "doc-badge--ok" : "doc-badge--warn"}">
            ${model.autoRedlineStatus === "ready" ? "Auto redline ready" : model.autoRedlineStatus === "caution" ? "Advisory redline" : "Auto redline blocked"}
          </span>
          <span class="doc-badge">Added ${summary.added_words}</span>
          <span class="doc-badge">Removed ${summary.removed_words}</span>
          <a class="ghost-button ghost-button--small" href="${model.standaloneUrl}">Open standalone compare</a>
        </div>
        <p class="document-note">${escapeHtml(model.reviewNote)}</p>
        <div class="redline-copy-grid">
          <div class="redline-copy-card">
            <h5>Current canonical text</h5>
            <p>${escapeHtml(model.primary.requirementText)}</p>
          </div>
          <div class="redline-copy-card">
            <h5>Proposed consolidated text</h5>
            <p>${escapeHtml(model.proposedText)}</p>
          </div>
        </div>
        <div class="redline-inline-box">${buildInlineDiffHtml(model.compareResult.segments)}</div>
        ${buildSideBySideDiffHtml(model.compareResult.side_by_side)}
      </div>
    </details>
  `;
}

function buildRequirementGroupMarkup(result, groups) {
  if (!groups.length) {
    return `<article class="result-card"><p>No cross-document requirement mapping groups were found at the current threshold.</p></article>`;
  }

  const renderRequirementGroupCard = (group) => {
    const groupIndex = result.requirementGroups.findIndex(
      (candidate) => candidate.recommendedPrimaryRequirementId === group.recommendedPrimaryRequirementId
    );
    const requirements = group.requirementIds
      .map((id) => result.requirements.find((requirement) => requirement.requirementId === id))
      .filter(Boolean);
    const primary = result.requirements.find(
      (requirement) => requirement.requirementId === group.recommendedPrimaryRequirementId
    );

    return `
      <article class="result-card">
        <div class="result-card__header result-card__header--tight">
          <div>
            <h4>${primary.sourceDocumentTitle}</h4>
            <p class="result-card__meta">Requirement group ${groupIndex + 1}</p>
          </div>
          <div class="result-card__badges">
            <span class="doc-badge ${group.recommendationBucket === "quick-win" ? "doc-badge--ok" : "doc-badge--warn"}">
              ${group.recommendationBucket === "quick-win" ? "Quick win" : "Material change"}
            </span>
            <span class="pill">${group.avgInternalSimilarity.toFixed(4)} similarity</span>
          </div>
        </div>
        <p class="result-card__summary">${primary.requirementText}</p>
        <p class="result-card__summary">${group.recommendation}</p>
        <div class="check-grid">
          ${Object.entries(group.checks)
            .filter(([label]) => label !== "hierarchyIssues")
            .map(
              ([label, value]) => `
                <div class="check">
                  <span class="check__label">${formatLabel(label)}</span>
                  <strong class="check__value">${value}</strong>
                </div>
              `
            )
            .join("")}
        </div>
        ${group.checks.hierarchyIssues?.length ? `<p class="document-note">${group.checks.hierarchyIssues.join("; ")}</p>` : ""}
        ${buildRequirementRedlineMarkup(result, group)}
        <ul class="requirement-list">
          ${requirements.map((requirement) => `
            <li class="requirement-row">
              <div class="requirement-row__main">
                <strong>${requirement.sourceDocumentTitle}</strong>
                <p>${requirement.requirementText}</p>
                <span>${requirement.sourceLocation.section || "Document body"} | ${requirement.sourceDocumentType}</span>
              </div>
              <div class="requirement-row__meta">
                <span class="doc-badge">${requirement.requirementType}</span>
                <span class="doc-badge ${requirement.hierarchyReview.alignment === "aligned" ? "doc-badge--ok" : "doc-badge--warn"}">
                  ${requirement.hierarchyReview.alignment}
                </span>
              </div>
            </li>
          `).join("")}
        </ul>
      </article>
    `;
  };

  const quickWins = groups.filter((group) => group.recommendationBucket === "quick-win");
  const materialChanges = groups.filter((group) => group.recommendationBucket === "material-change");

  return `
    <div class="bucket-stack">
      <section class="bucket-section">
        <div class="bucket-section__header">
          <h4>Quick wins</h4>
          <span class="doc-badge doc-badge--ok">${quickWins.length}</span>
        </div>
        <p class="section-subtitle">Requirement mappings that appear 1:1 clean and aligned to the expected hierarchy.</p>
        ${quickWins.length
          ? quickWins.map((group) => renderRequirementGroupCard(group)).join("")
          : `<article class="result-card"><p>No quick win requirement groups are visible in the current view.</p></article>`}
      </section>
      <section class="bucket-section">
        <div class="bucket-section__header">
          <h4>Material changes</h4>
          <span class="doc-badge doc-badge--warn">${materialChanges.length}</span>
        </div>
        <p class="section-subtitle">Requirement mappings with 1:1 conflicts, hierarchy problems, or out-of-scope procedure content.</p>
        ${materialChanges.length
          ? materialChanges.map((group) => renderRequirementGroupCard(group)).join("")
          : `<article class="result-card"><p>No material change requirement groups are visible in the current view.</p></article>`}
      </section>
    </div>
  `;
}

function buildPairMarkup(result, edges) {
  if (!edges.length) {
    return `<article class="result-card"><p>No requirement pairs cleared the current threshold.</p></article>`;
  }

  return `
    <article class="result-card">
      <ul class="pair-list">
        ${edges
          .slice(0, 12)
          .map((edge) => {
            const left = result.requirements.find((requirement) => requirement.requirementId === edge.leftRequirementId);
            const right = result.requirements.find((requirement) => requirement.requirementId === edge.rightRequirementId);
            return `
            <li>
              <span>${left?.sourceDocumentTitle || edge.leftRequirementId}</span>
              <strong class="pair-score">${edge.score.toFixed(4)}</strong>
              <span>${right?.sourceDocumentTitle || edge.rightRequirementId}</span>
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
      <span class="doc-type-control__label">Level</span>
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

function requirementGroupHasReviewFlags(group) {
  return (
    group.checks.oneToOneMappingStatus === "conflict" ||
    group.checks.hierarchyReviewStatus === "review-needed" ||
    group.checks.scopeStatus === "contains-out-of-scope" ||
    group.checks.hierarchyRelationship === "policy-to-procedure-gap" ||
    group.checks.hierarchyRelationship === "mixed-level"
  );
}

function buildDocumentViewModel(result) {
  const requirementGroupsByDocumentId = new Map();
  for (const group of result.requirementGroups) {
    for (const requirementId of group.requirementIds) {
      const requirement = result.requirements.find((candidate) => candidate.requirementId === requirementId);
      if (!requirement) {
        continue;
      }
      if (!requirementGroupsByDocumentId.has(requirement.documentId)) {
        requirementGroupsByDocumentId.set(requirement.documentId, []);
      }
      requirementGroupsByDocumentId.get(requirement.documentId).push(group);
    }
  }

  return result.documents.map((document) => {
    const groups = requirementGroupsByDocumentId.get(document.id) || [];
    const mappedRequirements = document.requirements.filter((requirement) =>
      groups.some((group) => group.requirementIds.includes(requirement.requirementId))
    ).length;
    const needsReview = groups.some((group) => requirementGroupHasReviewFlags(group));
    return {
      ...document,
      groupLabel: mappedRequirements
        ? `${mappedRequirements}/${document.requirementCount} mapped`
        : "Unmapped",
      needsReview: groups.length
        ? needsReview || document.documentLevel.levelFit !== "aligned"
        : document.documentLevel.levelFit !== "aligned",
      canonicalTitle: groups.length
        ? result.requirements.find((candidate) => candidate.requirementId === groups[0].recommendedPrimaryRequirementId)?.sourceDocumentTitle || ""
        : "",
      recommendationBucket: groups.length ? groups[0].recommendationBucket : "",
    };
  });
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

  const filteredGroups = result.requirementGroups.filter((group) => {
    const primary = result.requirements.find((requirement) => requirement.requirementId === group.recommendedPrimaryRequirementId);
    const groupReview = requirementGroupHasReviewFlags(group);
    const memberRequirements = group.requirementIds
      .map((id) => result.requirements.find((requirement) => requirement.requirementId === id))
      .filter(Boolean);
    const searchMatch = matchesSearch(
      [
        primary?.sourceDocumentTitle || "",
        primary?.requirementText || "",
        group.recommendation,
        ...memberRequirements.flatMap((requirement) => [
          requirement.sourceDocumentTitle,
          requirement.requirementText,
          requirement.sourceLocation.section,
        ]),
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
      return (
        group.checks.hierarchyReviewStatus === "review-needed" ||
        group.checks.hierarchyRelationship === "policy-to-procedure-gap" ||
        group.checks.scopeStatus === "contains-out-of-scope"
      );
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
      return document.needsReview || document.documentLevel.levelFit !== "aligned";
    }
    if (filter === "ready") {
      return document.groupLabel !== "Unmapped" && !document.needsReview;
    }
    if (filter === "orphan") {
      return document.groupLabel === "Unmapped";
    }
    return true;
  });

  const filteredRequirements = result.requirements.filter((requirement) => {
    const searchMatch = matchesSearch(
      [
        requirement.sourceDocumentTitle,
        requirement.requirementText,
        requirement.sourceLocation.section,
        requirement.requirementType,
      ],
      query
    );
    if (!searchMatch) {
      return false;
    }
    if (filter === "level") {
      return requirement.hierarchyReview.alignment !== "aligned";
    }
    return true;
  });

  const filteredDocumentIds = new Set(filteredDocuments.map((document) => document.id));
  const filteredRequirementIds = new Set(filteredRequirements.map((requirement) => requirement.requirementId));
  const filteredEdges = result.requirementEdges.filter(
    (edge) => filteredRequirementIds.has(edge.leftRequirementId) && filteredRequirementIds.has(edge.rightRequirementId)
  );
  const filteredIssues = issues.filter((issue) => matchesSearch([issue], query));

  return {
    groups: filteredGroups,
    documents: filteredDocuments,
    requirements: filteredRequirements,
    edges: filteredEdges,
    issues: filteredIssues,
  };
}

export function buildExportPayload(result, issues, rawQuery, filter, threshold = 0.45) {
  const filtered = filterAnalysisView(result, issues, rawQuery, filter);
  const strongestCanonicalRequirement = result.requirementGroups[0]
    ? result.requirements.find(
        (requirement) => requirement.requirementId === result.requirementGroups[0].recommendedPrimaryRequirementId
      )
    : null;
  return {
    createdAt: new Date().toISOString(),
    threshold,
    query: rawQuery.trim(),
    filter,
    summary: buildSummary(result),
    strongestCanonicalTitle: strongestCanonicalRequirement?.sourceDocumentTitle || "None",
    sourceResult: result,
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
      "document_title",
      "source",
      "requirement_id",
      "section",
      "anchor",
      "document_type",
      "requirement_type",
      "hierarchy_alignment",
      "scope_status",
      "mapped_group_size",
      "group_bucket",
      "group_review_status",
      "canonical_document",
      "canonical_requirement_text",
      "redline_status",
      "proposed_requirement_text",
      "requirement_text",
    ],
  ];

  const groupByRequirementId = new Map();
  for (const group of payload.filtered.groups) {
    for (const requirementId of group.requirementIds) {
      groupByRequirementId.set(requirementId, group);
    }
  }

  for (const requirement of payload.filtered.requirements) {
    const group = groupByRequirementId.get(requirement.requirementId);
    const primaryRequirement = group
      ? group.requirementIds
          .map((id) => payload.sourceResult.requirements.find((candidate) => candidate.requirementId === id))
          .find((candidate) => candidate?.requirementId === group.recommendedPrimaryRequirementId)
      : null;
    const redline = group ? buildRequirementRedlineModel(payload.sourceResult, group) : null;
    rows.push([
      requirement.sourceDocumentTitle,
      payload.filtered.documents.find((document) => document.id === requirement.documentId)?.source || "",
      requirement.requirementId,
      requirement.sourceLocation.section || "Document body",
      `P${requirement.sourceLocation.paragraphIndex}.${requirement.sourceLocation.itemIndex}`,
      requirement.sourceDocumentType,
      requirement.requirementType,
      requirement.hierarchyReview.alignment,
      requirement.hierarchyReview.scopeStatus,
      String(group?.requirementIds.length || 0),
      group?.recommendationBucket || "",
      group?.checks?.hierarchyReviewStatus || "",
      primaryRequirement?.sourceDocumentTitle || "",
      primaryRequirement?.requirementText || "",
      redline?.autoRedlineStatus || "",
      redline?.proposedText || "",
      requirement.requirementText,
    ]);
  }

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function buildMarkdownExport(payload) {
  const quickWins = payload.filtered.groups.filter((group) => group.recommendationBucket === "quick-win");
  const materialChanges = payload.filtered.groups.filter((group) => group.recommendationBucket === "material-change");
  const mappedRequirementCount = new Set(
    payload.filtered.groups.flatMap((group) => group.requirementIds)
  ).size;
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
    `- Visible requirement groups: ${payload.filtered.groups.length}`,
    `- Quick win requirement groups: ${quickWins.length}`,
    `- Material change requirement groups: ${materialChanges.length}`,
    `- Visible documents: ${payload.filtered.documents.length}`,
    `- Visible requirements: ${payload.filtered.requirements.length}`,
    `- Mapped visible requirements: ${mappedRequirementCount}`,
    `- Unmapped visible requirements: ${Math.max(0, payload.filtered.requirements.length - mappedRequirementCount)}`,
    `- Visible requirement pairs: ${payload.filtered.edges.length}`,
    `- Visible import issues: ${payload.filtered.issues.length}`,
    "",
    "## Policy-On-Policies Hierarchy",
    "",
    "- Policy: high-level intent and binding requirements.",
    "- Standard: control detail and minimum requirements beneath policy.",
    "- Procedure: step-based execution content and out of scope for Policy Team artifacts.",
    "- Direct policy-to-procedure mapping and mixed-level requirement language are treated as review flags.",
    "",
    "## Quick Wins",
    "",
  ];

  if (!quickWins.length) {
    lines.push("No quick win groups are visible in the current view.", "");
  } else {
    quickWins.forEach((group, index) => {
      const groupRequirements = group.requirementIds
        .map((id) => payload.filtered.requirements.find((requirement) => requirement.requirementId === id))
        .filter(Boolean);
      const primaryRequirement = groupRequirements.find(
        (requirement) => requirement.requirementId === group.recommendedPrimaryRequirementId
      );
      const redline = buildRequirementRedlineModel(payload.sourceResult, group);
      lines.push(`### Group ${index + 1}`);
      lines.push("");
      lines.push(`- Recommendation bucket: Quick win`);
      lines.push(`- Average similarity: ${group.avgInternalSimilarity.toFixed(4)}`);
      lines.push(`- Canonical source: ${primaryRequirement?.sourceDocumentTitle || "Unknown"}`);
      lines.push(`- Canonical requirement: ${primaryRequirement?.requirementText || "Unknown"}`);
      lines.push(`- Redline status: ${redline?.autoRedlineStatus || "unknown"}`);
      lines.push(`- Proposed consolidated text: ${redline?.proposedText || primaryRequirement?.requirementText || "Unknown"}`);
      lines.push(`- Recommendation: ${group.recommendation}`);
      lines.push(`- Checks: ${Object.entries(group.checks).map(([label, value]) => `${formatLabel(label)} = ${value}`).join("; ")}`);
      lines.push("- Requirements:");
      lines.push(
        ...groupRequirements.map(
          (requirement) =>
            `  - ${requirement.sourceDocumentTitle} [${requirement.sourceDocumentType}] ${requirement.requirementText}`
        )
      );
      lines.push("");
    });
  }

  lines.push("## Material Changes", "");

  if (!materialChanges.length) {
    lines.push("No material change groups are visible in the current view.", "");
  } else {
    materialChanges.forEach((group, index) => {
      const groupRequirements = group.requirementIds
        .map((id) => payload.filtered.requirements.find((requirement) => requirement.requirementId === id))
        .filter(Boolean);
      const primaryRequirement = groupRequirements.find(
        (requirement) => requirement.requirementId === group.recommendedPrimaryRequirementId
      );
      const redline = buildRequirementRedlineModel(payload.sourceResult, group);
      lines.push(`### Group ${index + 1}`);
      lines.push("");
      lines.push(`- Recommendation bucket: Material change`);
      lines.push(`- Average similarity: ${group.avgInternalSimilarity.toFixed(4)}`);
      lines.push(`- Canonical source: ${primaryRequirement?.sourceDocumentTitle || "Unknown"}`);
      lines.push(`- Canonical requirement: ${primaryRequirement?.requirementText || "Unknown"}`);
      lines.push(`- Redline status: ${redline?.autoRedlineStatus || "unknown"}`);
      lines.push(`- Proposed consolidated text: ${redline?.proposedText || primaryRequirement?.requirementText || "Unknown"}`);
      lines.push(`- Recommendation: ${group.recommendation}`);
      lines.push(`- Checks: ${Object.entries(group.checks).map(([label, value]) => `${formatLabel(label)} = ${value}`).join("; ")}`);
      lines.push("- Requirements:");
      lines.push(
        ...groupRequirements.map(
          (requirement) =>
            `  - ${requirement.sourceDocumentTitle} [${requirement.sourceDocumentType}] ${requirement.requirementText}`
        )
      );
      lines.push("");
    });
  }

  lines.push("## Document Coverage", "");

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

  lines.push("## Requirement Inventory", "");

  if (!payload.filtered.documents.length) {
    lines.push("No requirement inventory is visible in the current view.", "");
  } else {
    payload.filtered.documents.forEach((document) => {
      lines.push(`### ${document.title}`);
      lines.push("");
      lines.push(`- Requirement count: ${document.requirementCount || 0}`);
      if (!document.requirements?.length) {
        lines.push("- No extracted requirements");
        lines.push("");
        return;
      }
      document.requirements.forEach((requirement) => {
        lines.push(
          `- [${requirement.sourceLocation.section || "Document body"} | P${requirement.sourceLocation.paragraphIndex}.${requirement.sourceLocation.itemIndex}] ${requirement.requirementText} (${requirement.requirementType})`
        );
      });
      lines.push("");
    });
  }

  lines.push("## Requirement Pair Review", "");

  if (!payload.filtered.edges.length) {
    lines.push("No requirement pairs are visible in the current view.", "");
  } else {
    payload.filtered.edges.slice(0, 12).forEach((edge) => {
      const left = payload.filtered.requirements.find((requirement) => requirement.requirementId === edge.leftRequirementId);
      const right = payload.filtered.requirements.find((requirement) => requirement.requirementId === edge.rightRequirementId);
      lines.push(
        `- ${left?.sourceDocumentTitle || edge.leftRequirementId}: ${left?.requirementText || ""} <-> ${right?.sourceDocumentTitle || edge.rightRequirementId}: ${right?.requirementText || ""} (${edge.score.toFixed(4)})`
      );
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

function rerunAnalysisWithOverrides() {
  if (!state.analysisView.documents.length) {
    return;
  }
  state.analysisView.result = analyzeDocuments(
    state.analysisView.documents,
    state.analysisView.threshold,
    state.analysisView.levelOverrides
  );
  persistState();
  renderApp();
}

function resetWorkspace() {
  state.route = "sources";
  state.includeSampleData = false;
  state.activeSourceTab = "urls";
  state.workspace.urlsText = "";
  state.workspace.uploadedFiles = [];
  state.workspace.manualEntries = cloneManualEntries(DEFAULT_MANUAL_ENTRIES);
  state.analysisView.query = "";
  state.analysisView.filter = "all";
  state.analysisView.documents = [];
  state.analysisView.threshold = 0.45;
  state.analysisView.levelOverrides = {};
  state.analysisView.usedSampleData = false;
  state.analysisView.result = null;
  state.analysisView.issues = [];
  persistState();
  goToRoute("sources", { replace: true });
  renderStatus("Workspace reset. Add demo data or your own documents to begin again.");
}

function isSourcesWorkspaceEmpty() {
  return (
    !state.includeSampleData &&
    !countUrlEntries() &&
    !state.workspace.uploadedFiles.length &&
    !countManualEntries()
  );
}

function scrollToStepContent() {
  document.querySelector("[data-step-content]")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function scrollToSourceWorkspace() {
  const target =
    document.querySelector(".workspace-switcher") ||
    document.querySelector("#urlsText") ||
    document.querySelector("[data-step-content]");
  target?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
  if (target instanceof HTMLElement && target.matches("#urlsText")) {
    target.focus({ preventScroll: true });
  }
}

function loadDemoSetup({ announce = true } = {}) {
  state.includeSampleData = true;
  state.activeSourceTab = "urls";
  state.workspace.urlsText = SAMPLE_URLS.join("\n");
  persistState();
  renderApp();
  if (announce) {
    renderStatus(
      "Demo setup loaded. The sample library is enabled and illustrative sample URLs are ready in the workspace."
    );
  }
}

async function runAnalysis() {
  const manualDocuments = loadManualDocuments();
  const sampleDocuments = state.includeSampleData ? SAMPLE_DOCUMENTS : [];
  const urlCount = countUrlEntries();
  const progress = {
    phase: "collect",
    sampleCount: sampleDocuments.length,
    manualCount: manualDocuments.length,
    fileCount: state.workspace.uploadedFiles.length,
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
    const fileResult = await loadDocumentsFromStoredFiles(state.workspace.uploadedFiles, ({ current, label }) => {
      progress.filesProcessed = current - 1;
      progress.currentFileName = label;
      renderProgressStatus(progress);
    });
    progress.filesProcessed = progress.fileCount;
    progress.loadedDocumentCount += fileResult.documents.length;
    renderProgressStatus(progress);

    progress.phase = "urls";
    renderProgressStatus(progress);
    const urlResult = await loadDocumentsFromUrls(state.workspace.urlsText, ({ current, label }) => {
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
        "Add at least two documents. The quickest path is the built-in demo library or a small staged file set.",
        "warning"
      );
      return;
    }

    progress.phase = "analysis";
    progress.loadedDocumentCount = documents.length;
    renderProgressStatus(progress);

    state.analysisView.documents = documents;
    state.analysisView.levelOverrides = Object.fromEntries(
      Object.entries(state.analysisView.levelOverrides).filter(([documentId]) =>
        documents.some((document) => String(document.id) === documentId)
      )
    );
    state.analysisView.result = analyzeDocuments(
      documents,
      state.analysisView.threshold,
      state.analysisView.levelOverrides
    );
    state.analysisView.query = "";
    state.analysisView.filter = "all";
    state.analysisView.usedSampleData = state.includeSampleData;
    state.analysisView.issues = issues;
    persistState();
    renderStatus(
      `Analyzed ${state.analysisView.result.documents.length} documents with a ${state.analysisView.threshold.toFixed(2)} similarity threshold.`,
      "success"
    );
    goToRoute("level-review", { replace: true });
  } catch (error) {
    renderStatus(`Analysis could not finish: ${error.message}`, "warning");
  } finally {
    setAnalysisBusy(false);
  }
}

function goToRoute(routeId, { replace = false } = {}) {
  const nextRouteId = ensureAccessibleRoute(routeId);
  const nextHash = getRouteHash(nextRouteId);
  if (typeof window === "undefined") {
    state.route = nextRouteId;
    persistState();
    renderApp();
    return;
  }

  if (replace) {
    history.replaceState(null, "", nextHash);
    handleRouteChange();
    return;
  }

  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  } else {
    handleRouteChange();
  }
}

function handleRouteChange() {
  state.route = ensureAccessibleRoute(getRouteIdFromHash(window.location.hash || "#/sources"));
  const canonicalHash = getRouteHash(state.route);
  if (window.location.hash !== canonicalHash) {
    history.replaceState(null, "", canonicalHash);
  }
  persistState();
  renderApp();
}

function syncThresholdFromSlider(value) {
  const next = Number(value || state.analysisView.threshold);
  state.analysisView.threshold = Number(next.toFixed(2));
  persistState();
  renderApp();
}

function syncThresholdFromInput(value) {
  const numeric = Number(value || state.analysisView.threshold);
  const clamped = Math.min(0.9, Math.max(0.2, numeric));
  state.analysisView.threshold = Number(clamped.toFixed(2));
  persistState();
  renderApp();
}

function wireStepEvents(scope) {
  scope.querySelectorAll("[data-scroll-current]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.route === "sources" && isSourcesWorkspaceEmpty()) {
        loadDemoSetup({ announce: true });
        requestAnimationFrame(() => {
          scrollToSourceWorkspace();
        });
        return;
      }
      if (state.route === "sources") {
        scrollToSourceWorkspace();
        return;
      }
      scrollToStepContent();
    });
  });

  scope.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      goToRoute(button.getAttribute("data-route"));
    });
  });

  scope.querySelectorAll("[data-source-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeSourceTab = button.getAttribute("data-source-tab");
      persistState();
      renderApp();
    });
  });

  scope.querySelectorAll("[data-source-tab-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeSourceTab = button.getAttribute("data-source-tab-jump");
      persistState();
      renderApp();
    });
  });

  scope.querySelectorAll("[data-include-sample]").forEach((sampleToggle) => {
    sampleToggle.addEventListener("change", () => {
      state.includeSampleData = sampleToggle.checked;
      persistState();
      renderApp();
    });
  });

  const urlsInput = scope.querySelector("[data-urls-input]");
  if (urlsInput) {
    urlsInput.addEventListener("input", () => {
      state.workspace.urlsText = urlsInput.value;
      persistState();
      refreshSourcesStepFragments();
    });
  }

  const fileInput = scope.querySelector("[data-source-files]");
  if (fileInput) {
    fileInput.addEventListener("change", async () => {
      await cacheUploadedFiles(fileInput.files);
    });
  }

  const clearFilesButton = scope.querySelector("[data-clear-files]");
  if (clearFilesButton) {
    clearFilesButton.addEventListener("click", () => {
      state.workspace.uploadedFiles = [];
      persistState();
      renderApp();
      renderStatus("Cleared staged uploaded files.");
    });
  }

  scope.querySelectorAll("[data-manual-title]").forEach((input) => {
    input.addEventListener("input", () => {
      const index = Number(input.getAttribute("data-manual-index"));
      state.workspace.manualEntries[index].title = input.value;
      persistState();
    });
  });

  scope.querySelectorAll("[data-manual-text]").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      const index = Number(textarea.getAttribute("data-manual-index"));
      state.workspace.manualEntries[index].text = textarea.value;
      persistState();
      refreshSourcesStepFragments();
    });
  });

  scope.querySelectorAll("[data-remove-manual]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.getAttribute("data-manual-index"));
      state.workspace.manualEntries.splice(index, 1);
      state.workspace.manualEntries = normalizeManualEntries(state.workspace.manualEntries);
      persistState();
      renderApp();
    });
  });

  const addManualButton = scope.querySelector("[data-add-manual]");
  if (addManualButton) {
    addManualButton.addEventListener("click", () => {
      state.workspace.manualEntries.push({ title: "", text: "" });
      persistState();
      renderApp();
    });
  }

  const thresholdSlider = scope.querySelector("[data-threshold-slider]");
  if (thresholdSlider) {
    thresholdSlider.addEventListener("input", () => {
      syncThresholdFromSlider(thresholdSlider.value);
    });
  }

  const thresholdInput = scope.querySelector("[data-threshold-input]");
  if (thresholdInput) {
    thresholdInput.addEventListener("input", () => {
      syncThresholdFromInput(thresholdInput.value);
    });
  }

  scope.querySelectorAll("[data-load-demo]").forEach((button) => {
    button.addEventListener("click", () => {
      loadDemoSetup();
    });
  });

  scope.querySelectorAll("[data-run-demo]").forEach((button) => {
    button.addEventListener("click", async () => {
      loadDemoSetup();
      await runAnalysis();
    });
  });

  scope.querySelectorAll("[data-analyze]").forEach((button) => {
    button.addEventListener("click", async () => {
      await runAnalysis();
    });
  });

  scope.querySelectorAll("[data-reset-workspace]").forEach((button) => {
    button.addEventListener("click", () => {
      resetWorkspace();
    });
  });

  scope.querySelectorAll("[data-doc-type-select]").forEach((select) => {
    select.addEventListener("change", (event) => {
      const documentId = event.target.getAttribute("data-document-id");
      const nextType = event.target.value;
      if (nextType) {
        state.analysisView.levelOverrides[documentId] = nextType;
      } else {
        delete state.analysisView.levelOverrides[documentId];
      }
      rerunAnalysisWithOverrides();
    });
  });

  const searchInput = scope.querySelector("#analysisSearch");
  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      state.analysisView.query = event.target.value;
      persistState();
      renderApp();
      requestAnimationFrame(() => {
        const nextInput = document.querySelector("#analysisSearch");
        if (!nextInput) {
          return;
        }
        const caret = event.target.selectionStart ?? state.analysisView.query.length;
        nextInput.focus();
        nextInput.setSelectionRange(caret, caret);
      });
    });
  }

  scope.querySelectorAll("[data-view-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.analysisView.filter = button.getAttribute("data-view-filter");
      persistState();
      renderApp();
    });
  });

  scope.querySelectorAll("[data-export-format]").forEach((button) => {
    button.addEventListener("click", () => {
      exportCurrentView(button.getAttribute("data-export-format"));
    });
  });
}

function initialize() {
  restoreState();
  handleRouteChange();
  window.addEventListener("hashchange", handleRouteChange);
  loadDeploymentBadge();
  renderStatus("");
}

if (typeof document !== "undefined") {
  initialize();
}
