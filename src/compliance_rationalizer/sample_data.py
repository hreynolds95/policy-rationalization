from __future__ import annotations

from pathlib import Path

from .models import Document


def sample_urls_text() -> str:
    return "\n".join(
        [
            "https://example.com/policies/data-retention-policy",
            "https://example.com/policies/records-retention-standard",
            "https://example.com/policies/vendor-risk-policy",
            "https://example.com/policies/vendor-management-standard",
        ]
    )


def load_sample_documents() -> list[Document]:
    docs = [
        Document(
            id=0,
            path=Path("sample://data-retention-policy"),
            title="Data Retention Policy",
            text=(
                "Purpose: define enterprise retention requirements. "
                "Scope and applicability include all brands and subsidiaries. "
                "Roles and responsibilities: CPC and CCO oversee governance. "
                "Required language: retain records according to regulatory and legal hold obligations."
            ),
        ),
        Document(
            id=1,
            path=Path("sample://records-retention-standard"),
            title="Records Retention Standard",
            text=(
                "Purpose: define retention obligations for business records. "
                "Scope and applicability include all brands and affiliates. "
                "Roles and responsibilities: CPC and CCO oversee control execution. "
                "Required language: records are retained in line with regulation and legal requirements."
            ),
        ),
        Document(
            id=2,
            path=Path("sample://vendor-risk-policy"),
            title="Vendor Risk Policy",
            text=(
                "Purpose: establish third-party risk controls. "
                "Scope applies to procurement and risk functions across entities. "
                "Roles and responsibilities: CCO and risk leadership approve exceptions. "
                "Required language: vendors are risk-tiered under compliance requirements."
            ),
        ),
        Document(
            id=3,
            path=Path("sample://vendor-management-standard"),
            title="Vendor Management Standard",
            text=(
                "Purpose: standardize third-party oversight. "
                "Scope applies to supplier onboarding and monitoring. "
                "Roles and responsibilities: risk leadership and CCO monitor compliance. "
                "Required language: vendors are assessed and monitored under regulatory expectations."
            ),
        ),
    ]
    return docs
