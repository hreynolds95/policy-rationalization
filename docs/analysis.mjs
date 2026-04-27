const TOKEN_RE = /[a-zA-Z][a-zA-Z0-9_-]+/g;

const POLICY_TERMS = [
  "policy",
  "governance",
  "principle",
  "principles",
  "scope",
  "purpose",
  "applies",
  "must",
  "shall",
];
const STANDARD_TERMS = [
  "standard",
  "baseline",
  "control",
  "controls",
  "minimum",
  "requirement",
  "requirements",
  "specification",
  "configuration",
];
const PROCEDURE_TERMS = [
  "procedure",
  "procedures",
  "process",
  "workflow",
  "instruction",
  "instructions",
  "runbook",
  "step",
  "steps",
];
const REQUIREMENT_CUE_TERMS = [
  "must",
  "shall",
  "required",
  "requires",
  "may not",
  "cannot",
  "should",
  "will",
  "step",
  "steps",
  "process",
  "workflow",
];
const BULLET_PREFIX_RE = /^([-*•]|\d+[.)]|[a-zA-Z][.)])\s+/;

export const DOCUMENT_TYPES = ["policy", "standard", "procedure"];

export function tokenize(text) {
  return (text.match(TOKEN_RE) || []).map((token) => token.toLowerCase());
}

function termFrequency(tokens) {
  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return counts;
}

function inverseDocumentFrequency(tokenizedDocuments) {
  const docFrequency = new Map();
  const totalDocuments = tokenizedDocuments.length;

  for (const tokens of tokenizedDocuments) {
    const unique = new Set(tokens);
    for (const token of unique) {
      docFrequency.set(token, (docFrequency.get(token) || 0) + 1);
    }
  }

  const idf = new Map();
  for (const [term, frequency] of docFrequency.entries()) {
    idf.set(term, Math.log((1 + totalDocuments) / (1 + frequency)) + 1.0);
  }
  return idf;
}

function vectorize(tf, idf) {
  const vector = new Map();
  for (const [term, count] of tf.entries()) {
    vector.set(term, count * (idf.get(term) || 0));
  }
  return vector;
}

function cosineSimilarity(left, right) {
  if (!left.size || !right.size) {
    return 0;
  }

  let dot = 0;
  const smaller = left.size <= right.size ? left : right;
  const larger = left.size <= right.size ? right : left;

  for (const [term, value] of smaller.entries()) {
    dot += value * (larger.get(term) || 0);
  }

  const normLeft = Math.sqrt([...left.values()].reduce((sum, value) => sum + value * value, 0));
  const normRight = Math.sqrt([...right.values()].reduce((sum, value) => sum + value * value, 0));

  if (!normLeft || !normRight) {
    return 0;
  }

  return dot / (normLeft * normRight);
}

export function computeSimilarityEdges(documents, threshold = 0.45) {
  const tokenizedDocuments = documents.map((document) => tokenize(document.text));
  const idf = inverseDocumentFrequency(tokenizedDocuments);
  const vectors = tokenizedDocuments.map((tokens) => vectorize(termFrequency(tokens), idf));
  const edges = [];

  for (let i = 0; i < documents.length; i += 1) {
    for (let j = i + 1; j < documents.length; j += 1) {
      const score = cosineSimilarity(vectors[i], vectors[j]);
      if (score >= threshold) {
        edges.push({
          leftId: documents[i].id,
          rightId: documents[j].id,
          score: Number(score.toFixed(4)),
        });
      }
    }
  }

  return edges.sort((left, right) => right.score - left.score);
}

class DisjointSet {
  constructor() {
    this.parent = new Map();
  }

  find(value) {
    if (!this.parent.has(value)) {
      this.parent.set(value, value);
    }
    if (this.parent.get(value) !== value) {
      this.parent.set(value, this.find(this.parent.get(value)));
    }
    return this.parent.get(value);
  }

  union(left, right) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) {
      this.parent.set(rightRoot, leftRoot);
    }
  }
}

function sourceDepth(source) {
  return source.split("/").filter(Boolean).length;
}

function countMatches(text, terms) {
  const lower = text.toLowerCase();
  return terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
}

