# React client boundaries

- Read `docs/REACT-MIGRATION.md` before changing the migration scope or data ownership.
- Shared UI and models must remain provider-neutral. Read `docs/LAN-PLATFORM.md`; do not import product manifests or native Codex/Pi/Claude protocols into features.
- `src/dev/` is an isolated fixture preview. Product features must not import it (tests may).
- Protocol parsing, epoch/revision reconciliation, HTTP and SSE belong to adapters/controllers, never React rendering or entity reducers. Preserve existing business semantics and focused regression cases.
- The entity store accepts committed presentation changes. A renderer must not dispatch updates while rendering or copy supplemental data back into the model.
- Timeline order is supplied explicitly by the protocol/history adapter. Status, item type, completion and receipt time cannot invent chronological positions.
- Virtualize display items, including individual executions; a large turn must not be one enormous virtual row. Full tool results are detail resources, not hidden row props.
- Subscribe by stable entity ID. Keep draft keystrokes inside the editor; do not put draft text in the conversation store or drive whole-workbench updates from input.
- Reuse existing design language. Current preview styles are provisional; migrate shared tokens and component styles rather than maintaining two permanent design systems.
- Browser acceptance uses isolated fixtures. Do not reconnect real accounts, send tasks, run operational migration scripts or restart production to validate frontend changes.
- A passing preview is not production migration completion. Record unimplemented features and acceptance gaps accurately.
