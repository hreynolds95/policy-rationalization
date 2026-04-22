from __future__ import annotations

from dataclasses import dataclass

from .models import Document, DuplicateGroup


@dataclass(frozen=True)
class ConsolidationRules:
    protected_section_keywords: tuple[str, ...] = (
        "roles and responsibilities",
        "required language",
        "scope",
        "applicability",
    )
    prohibited_content_keywords: tuple[str, ...] = (
        "procedure",
        "step 1",
        "workflow",
        "how to",
    )


DEFAULT_RULES = ConsolidationRules()


def evaluate_group_constraints(
    group: DuplicateGroup,
    docs_by_id: dict[int, Document],
    rules: ConsolidationRules = DEFAULT_RULES,
) -> dict[str, str]:
    combined = "\n".join(docs_by_id[doc_id].text.lower() for doc_id in group.document_ids)

    has_procedural = any(k in combined for k in rules.prohibited_content_keywords)
    has_roles = "roles and responsibilities" in combined
    has_regulatory_refs = any(
        token in combined
        for token in (
            "regulation",
            "regulatory",
            "legal",
            "compliance",
            "statutory",
        )
    )
    has_brand_terms = any(token in combined for token in ("brand", "affiliate", "subsidiary", "entity"))

    return {
        "business_practice_alignment": "manual-review",
        "brand_scope_coverage": "present" if has_brand_terms else "missing",
        "regulatory_reflection": "present" if has_regulatory_refs else "missing",
        "procedural_content_detected": "yes" if has_procedural else "no",
        "roles_section_detected": "yes" if has_roles else "no",
    }