function normalizeRequirementText(text) {
  return text
    .replace(BULLET_PREFIX_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

function containsRequirementCue(text) {
  const lower = text.toLowerCase();
  return REQUIREMENT_CUE_TERMS.some((term) => lower.includes(term));
}

function looksLikeHeadingBlock(text) {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  if (containsRequirementCue(normalized)) {
    return false;
  }
  if (normalized.length > 90) {
    return false;
  }
  return !/[.;!?]/.test(normalized) || normalized.endsWith(":");
}

function inferRequirementType(text, documentLevelType = "policy") {
  const lower = text.toLowerCase();
  if (/\bstep\s+\d+\b/.test(lower) || countMatches(lower, PROCEDURE_TERMS) >= 2) {
    return "procedure-like content";
  }
  if (countMatches(lower, STANDARD_TERMS) > countMatches(lower, POLICY_TERMS)) {
    return "standard-level requirement";
  }
  if (documentLevelType === "standard") {
    return "standard-level requirement";
  }
  return "policy-level requirement";
}

function splitRequirementCandidates(block) {
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) {
    return [];
  }

  const bulletLines = lines.filter((line) => BULLET_PREFIX_RE.test(line));
  if (lines.length > 1 && bulletLines.length >= Math.ceil(lines.length / 2)) {
    return lines.map((line, index) => ({
      text: normalizeRequirementText(line),
      itemIndex: index + 1,
    }));
  }

  const paragraph = normalizeRequirementText(lines.join(" "));
  const sentenceParts = paragraph
    .split(/(?<=[.;])\s+(?=[A-Z0-9])/)
    .map((part) => normalizeRequirementText(part))
    .filter(Boolean);

  const candidates = sentenceParts.filter((part) => containsRequirementCue(part) || part.length >= 40);
  if (candidates.length > 1) {
    return candidates.map((text, index) => ({
      text,
      itemIndex: index + 1,
    }));
  }

  return paragraph
    ? [
        {
          text: paragraph,
          itemIndex: 1,
        },
      ]
    : [];
}

export function evaluateDocumentLevel(document, forcedType = "") {
  const title = document.title.toLowerCase();
  const text = document.text.toLowerCase();
  const combined = `${title}\n${text}`;

  const titlePolicy = title.includes("policy") ? 3 : 0;
  const titleStandard = title.includes("standard") ? 3 : 0;
  const titleProcedure = title.includes("procedure") || title.includes("process") ? 3 : 0;

  const scores = {
    policy: titlePolicy + countMatches(combined, POLICY_TERMS),
    standard: titleStandard + countMatches(combined, STANDARD_TERMS),
    procedure: titleProcedure + countMatches(combined, PROCEDURE_TERMS),
  };

  const autoInferredType = Object.entries(scores).sort((left, right) => right[1] - left[1])[0][0];
  const inferredType = DOCUMENT_TYPES.includes(forcedType) ? forcedType : autoInferredType;
  const policySignals = countMatches(combined, POLICY_TERMS);
  const standardSignals = countMatches(combined, STANDARD_TERMS);
  const procedureSignals = countMatches(combined, PROCEDURE_TERMS);
  const hasStepPattern = /\bstep\s+\d+\b/.test(text);
  const levelIssues = [];
  let levelFit = "aligned";

  if (inferredType === "policy") {
    if (procedureSignals >= 2 || hasStepPattern) {
      levelFit = "misaligned";
      levelIssues.push("contains procedural or step-by-step language better suited to a procedure");
    }
    if (standardSignals >= 4) {
      levelFit = levelFit === "misaligned" ? "misaligned" : "review";
      levelIssues.push("reads like a control standard in places and may be carrying implementation detail");
    }
  }

  if (inferredType === "standard") {
    if (procedureSignals >= 3 || hasStepPattern) {
      levelFit = "review";
      levelIssues.push("contains execution-oriented language that may belong in a procedure");
    }
    if (standardSignals < 2) {
      levelFit = "review";
      levelIssues.push("does not show enough control-specific or minimum-requirement language for a standard");
    }
  }

  if (inferredType === "procedure") {
    if (procedureSignals < 2 && !hasStepPattern) {
      levelFit = "review";
      levelIssues.push("does not read like a step-based procedure yet");
    }
    if (policySignals >= 4 && standardSignals === 0) {
      levelFit = "review";
      levelIssues.push("reads at a policy level and may not belong in a procedure document");
    }
  }

  return {
    inferredType,
    autoInferredType,
    overrideType: DOCUMENT_TYPES.includes(forcedType) ? forcedType : "",
    isOverrideApplied: DOCUMENT_TYPES.includes(forcedType),
    levelFit,
    levelIssues,
    signalCounts: {
      policy: policySignals,
      standard: standardSignals,
      procedure: procedureSignals,
    },
  };
}

export function extractRequirementsFromDocument(document, documentLevelType = "policy") {
  const blocks = String(document.text || "")
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  const fallbackBlocks = !blocks.length
    ? String(document.text || "")
        .split(/\n+/)
        .map((block) => block.trim())
        .filter(Boolean)
    : blocks;

  const requirements = [];
  let activeSection = "Document body";
  let requirementIndex = 0;

  fallbackBlocks.forEach((block, blockIndex) => {
    if (looksLikeHeadingBlock(block)) {
      activeSection = normalizeRequirementText(block).replace(/:$/, "") || activeSection;
      return;
    }

    const candidates = splitRequirementCandidates(block)
      .map((candidate) => ({
        ...candidate,
        text: normalizeRequirementText(candidate.text),
      }))
      .filter((candidate) => candidate.text && !looksLikeHeadingBlock(candidate.text));

    candidates.forEach((candidate) => {
      requirementIndex += 1;
      requirements.push({
        requirementId: `${String(document.id)}::req-${requirementIndex}`,
        documentId: document.id,
        sourceDocumentTitle: document.title,
        sourceDocumentType: documentLevelType,
        sourceLocation: {
          section: activeSection,
          paragraphIndex: blockIndex + 1,
          itemIndex: candidate.itemIndex,
        },
        requirementText: candidate.text,
        normalizedRequirementText: candidate.text.toLowerCase().replace(/\s+/g, " ").trim(),
        requirementType: inferRequirementType(candidate.text, documentLevelType),
      });
    });
  });

  return requirements;
}

function evaluateConstraints(group, documentById) {
  const combined = group.documentIds.map((id) => documentById.get(id).text.toLowerCase()).join("\n");
  const proceduralTerms = ["procedure", "step 1", "workflow", "how to"];
  const regulatoryTerms = ["regulation", "regulatory", "legal", "compliance", "statutory"];
  const brandTerms = ["brand", "affiliate", "subsidiary", "entity"];
  const levelTypes = new Set(group.documentIds.map((id) => documentById.get(id).documentLevel.inferredType));
  const levelIssues = group.documentIds.flatMap((id) => documentById.get(id).documentLevel.levelIssues);
  const hasLevelReview = group.documentIds.some(
    (id) => documentById.get(id).documentLevel.levelFit !== "aligned"
  );

  return {
    documentLevelConsistency: levelTypes.size === 1 ? "consistent" : "mixed-level",
    documentLevelFit: hasLevelReview || levelTypes.size > 1 ? "review-needed" : "aligned",
    businessPracticeAlignment: "manual-review",
    brandScopeCoverage: brandTerms.some((term) => combined.includes(term)) ? "present" : "missing",
    regulatoryReflection: regulatoryTerms.some((term) => combined.includes(term)) ? "present" : "missing",
    proceduralContentDetected: proceduralTerms.some((term) => combined.includes(term)) ? "yes" : "no",
    rolesSectionDetected: combined.includes("roles and responsibilities") ? "yes" : "no",
    documentLevelIssues: levelIssues,
  };
}

function buildRecommendation(group, documentById, checks) {
  const primary = documentById.get(group.recommendedPrimaryId);
  const others = group.documentIds.filter((id) => id !== group.recommendedPrimaryId).map((id) => documentById.get(id));
  const blockers = [];

  if (checks.brandScopeCoverage === "missing") {
    blockers.push("confirm cross-brand scope before merging");
  }
  if (checks.regulatoryReflection === "missing") {
    blockers.push("validate regulatory language coverage");
  }
  if (checks.proceduralContentDetected === "yes") {
    blockers.push("remove procedural detail from policy-level content");
  }
  if (checks.documentLevelConsistency === "mixed-level") {
    blockers.push("separate policy, standard, and procedure material before consolidation");
  }
  if (checks.documentLevelFit === "review-needed") {
    blockers.push("reconfirm each document is operating at the right requirement level");
  }

  const blockerSentence = blockers.length
    ? ` Watch-outs: ${blockers.join("; ")}.`
    : "";

  return `Keep ${primary.title} as the canonical document and consolidate ${others.length} overlapping document(s) into its template without changing required structure or core roles language.${blockerSentence}`;
}

function classifyRecommendationBucket(checks) {
  const materialTriggers = [
    checks.brandScopeCoverage === "missing",
    checks.regulatoryReflection === "missing",
    checks.proceduralContentDetected === "yes",
    checks.documentLevelConsistency === "mixed-level",
    checks.documentLevelFit === "review-needed",
  ];

  return materialTriggers.some(Boolean) ? "material-change" : "quick-win";
}

export function buildDuplicateGroups(documents, edges) {
  const dsu = new DisjointSet();
  const edgeLookup = new Map();
  const documentById = new Map(documents.map((document) => [document.id, document]));

  for (const document of documents) {
    dsu.find(document.id);
  }

  for (const edge of edges) {
    dsu.union(edge.leftId, edge.rightId);
    edgeLookup.set([edge.leftId, edge.rightId].sort().join("::"), edge.score);
  }

  const components = new Map();
  for (const document of documents) {
    const root = dsu.find(document.id);
    if (!components.has(root)) {
      components.set(root, []);
    }
    components.get(root).push(document.id);
  }

  const groups = [];
  for (const ids of components.values()) {
    if (ids.length < 2) {
      continue;
    }

    ids.sort((left, right) => left - right);
    const pairScores = [];
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const score = edgeLookup.get([ids[i], ids[j]].sort().join("::"));
        if (typeof score === "number") {
          pairScores.push(score);
        }
      }
    }

    const recommendedPrimaryId = [...ids].sort((left, right) => {
      const leftDocument = documentById.get(left);
      const rightDocument = documentById.get(right);
      return (
        sourceDepth(leftDocument.source) - sourceDepth(rightDocument.source) ||
        rightDocument.text.length - leftDocument.text.length ||
        leftDocument.source.localeCompare(rightDocument.source)
      );
    })[0];

    const group = {
      documentIds: ids,
      avgInternalSimilarity: Number(
        (pairScores.reduce((sum, score) => sum + score, 0) / (pairScores.length || 1)).toFixed(4)
      ),
      recommendedPrimaryId,
    };
    const checks = evaluateConstraints(group, documentById);

    groups.push({
      ...group,
      checks,
      recommendationBucket: classifyRecommendationBucket(checks),
      recommendation: buildRecommendation(group, documentById, checks),
    });
  }

  return groups.sort(
    (left, right) =>
      right.avgInternalSimilarity - left.avgInternalSimilarity ||
      right.documentIds.length - left.documentIds.length
  );
}

