# React client boundaries

- Read `docs/archive/REACT-MIGRATION.md` for historical migration scope and data ownership.
- Shared UI and models must remain provider-neutral. Read `docs/LAN-PLATFORM.md`; do not import product manifests or native Codex/Pi/Claude protocols into features.
- `src/dev/` is an isolated fixture preview. Product features must not import it (tests may).
- Protocol parsing, epoch/revision reconciliation, HTTP and SSE belong to adapters/controllers, never React rendering or entity reducers. Preserve existing business semantics and focused regression cases.
- The entity store accepts committed presentation changes. A renderer must not dispatch updates while rendering or copy supplemental data back into the model.
- Timeline order is supplied explicitly by the protocol/history adapter. Status, item type, completion and receipt time cannot invent chronological positions.
- Virtualize display items, including individual executions; a large turn must not be one enormous virtual row. Full tool results are detail resources, not hidden row props.
- Subscribe by stable entity ID. Keep draft keystrokes inside the editor; do not put draft text in the conversation store or drive whole-workbench updates from input.
- Preserve the pre-refactor visual design. Migrate original CSS from `4b7814b` into the React architecture; do not replace it with a new theme or retain the provisional preview stylesheet. Global tokens/reset belong in `app/theme.css`, shared primitives in `components/`, and feature styles beside the owning components, imported by those components. Keep responsive rules with their owner. Add only layout adapters required by React/virtualization; do not import iframe document styles into the workbench.
- Preserve the original functionality and interaction defaults. A behavioral change requires all three: a concrete reason, a better user experience supported by evidence, and a complete implementation. Refactoring or simpler implementation alone is not a reason to change the experience.
- Browser acceptance uses isolated fixtures. Do not reconnect real accounts, send tasks, run operational migration scripts or restart production to validate frontend changes.
- A passing preview is not production migration completion. Record unimplemented features and acceptance gaps accurately.
