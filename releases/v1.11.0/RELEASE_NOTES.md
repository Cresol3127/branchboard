# BranchBoard 1.11 — Documentation, Provider Updates & Token Comparison

### What's New

- **Product Requirements Document (`PRD.md`)**: Full architectural and algorithmic documentation for the BranchBoard application, including Directed Acyclic Graph (DAG) state management, AI streaming pipelines, and cycle prevention flowcharts.
- **Token Comparison & Node Interconnection**: Integrated token usage statistics island with provider-reported metrics, cost estimation, and node interconnection controls (`ConnectModal`).
- **Provider & Model Configuration**: Added expanded Google Gemini models (`gemini-3.5-flash-lite`, `gemini-3.8-flash`, `gemma-4-31b-it`), explicit local server connection error handling, and updated settings UI styling.
- **Visual Documentation**: Added desktop workspace dual light/dark preview screenshot (`docs/images/workspace-light-dark.png`) to `README.md` alongside contributor acknowledgments and project MIT license.

### Verification & Quality
- All unit, integration, and HTTP tests passed (259/259 tests across 28 test suites).
- Full production client and server build verified cleanly without errors.