export function analyzeDocuments(documents, threshold = 0.45, levelOverrides = {}) {
  const normalizedDocuments = documents.map((document, index) => ({
    id: document.id ?? index,
    title: document.title || `Document ${index + 1}`,
    source: document.source || `manual://document-${index + 1}`,
    text: document.text || "",
  }));
  const documentsWithLevel = normalizedDocuments.map((document) => {
    const documentLevel = evaluateDocumentLevel(document, levelOverrides[document.id] || "");
    const requirements = extractRequirementsFromDocument(document, documentLevel.inferredType);
    return {
      ...document,
      documentLevel,
      requirements,
      requirementCount: requirements.length,
    };
  });
  const edges = computeSimilarityEdges(documentsWithLevel, threshold);
  const groups = buildDuplicateGroups(documentsWithLevel, edges);
  const requirements = documentsWithLevel.flatMap((document) => document.requirements);
  return {
    documents: documentsWithLevel,
    requirements,
    edges,
    groups,
  };
}

export function normalizeGoogleExportUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!url.hostname.includes("docs.google.com")) {
      return rawUrl;
    }

    const documentMatch = url.pathname.match(/\/document\/d\/([^/]+)/);
    if (documentMatch) {
      return `https://docs.google.com/document/d/${documentMatch[1]}/export?format=txt`;
    }

    const spreadsheetMatch = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (spreadsheetMatch) {
      const gid = url.searchParams.get("gid") || "0";
      return `https://docs.google.com/spreadsheets/d/${spreadsheetMatch[1]}/export?format=csv&gid=${gid}`;
    }
  } catch {
    return rawUrl;
  }

  return rawUrl;
}

