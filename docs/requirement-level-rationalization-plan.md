# Requirement-Level Rationalization Plan

## Why the current approach is not the right end state

The current Pages app is a document-centric prototype. It:

- clusters whole documents by similarity
- evaluates policy / standard / procedure fit at the document level
- recommends consolidation at the document-group level

That is useful for early triage, but it is not the actual rationalization target.

The target state is:

- requirement-level analysis, not whole-document scoring
- 1:1 mapping of requirements across candidate source documents
- complete coverage of all in-scope requirements
- explicit identification of:
  - exact duplicates
  - near-duplicates
  - unmatched requirements
  - one-to-many / many-to-one mapping conflicts
- a redlined consolidation output, not just a dashboard recommendation

## Correct analysis unit

The primary unit of analysis should be a `requirement`, not a `document`.

Each source document should first be decomposed into atomic requirements. Each requirement record should carry:

- `requirement_id`
- `source_document_id`
- `source_document_title`
- `source_document_type`
- `source_location`
  - section title
  - paragraph number
  - bullet / numbered item index when available
- `requirement_text`
- `normalized_requirement_text`
- `brand_scope_tags`
- `regulatory_tags`
- `roles_tags`
- `requirement_type`
  - policy-level requirement
  - standard-level requirement
  - procedure-like content

## Target workflow

### Step 1: Ingest source documents

Load the candidate policies, standards, and procedures that may need rationalization.

### Step 2: Extract atomic requirements

Break each document into atomic requirements.

The extraction rule should be strict:

- one requirement per row / unit
- no multi-requirement paragraphs unless they cannot be separated safely
- preserve original text exactly for downstream redline use

### Step 3: Build requirement mapping candidates

Compare requirements across documents and generate candidate matches.

Each requirement should end in one of these states:

- `exact-match`
- `near-duplicate`
- `partial-overlap`
- `unmapped`
- `conflict`

### Step 4: Enforce 1:1 mapping

This is the core rule.

Each requirement should map cleanly to:

- one canonical requirement
- or no canonical requirement if it is unique

Flag as conflict when:

- one source requirement maps to multiple canonical candidates
- multiple source requirements from the same document collapse into one cluster
- one consolidated requirement would drop meaningful scope, condition, actor, or obligation

### Step 5: Decide consolidation treatment

For each requirement cluster, determine:

- keep as-is
- merge into canonical wording
- preserve as distinct
- split because the requirement is carrying multiple concepts
- move procedural detail out of policy / standard text

### Step 6: Generate redlined consolidation artifact

The final deliverable should be a redlined draft, not a summary dashboard.

## Output requirements

The preferred output is a Google Doc redline where:

- current retained text appears as normal body text in black
- proposed insertions / revisions appear as suggestions
- suggested language is visually red
- removed or replaced text is represented as tracked suggestions, not silent deletion

This means the output should behave like an editorial working draft, not a report.

## Important distinction: red text vs Google Docs suggestion mode

These are not the same thing.

- Red text is just formatting.
- Suggestion mode is tracked editorial state inside Google Docs.

The true target should be Google Docs suggestions.

If suggestion mode cannot be produced directly in a given write path, the fallback should be:

- create a structured redline draft with current text preserved
- mark all proposed insertions and replacements clearly
- then apply those edits into Google Docs suggestion mode through a supported editor workflow

## Platform implication

The current GitHub Pages app can support:

- requirement extraction preview
- 1:1 mapping review
- consolidation decisioning
- redline payload generation

The current GitHub Pages app cannot, by itself, be the full Google Docs suggestion-mode writer because it is a static client-side site with no authenticated document-writing backend.

That final step should be treated as a separate integration milestone.

## Recommended product architecture

### 1. Requirement extraction engine

Input:

- exported Google Docs text
- uploaded files
- pasted text

Output:

- structured requirement rows with source anchors

### 2. Requirement mapping engine

Input:

- extracted requirements

Output:

- candidate matches
- match scores
- conflict flags
- unmatched requirements

### 3. Consolidation decision engine

Input:

- reviewed requirement mappings

Output:

- canonical requirement text
- merge / preserve / split decisions
- rationale

### 4. Redline compiler

Input:

- source anchor
- canonical text
- proposed replacement text

Output:

- ordered redline operations
- preserve
- insert
- replace
- split-out procedural text

### 5. Google Docs writer

Input:

- redline operations

Output:

- Google Doc working draft
- ideally in native suggestion mode

## Proposed data model

### Source document

```json
{
  "document_id": "doc-1",
  "title": "Records Retention Policy",
  "document_type": "policy",
  "source_url": "https://...",
  "source_text": "..."
}
```

### Extracted requirement

```json
{
  "requirement_id": "req-1",
  "document_id": "doc-1",
  "location": {
    "section": "Retention Requirements",
    "paragraph_index": 8,
    "item_index": 2
  },
  "text": "Records must be retained for seven years.",
  "requirement_type": "policy-level requirement"
}
```

### Requirement mapping cluster

```json
{
  "cluster_id": "cluster-1",
  "canonical_requirement_id": "req-1",
  "requirement_ids": ["req-1", "req-7", "req-12"],
  "mapping_status": "one-to-one",
  "consolidation_treatment": "merge-into-canonical",
  "materiality": "quick-win"
}
```

### Redline operation

```json
{
  "operation_id": "op-1",
  "target_document_id": "doc-1",
  "target_requirement_id": "req-1",
  "action": "replace",
  "current_text": "Records must be retained for seven years.",
  "proposed_text": "Records and supporting evidence must be retained for seven years."
}
```

## Recommended near-term build sequence

### Phase 1

Replace document-level clustering with requirement extraction plus requirement inventory.

Deliverable:

- every imported document is decomposed into atomic requirements

### Phase 2

Replace document-group recommendations with requirement mapping and 1:1 conflict detection.

Deliverable:

- requirement mapping review surface
- unmatched / duplicate / conflict buckets

### Phase 3

Generate a redline payload from reviewed mappings.

Deliverable:

- ordered proposed edits
- exportable review package

### Phase 4

Integrate with Google Docs output.

Deliverable:

- Google Doc draft with preserved current text and proposed edits
- native suggestion mode when supported by the chosen integration path

## Practical recommendation for this repo

The next implementation step should not be more document-level UI polish.

The next implementation step should be:

- requirement extraction
- requirement inventory review
- 1:1 mapping logic

Everything else should build on top of that.
