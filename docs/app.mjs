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
  activeSourceTab: "demo",
  analysisView: {
    query: "",
    filter: "all",
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
  state.analysisView.result = null;
  state.analysisView.issues = [];

  setActiveSourceTab("demo");
  updateSourceSummary();
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
            <article class="panel snapshot-kpi-card">
              <span class="snapshot-kpi-label">Documents</span>
              <span class="snapshot-kpi-value info">${filtered.documents.length}</span>
            </article>
            <article class="panel snapshot-kpi-card">
              <span class="snapshot-kpi-label">High-Similarity Pairs</span>
              <span class="snapshot-kpi-value warning">${filtered.edges.length}</span>
            </article>
            <article class="panel snapshot-kpi-card">
              <span class="snapshot-kpi-label">Duplicate Groups</span>
              <span class="snapshot-kpi-value success">${filtered.groups.length}</span>
            </article>
          </div>
        </div>
      </div>

      <section class="panel table-panel" id="analysisExplorer">
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
        <div class="filter-toolbar">
          <div class="toggle-group" data-filter-group>
            ${buildFilterButton("all", "All", filter)}
            ${buildFilterButton("level", "Level review", filter)}
            ${buildFilterButton("review", "Review flags", filter)}
            ${buildFilterButton("ready", "Cleaner fits", filter)}
            ${buildFilterButton("orphan", "Ungrouped docs", filter)}
          </div>
          <p class="section-subtitle">
            Search and filters update the review surface without rerunning the analysis.
          </p>
        </div>
      </section>

      <section class="panel table-panel collapsible" id="levelSection">
        <div class="collapsible-header" data-toggle="levelSection">
          <div class="collapsible-title-group">
            <h3>Step 1: document level evaluation</h3>
            <p class="section-subtitle">Check whether each document is operating at the right level of requirements before consolidation.</p>
          </div>
          <span class="collapse-icon"></span>
        </div>
        <div class="collapsible-body">
          <div class="results-section">
            ${levelHtml}
          </div>
        </div>
      </section>

      <section class="panel table-panel collapsible" id="groupsSection">
        <div class="collapsible-header" data-toggle="groupsSection">
          <div class="collapsible-title-group">
            <h3>Recommended consolidation groups</h3>
            <p class="section-subtitle">Canonical candidates with review checks and source membership.</p>
          </div>
          <span class="collapse-icon"></span>
        </div>
        <div class="collapsible-body">
          <div class="results-section">
            ${groupsHtml}
          </div>
        </div>
      </section>

      <section class="panel table-panel collapsible collapsed" id="documentsSection">
        <div class="collapsible-header" data-toggle="documentsSection">
          <div class="collapsible-title-group">
            <h3>Analyzed documents</h3>
            <p class="section-subtitle">Searchable source list with cluster membership and review posture.</p>
          </div>
          <span class="collapse-icon"></span>
        </div>
        <div class="collapsible-body">
          <div class="results-section">
            ${documentsHtml}
          </div>
        </div>
      </section>

      <section class="panel table-panel collapsible collapsed" id="pairsSection">
        <div class="collapsible-header" data-toggle="pairsSection">
          <div class="collapsible-title-group">
            <h3>Top similarity pairs</h3>
            <p class="section-subtitle">Fast triage view for overlapping documents that may not form a full cluster.</p>
          </div>
          <span class="collapse-icon"></span>
        </div>
        <div class="collapsible-body">
          <div class="results-section">
            ${pairsHtml}
          </div>
        </div>
      </section>

      <section class="panel table-panel collapsible collapsed" id="issuesSection">
        <div class="collapsible-header" data-toggle="issuesSection">
          <div class="collapsible-title-group">
            <h3>Import issues</h3>
            <p class="section-subtitle">CORS, authentication, parsing, and empty-content warnings.</p>
          </div>
          <span class="collapse-icon"></span>
        </div>
        <div class="collapsible-body">
          <div class="results-section">
            ${issuesHtml}
          </div>
        </div>
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
                  <span class="doc-badge">${document.documentLevel.inferredType}</span>
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
                  <span class="doc-badge">${document.documentLevel.inferredType}</span>
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

function formatLabel(value) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (match) => match.toUpperCase());
}

function buildFilterButton(value, label, activeFilter) {
  const activeClass = value === activeFilter ? "active" : "";
  return `<button class="toggle-btn ${activeClass}" type="button" data-view-filter="${value}">${label}</button>`;
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
    renderEmptyResults();
    return;
  }

  const result = analyzeDocuments(documents, threshold);
  state.analysisView.query = "";
  state.analysisView.filter = "all";
  renderResults(result, issues);
  renderStatus(`Analyzed ${result.documents.length} documents with a ${threshold.toFixed(2)} similarity threshold.`, "success");
}

function wireDemoControls() {
  const toggle = document.querySelector("#include-sample");
  const loadUrlsButton = document.querySelector("[data-load-sample-urls]");
  const runDemoButton = document.querySelector("[data-run-demo]");

  toggle.addEventListener("change", () => {
    state.includeSampleData = toggle.checked;
    updateSourceSummary();
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
  });

  document.querySelector("#files").addEventListener("change", () => {
    updateSourceSummary();
  });

  document.querySelector("[data-manual-documents]").addEventListener("input", () => {
    updateSourceSummary();
  });
}

function initialize() {
  setupManualDocuments();
  wireDemoControls();
  wireForm();
  wireSourceTabs();
  setActiveSourceTab(state.activeSourceTab);
  updateSourceSummary();
  void loadDeploymentBadge();
  renderEmptyResults();
  renderStatus("Ready. Load the demo library, upload files, paste URLs, or add manual documents.");
}

initialize();