export function extractTextFromHtml(html) {
  if (typeof DOMParser === "undefined") {
    return html.replace(/<[^>]+>/g, " ");
  }
  const parser = new DOMParser();
  const document = parser.parseFromString(html, "text/html");
  document.querySelectorAll("script, style, noscript").forEach((node) => node.remove());
  return document.body?.textContent?.replace(/\s+/g, " ").trim() || "";
}

export function isGoogleAuthPage(text) {
  const lower = text.toLowerCase();
  return lower.includes("sign in to your google account") && lower.includes("docs.google.com");
}

export function parseCsv(text, sourceLabel = "uploaded.csv") {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const content = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);

  const [headerRow, ...dataRows] = rows.filter((candidate) => candidate.some((value) => value.trim() !== ""));
  if (!headerRow || !headerRow.length) {
    return [];
  }

  const headers = headerRow.map((header) => header.trim());
  const lowered = new Map(headers.map((header) => [header.toLowerCase(), header]));
  const textColumn =
    lowered.get("content") ||
    lowered.get("document_text") ||
    lowered.get("text") ||
    lowered.get("policy_text") ||
    lowered.get("body") ||
    lowered.get("summary") ||
    lowered.get("description");
  const titleColumn =
    lowered.get("title") ||
    lowered.get("document_name") ||
    lowered.get("policy_name") ||
    lowered.get("policy") ||
    lowered.get("name") ||
    lowered.get("id");

  if (!textColumn) {
    return [];
  }

  return dataRows
    .map((dataRow, index) => {
      const record = Object.fromEntries(headers.map((header, headerIndex) => [header, dataRow[headerIndex] || ""]));
      const textValue = (record[textColumn] || "").trim();
      if (!textValue) {
        return null;
      }
      return {
        id: `${sourceLabel}-row-${index + 1}`,
        title: (titleColumn && record[titleColumn].trim()) || `Row ${index + 1}`,
        source: `${sourceLabel}#row-${index + 1}`,
        text: textValue,
      };
    })
    .filter(Boolean);
}
