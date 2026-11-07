# Third-party notices

## Browser bundle

React, Redux Toolkit/react-redux, react-virtuoso, react-markdown/remark-gfm, remark-math/rehype-katex/KaTeX, Mermaid and Anser are installed from the pinned lockfile and bundled locally. No CDN is required. Their transitive packages retain their own licenses.

Vite generates the bundled dependency license inventory at `dist/web/third-party-licenses.md` (served as `/third-party-licenses.md`). Include this file, the KaTeX font assets and this notice with the complete web asset directory. The former manually vendored browser libraries have been removed.

## HTTP runtime

Express 5.2.1 and its locked production dependencies retain their respective MIT, ISC and BSD licenses in the deployed `node_modules/`.

## Android

The Gradle Wrapper scripts and JAR are distributed under Apache License 2.0. The upstream license and notice remain in `android/gradle/wrapper/LICENSE` and `NOTICE`.
