# Source Layout

ManifestHub currently runs as static HTML, CSS, and JavaScript. The `src`
directory separates code by responsibility so a later build-tool or framework
migration can happen page by page.

```text
src/
├── core/
│   ├── config.js
│   └── utils.js
├── components/
│   ├── auth.js
│   ├── faq.js
│   ├── poll.js
│   └── presence.js
├── pages/
│   ├── database/
│   │   ├── database.js
│   │   ├── index.js
│   │   ├── search.js
│   │   └── trending.js
│   ├── forum/index.js
│   └── profile/index.js
└── styles/
    ├── core/base.css
    ├── shared/
    │   ├── components.css
    │   └── layout.css
    └── pages/
```

## Ownership

- `core` contains configuration and helpers that do not own page UI.
- `components` contains behavior shared by a page or suitable for reuse.
- `pages` contains page-specific state, data access, rendering, and actions.
- `styles/core` and `styles/shared` apply across pages.
- `styles/pages` contains page-specific presentation.

## Database Page Load Order

The database page still uses ordered classic scripts and the shared
`window.MH` namespace:

```text
core/config.js
core/utils.js
components/presence.js
components/auth.js
pages/database/database.js
pages/database/search.js
pages/database/trending.js
components/poll.js
data/faq.js
components/faq.js
pages/database/index.js
```

Keep this order until these scripts are converted to explicit ES module
imports. The forum and profile pages each have a single page entry point.
