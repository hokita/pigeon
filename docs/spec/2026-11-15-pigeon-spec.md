# pigeon: Generative UI Web Application Integrated with Muse (user's spec, 2026-11-15)

## 1. Project Overview

I want to build a dedicated web application to view information collected periodically by Muse (Meta's AI assistant app on iPhone; it runs in Meta's cloud).

Currently, I use Muse for the following automated tasks:
- Collecting and summarizing daily news
- Monitoring product prices and notifying me about price drops
- Performing other recurring research and information-gathering tasks

However, the Muse interface is not ideal for browsing, comparing, or reviewing previously collected information.

I want to build a web application that stores this information and presents it in a rich, flexible interface similar to ChatGPT's response UI. The application should dynamically combine text, images, charts, tables, timelines, cards, and other visual components.

The primary goal is to implement Generative UI, not simply build a Markdown viewer.

## 2. Confirmed Technical Decisions (fixed requirements)

| Area | Technology / Approach |
|---|---|
| Frontend | React + TypeScript |
| Generative UI | @assistant-ui/generative-ui |
| UI Definition | JSON Component Tree |
| Markdown | Used for rich text content |
| Integration | Remote MCP Server |
| UI Generation | Performed by Muse during data collection |
| UI Storage | Database |
| UI Rendering | Render previously generated JSON |
| Arbitrary Code Execution | Not allowed |

Do not spend time comparing alternative Generative UI frameworks or reconsidering the selected technology stack.

However, verify the actual API, available components, and rendering capabilities of the selected assistant-ui package using its official documentation and the currently available package version. If the package does not directly support rendering persisted JSON Component Trees, identify the necessary adapter or integration layer. Do not assume that undocumented APIs or components exist.

If this repository already contains an established architecture or technology stack, inspect it first and reuse existing infrastructure wherever reasonable.

## 3. System Architecture

Muse (collect news and product information; generate content and UI definitions)
  → Remote MCP Server (authentication and validation)
  → Backend (persist data)
  → Database
  ← Backend API
  ← React Web Application (assistant-ui Generative UI Renderer)

Responsibilities:
- **Muse:** collect information through scheduled tasks; summarize and organize it; generate a suitable UI definition based on the content; send both content and UI definitions to the backend through an MCP tool.
- **MCP Server:** expose tools Muse can invoke; authenticate incoming requests; validate incoming data; forward valid data to the application layer.
- **Backend:** business logic; validate and persist content and UI definitions; expose APIs for the frontend.
- **Database:** store collected information, original content and sources, generated UI definitions; preserve relevant historical information.
- **Frontend:** fetch persisted content through the backend API; render previously generated UI definitions; intuitive browsing.

The frontend must not call an LLM every time a user opens a page. The UI is generated once by Muse, persisted, and rendered repeatedly. The MCP layer must not be tightly coupled to the UI rendering implementation.

## 4. Generative UI Requirements

### 4.1 Core Concept
Muse determines how information is presented based on its content. A news report might contain headings, rich text explanations, relevant images, comparison tables, charts, chronological timelines, highlighted insights, source citations. A product price-drop report might contain product images, current prices, previous prices, discount percentages, price history charts, product comparison tables, purchase links. The order and layout must not be fixed; Muse selects and combines components dynamically.

### 4.2 Initial Supported Components (at least)
1. Rich Text / Markdown 2. Heading 3. Image 4. Table 5. Chart (Line / Bar) 6. Timeline 7. Card 8. Layout (Row / Column) 9. Callout 10. Citation / Link

Prefer built-in assistant-ui components where available and suitable; otherwise implement a minimal custom component. Components must be nestable and composable dynamically. Do not implement a separate hardcoded layout for every content type.

### 4.3 UI Definition Format
JSON Component Trees, supporting: component type identification, properties, nested children, flexible composition, schema validation with Zod or JSON Schema, schema versioning, safe fallback for unsupported components. Separate original content data from its presentation definition wherever practical, so UI definitions can be regenerated or schemas migrated later.

### 4.4 Rendering Integration
Muse does not run inside the assistant-ui chat runtime, so the implementation must render UI definitions generated externally and persisted in the database. Investigate the official assistant-ui APIs and determine the rendering strategy; if an adapter is needed between the persisted JSON and assistant-ui components, implement it explicitly. No chat interface is needed; the app displays previously generated content.

## 5. MCP Server

### 5.1 Initial MCP Tool: `save_feed_item`
Saves one item generated by Muse. Conceptual example input:

```json
{
  "type": "news",
  "title": "Latest Developments in AI",
  "content": {
    "markdown": "Summary of recent AI developments...",
    "sources": [{ "title": "Source", "url": "https://example.com" }]
  },
  "ui": { "schemaVersion": "1.0", "root": { "type": "column", "children": [] } }
}
```

