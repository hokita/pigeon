# pigeon

pigeon is a personal web app that keeps what Muse (Meta's AI assistant) collects — news, research, price drops, anything — and shows each item as a rich page. Muse saves an item and a JSON component tree through an MCP tool; pigeon validates and stores both, then renders the stored tree with assistant-ui's generative UI components. Viewing an item never calls an LLM.

See the [design doc](docs/superpowers/specs/2026-11-15-pigeon-design.md).
