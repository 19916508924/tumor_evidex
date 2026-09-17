# Product

<!-- impeccable:product-schema 1 -->

## Platform

Web application, with public evidence browsing and question answering alongside an access-controlled operations workspace.

## Users

- Visitors and general users who browse published oncology evidence and ask evidence questions.
- Knowledge operators who monitor discovery strategies, candidates, workflows, and operational exceptions.
- Medical reviewers who compare source material, structured drafts, and quality checks before publication.
- Administrators who manage and inspect the internal operational surface.

## Product Purpose

Evidex turns oncology literature and structured evidence into an auditable workflow for discovery, extraction, review, immutable release publication, public browsing, and evidence-grounded question answering.

## Positioning

Evidex is an evidence product rather than a clinical decision maker. Public answers must remain traceable to reviewed claims and permitted sources, and must make uncertainty and applicability limits visible.

## Operating Context

- Public users browse the latest published knowledge release and ask single-turn evidence questions.
- Internal users work in an authenticated, desktop-first operations environment that remains usable on narrower screens.
- Review work can be interrupted, retried, handed off, or encounter optimistic-concurrency conflicts; the interface must preserve context and make recovery clear.
- All interface text is Chinese except licensed literature titles, abstracts, excerpts, and other original source text.

## Capabilities and Constraints

- Public knowledge pages cover diseases, genes, variants, drugs, evidence records, and sources.
- Public question answering supports structured context, progress states, traceable citations, special result states, and feedback.
- Internal operations cover dashboard metrics, discovery strategies and runs, candidates, review tasks, releases, agents, skills, workflows, workflow runs, and question runs.
- Only reviewed content from an immutable published release may appear in the public product.
- Internal `/ops` routes require administrator access.
- The frontend must use the implemented APIs and real repository data; it must not substitute hard-coded or fabricated business data.
- Source licensing controls whether original text may be displayed. Link-only and internal-only content must not be exposed publicly.
- The product must not provide diagnosis, prescriptions, dosage instructions, or personalized treatment recommendations.

## Brand Commitments

- Preserve the established Evidex visual world from the landing page: blue-led, calm, precise, and trustworthy.
- Use restrained translucent materials, clear hierarchy, and fluid interaction without sacrificing readability or operational density.
- The product should feel like a finished public service, with no implementation-stage labels, backend terminology, API references, knowledge-base version jargon, “体验版”, or development version copy in user-facing UI.

## Evidence on Hand

- `README.md` documents the current product baseline and implemented API behavior.
- `docs/specs/evidex-agent-skill-platform.md` is the current product and interaction specification.
- `docs/test-plans/evidex-complete-frontend-apis.md` records the completed frontend-facing API surface and backend verification.
- Existing landing and evidence pages establish the incumbent visual language.
- Shared TypeScript API types and route implementations are available in the repository.

## Product Principles

1. Traceability before fluency: every public conclusion must lead back to reviewed evidence and an allowed source.
2. Review before publication: public knowledge is drawn only from approved immutable releases.
3. Explicit limits: uncertainty, missing evidence, applicability boundaries, and failure states are first-class content.
4. Operational clarity: users can see state, history, ownership, retries, and the next safe action.
5. Progressive disclosure: make common tasks direct while keeping provenance and advanced diagnostics available.
6. No fabricated confidence: empty, partial, delayed, and unavailable states remain honest and useful.

## Accessibility & Inclusion

- Keyboard access, visible focus, semantic structure, and screen-reader status announcements are required for interactive workflows.
- Status, risk, and validation cannot rely on color alone.
- Motion must be restrained and respect reduced-motion preferences.
- Chinese content should remain readable at common desktop and mobile widths, while original literature text preserves its source language.