Design the actual schema based on the selected rendering architecture. The input schema should be easy for Muse to understand and generate reliably. On success return the content ID and operation status. Consider future updates, deletion and deduplication, but avoid unnecessary MVP complexity.

### 5.2 MCP Transport
Use the standard HTTP transport of the current MCP specification. Verify against official Muse documentation: remote MCP server connection requirements; supported authentication methods; whether scheduled tasks can invoke custom MCP tools; payload-size or execution limits. Do not assume these without verification.

## 6. Authentication
Personal use. Prefer simple API token auth if Muse supports it (`Authorization: Bearer <API_TOKEN>`). Must: require HTTPS in production; no hardcoded credentials; never log tokens; reject invalid credentials; support token revocation; enforce authorization for writes. If Muse's remote MCP doesn't support API tokens, document the limitation and propose a compatible alternative such as OAuth. Web app access auth is designed separately from MCP auth.

## 7. Database Design
### 7.1 Feed Item (at minimum)
ID, Type, Title, Summary, Original Content, Source URLs, UI Definition, UI Schema Version, Created At, Updated At, Published At (when available). News and product information share a common feed model where practical.
### 7.2 Product Price History
Store and display historical product prices based on actual observations only. Never fabricate historical prices.
### 7.3 Data Integrity
Prevent/handle duplicate submissions; validate external URLs and image references; validate UI definitions before persistence; handle invalid UI definitions without losing valid source content; distinguish AI-generated analysis from factual source data; preserve references to original sources.

## 8. Web Application
### 8.1 Feed Page
Chronological feed; news and product filters; titles and summaries; navigation to details; responsive for mobile.
### 8.2 Detail Page
Renders the persisted JSON Component Tree with the Generative UI renderer. Prioritize a reading experience like ChatGPT responses, natural integration of text and visuals, clear typography and spacing, responsive charts/tables/images, dark mode. Not a recreation of ChatGPT's conversation UI; reproduce the flexibility and readability of its rich responses.
### 8.3 UI Design Principles
Minimal, readable, responsive, consistent, content-focused. No complex dashboard. Text stays primary; rich components inserted where they improve comprehension.

## 9. Security Requirements
Never execute arbitrary JS/JSX from Muse. No unrestricted HTML. Disable or sanitize unsafe HTML in Markdown. Validate component trees against an explicit allowlist. Handle external links and image URLs safely. Limit JSON payload size. Limit tree depth and total node count. Prevent excessive rendering workloads. Treat persisted AI-generated data as untrusted. Rendering failures must not crash the app. Use established security practices, not custom sanitizers.

## 10. Development Plan
- Phase 1: Repository investigation (framework, deps, structure, backend, DB, auth, deploy). Reuse existing infrastructure.
- Phase 2: Architecture and schema design: architecture, MCP tool interface, JSON Component Tree schema, DB schema, backend API, React rendering architecture. Clearly distinguish official library APIs from custom implementation.
- Phase 3: MVP implementation, end to end: Sample JSON → MCP Tool → Backend → Database → REST API → React Web App → Generative UI Renderer. Testable entirely locally without Muse. Realistic sample data: a daily news report and a product price-drop notification, each using multiple rich components.
- Phase 4: Muse integration: MCP connection instructions, the Muse configuration prompt, instructions for generating UI definitions, MCP tool input schema, end-to-end verification steps. Muse's UI definitions must match the validation and rendering schema.

## 11. Definition of Done
Content and UI definitions submitted through an MCP tool; persisted in the DB; retrievable via backend API; web app shows a feed; detail pages render persisted trees; Markdown, images, tables, charts and timelines render correctly; viewing needs no LLM call; invalid UI definitions don't crash the app; works on mobile; a local end-to-end test passes with sample data.

## 12. Engineering Principles
Avoid unnecessary abstraction; no microservices for the MVP; small MCP tool surface; prefer standard components; don't assume undocumented APIs; follow repo conventions; working MVP over speculative features; extensible without overengineering; strong TS types and runtime validation; explicit error handling; document important architectural decisions.

## 13. Instructions
Inspect the repository first. Technology decisions are made; determine how to implement them. Make reasonable implementation decisions when unspecified and document them in the README. Verify assumptions about external integrations, auth compatibility and third-party APIs against official docs. Do not fabricate APIs, features or integration capabilities.

After implementation provide: architecture summary; major files and responsibilities; local dev instructions; MCP server connection instructions; a ready-to-use Muse configuration prompt; sample data setup; e2e testing instructions; known limitations and future improvements.

**Final objective:** Muse generates both content and presentation definitions during data collection. The backend persists them, and the React application renders them without additional LLM calls. Simple, secure, maintainable, able to evolve as new components and information types are added.
