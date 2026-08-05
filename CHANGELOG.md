# Changelog

All notable user-facing changes are documented here. The project follows [Semantic Versioning](https://semver.org/) once public tags begin.

## Unreleased

### Added

- Isolated HTTP security integration tests for setup, sessions, same-origin and CSRF checks, roles, login throttling, and project path containment.
- Clipboard image paste in the desktop and mobile composer, with attachment previews and image-only sending.
- Project-local attachment storage under `.codexlan/attachments`, organized by chat and date.
- MIT license.
- English landing README and a separate Simplified Chinese README.
- Public architecture, deployment, development, troubleshooting, security, contribution, conduct, and roadmap documentation.
- Windows and Node version matrix for continuous integration.
- GitHub issue templates.
- Android and Windows release-engineering plan.

### Changed

- Kept desktop and mobile on one responsive workbench implementation while refining the execution timeline and compact composer.
- Attachments now remain in browser memory until send, instead of being written into the project root immediately.
- Moving a queued task into guidance now appears in the information flow immediately and shows an explicit transition state.
- Cancel controls in dialogs bypass field validation; cancellable dialogs also close with Escape or a backdrop click.
- Render assistant messages as Markdown, including fenced code blocks, headings, lists, quotes, tables, links, and inline formatting.
- Render inline and display LaTeX formulas locally with KaTeX in chats and Markdown previews.
- Removed machine-specific paths from UI examples and test fixtures.
- Replaced the old family-account wording with member-account wording.
- The Windows launcher now prints the access address and first-run initialization information directly in its terminal.
- Changed the Android application ID from `cn.shiwei.codexworkspace` to `com.hushiwei.codexlan`; existing private installs do not upgrade in place.

### Security

- Strengthened ignore rules for runtime data, credentials, Android binaries, signing material, SDKs, and build output.

## 0.6.11 - Imported production baseline

- Imported the behavior-preserving source baseline used to start the new development repository.
- Verified 29 Node tests before public-preparation changes.
