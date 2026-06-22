# ADR 2: Adoption of ADR Logger Custom Skill

* **Date**: 2026-06-15
* **Status**: Accepted

## Context

As the project scales and more design choices are made (e.g., responsiveness fixes, editor panel toggles), we need a systematic way to track critical engineering decisions. Manually creating decision logs is prone to being forgotten or formatted inconsistently.

## Decision

We created and registered a custom tool/skill named `adr-logger` (located in `/Users/henriquefps/.gemini/config/skills/adr-logger/SKILL.md`) to guide the AI assistant in:
1. Identifying when an architectural or solution-impacting decision is made.
2. Formulating standard-compliant ADRs under `docs/adr/` with sequential numbering.
3. Automatically updating the central ADR index file (`docs/adr/README.md`).

## Consequences

* **Standardization**: All architectural records will follow a predictable and clean structure.
* **Traceability**: Future developers or AI agents can quickly consult `docs/adr/README.md` to understand why specific structures exist.
* **Automation**: Logging becomes a zero-friction part of the development workflow, triggering automatically when critical files or systems are modified.
