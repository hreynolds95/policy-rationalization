export const SAMPLE_LIBRARIES = {
  mock: {
    key: "mock",
    label: "Illustrative demo",
    shortLabel: "Demo",
    description: "Synthetic sample documents for a lightweight walkthrough.",
    isRealContent: false,
    documents: [
      {
        id: "sample-1",
        title: "Data Retention Policy",
        source: "sample://data-retention-policy",
        text:
          "Purpose: define enterprise retention requirements. Scope and applicability include all brands and subsidiaries. Roles and responsibilities: CPC and CCO oversee governance. Required language: retain records according to regulatory and legal hold obligations.",
      },
      {
        id: "sample-2",
        title: "Records Retention Standard",
        source: "sample://records-retention-standard",
        text:
          "Purpose: define retention obligations for business records. Scope and applicability include all brands and affiliates. Roles and responsibilities: CPC and CCO oversee control execution. Required language: records are retained in line with regulation and legal requirements.",
      },
      {
        id: "sample-3",
        title: "Vendor Risk Policy",
        source: "sample://vendor-risk-policy",
        text:
          "Purpose: establish third-party risk controls. Scope applies to procurement and risk functions across entities. Roles and responsibilities: CCO and risk leadership approve exceptions. Required language: vendors are risk-tiered under compliance requirements.",
      },
      {
        id: "sample-4",
        title: "Vendor Management Standard",
        source: "sample://vendor-management-standard",
        text:
          "Purpose: standardize third-party oversight. Scope applies to supplier onboarding and monitoring. Roles and responsibilities: risk leadership and CCO monitor compliance. Required language: vendors are assessed and monitored under regulatory expectations.",
      },
    ],
    urls: [
      "https://example.com/policies/data-retention-policy",
      "https://example.com/policies/records-retention-standard",
      "https://example.com/policies/vendor-risk-policy",
      "https://example.com/policies/vendor-management-standard",
    ],
  },
  real: {
    key: "real",
    label: "Real policy starter set",
    shortLabel: "Real corpus",
    description: "Extracted examples from the published policy library for requirement-level calibration.",
    isRealContent: true,
    documents: [
      {
        id: "real-sanctions-policy",
        title: "Global Sanctions Compliance Policy",
        source: "drive://1hJbC532uJ9UIAQU-SGdgg9VRqZRk1V0X",
        text:
          "Global Sanctions Compliance Policy\n" +
          "Introduction and Purpose: This Global Sanctions Compliance Policy outlines Block's approach to ensuring compliance with applicable Economic Sanctions laws and regulations. The Policy sets forth Block's commitment to comply with applicable Economic Sanctions laws and regulations in all jurisdictions in which it does business. Compliance with this Policy and relevant laws and regulations is to be achieved through the implementation of risk-based compliance programs, including but not limited to the Global Sanctions Compliance Program.\n\n" +
          "Scope: This Policy is established by Block and is applicable globally across all Block business lines, subsidiaries, and jurisdictions.\n\n" +
          "Policy Requirements: This Policy prohibits activity involving certain jurisdictions and persons. The Policy further prohibits any direct or indirect dealings that would otherwise violate any applicable sanctions laws and regulations. The Policy requires Block to implement and maintain policies, procedures, controls, processes, and systems reasonably designed to ensure compliance with all applicable sanctions laws and regulations. The Policy requires Block to conduct sanctions risk assessments, to be subject to independent periodic audits, and to comply with sanctions reporting obligations required by relevant regulatory authorities.\n\n" +
          "Duty to Report and Non-Retaliation: Any potential violations of this Policy or any sanctions-related law or regulation must be reported immediately. Block will not tolerate retaliation against any individual who submits a good faith allegation of a suspected violation.\n\n" +
          "Exceptions: The Policy Owner or designee will have authority to approve exceptions and exemptions to this Policy provided that the proposed exception does not violate applicable laws and regulations. Exception requests must be documented in writing, include a reason for the request, and describe the controls the Company will implement to mitigate associated risks.\n\n" +
          "Record Retention: All documents must be retained according to the longer of Block's Data Classification and Handling Policy or applicable regulatory requirements. The minimum record retention standard applicable to sanctions is 10 years.",
      },
      {
        id: "real-sanctions-standard",
        title: "Global Sanctions Compliance Program Standard",
        source: "drive://1HUd0JQvTK9cmirS9Qhk7C0p6_XYrCD63",
        text:
          "Global Sanctions Compliance Program Standard\n" +
          "Introduction: This Global Sanctions Compliance Program Standard outlines Block's approach to complying with applicable sanctions laws and regulations in the jurisdictions in which it operates. This Standard is intended to supplement Block's Global Sanctions Compliance Policy.\n\n" +
          "Purpose: The purpose of this Standard is to further Block's global sanctions compliance program by establishing a framework and standards for ensuring compliance with applicable sanctions laws and regulations. This Standard is designed to satisfy and operationalize the Policy.\n\n" +
          "Scope: This Standard is established by Block and is applicable globally across all Block business lines, subsidiaries, and jurisdictions.\n\n" +
          "Standard Requirements: Block implements risk-based internal controls to comply with the Policy and prevent the use of Block's products and services in violation of applicable sanctions laws and regulations. Controls include employee screening, vendor screening, customer screening, transaction screening, geoblocking controls, partner due diligence and oversight, watchlist management, and procedures and guidance. Block is responsible for conducting AML/CFT and sanctions risk assessments. Internal Audit is required to conduct independent periodic risk-based assessments on the adequacy and effectiveness of the global sanctions compliance program. Block complies with sanctions reporting obligations mandated by relevant regulatory authorities.\n\n" +
          "Training: Block is responsible for the implementation of an AML/CFT training program that includes a segment on sanctions. Staff Members must complete training upon hire and each calendar year thereafter.\n\n" +
          "Exceptions: The Global Head of Sanctions may approve exceptions and exemptions to the Policy, provided that the proposed exception does not violate applicable laws and regulations. Policy exception requests must be documented in writing and include a reason and mitigating controls.\n\n" +
          "Record Retention: Block implements a standard record retention requirement of five years for sanctions-related records, with a 10-year retention requirement effective March 13, 2025 for the records described in this Standard.",
      },
      {
        id: "real-complaint-policy",
        title: "Canada Complaint Policy | Afterpay Canada Ltd.",
        source: "drive://1nTHVSYAwlZ32ixzzbUJQwCCWmEj2yqvD",
        text:
          "Canada Complaint Policy\n" +
          "Introduction: This Complaint Policy outlines Afterpay Canada Ltd.'s approach to managing complaints. The purpose of this Policy is to further Block's Global Complaint Policy and Block's Global Complaint Program by providing for applicable Canadian complaint requirements to ensure Afterpay Canada's compliance.\n\n" +
          "Purpose: This Policy ensures that Afterpay Canada's complaint handling processes comply with all local laws and regulations in Canada. The objective of the Policy is to ensure that Afterpay Canada establishes and adheres to a consistent process for handling complaints, including investigating, addressing, tracking, managing, and responding to customer complaints.\n\n" +
          "Scope: This Policy is established by Afterpay Canada and is applicable across all Afterpay Canada business lines. If Canada or a banking partner has stricter requirements than the Block Policy and Program, Afterpay Canada will follow the stricter standard.\n\n" +
          "Policy Requirements: Complaints raised in the first instance will be handled by a representative from a customer service team and may be escalated where relevant. Afterpay Canada acknowledges all complaints within 5 business days and makes every effort to resolve customer complaints within 15 business days. Customers have the right to lodge complaints with relevant consumer agencies and regulatory bodies. Complaint handling processes must comply with federal and provincial privacy laws, provincial consumer protection laws, and other applicable guidance.\n\n" +
          "Training: All relevant Staff Members will receive training at least annually covering applicable requirements and guidance to implement this Policy effectively.\n\n" +
          "Monitoring and Reporting: The Policy Owner or designee will monitor policy related activities to evaluate adherence and determine whether outputs adhere to established objectives.\n\n" +
          "Record Retention: Complaint logs and associated data must be retained for a minimum of seven years unless otherwise directed by legal and compliance teams or the Global Complaint Program.",
      },
      {
        id: "real-complaint-standard",
        title: "Global Complaint Program Standard | Block",
        source: "drive://1V8NVSZkp1RtZ2Lsgf5eOXwltSJImbS0X",
        text:
          "Global Complaint Program Standard\n" +
          "Introduction: This Global Complaint Program Standard outlines Block's minimum requirements for complaint management and provides a structured framework for developing and managing complaint programs within each business.\n\n" +
          "Purpose: Block developed this Standard to create a unified complaint management framework. The Global Complaints Policy establishes the high-level principles and expectations for managing complaints across Block, while this Standard outlines how to achieve them.\n\n" +
          "Applicability: This Standard applies to the Block entities listed in the document across all jurisdictions and subsidiaries to which the Standard applies.\n\n" +
          "Standard Requirements: This Standard mandates the establishment of a framework to ensure consistent and compliant handling of complaints across all business markets and product lines. It defines lifecycle stages from intake to closure, assigns clear responsibilities for intake, investigation, resolution, quality assurance, reporting, root cause analysis, and oversight functions. Businesses must document intake channels, obtain minimum complaint information, formally acknowledge complaints within the required timeframe, aim to close complaints within 15 business days or less, maintain complaint case management data, provide monthly reporting, and conduct root cause analysis where appropriate.\n\n" +
          "Training: All relevant Staff Members will receive training at least annually covering applicable requirements and guidance to implement this Standard effectively.\n\n" +
          "Exceptions: The Document Owner or designee may approve exceptions and exemptions to this Standard provided that the proposed exception does not violate applicable contracts, laws, and regulations.\n\n" +
          "Record Retention: General customer complaint records are retained for seven years from closure, and regulatory or legal complaint records are retained for ten years from closure.",
      },
    ],
    urls: [
      "https://drive.google.com/file/d/1hJbC532uJ9UIAQU-SGdgg9VRqZRk1V0X/view?usp=drivesdk",
      "https://drive.google.com/file/d/1HUd0JQvTK9cmirS9Qhk7C0p6_XYrCD63/view?usp=drivesdk",
      "https://drive.google.com/file/d/1nTHVSYAwlZ32ixzzbUJQwCCWmEj2yqvD/view?usp=drivesdk",
      "https://drive.google.com/file/d/1V8NVSZkp1RtZ2Lsgf5eOXwltSJImbS0X/view?usp=drivesdk",
    ],
  },
};

export const DEFAULT_SAMPLE_LIBRARY_KEY = "mock";
export const SAMPLE_DOCUMENTS = SAMPLE_LIBRARIES[DEFAULT_SAMPLE_LIBRARY_KEY].documents;
export const SAMPLE_URLS = SAMPLE_LIBRARIES[DEFAULT_SAMPLE_LIBRARY_KEY].urls;
