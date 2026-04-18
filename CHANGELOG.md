# [0.5.0](https://github.com/guichafy/ptolomeu/compare/v0.4.0...v0.5.0) (2026-04-15)


### Bug Fixes

* **apps:** cache app list and filter synchronously to stop result flicker ([e8c1c7d](https://github.com/guichafy/ptolomeu/commit/e8c1c7d258673231e6840b047898b93b3b573f74))


### Features

* **net:** add manual proxy mode with Keychain-backed credentials ([72a7407](https://github.com/guichafy/ptolomeu/commit/72a74077bb238af34d01b5846882e48a08f4d1d3))

# [0.4.0](https://github.com/guichafy/ptolomeu/compare/v0.3.1...v0.4.0) (2026-04-15)


### Bug Fixes

* **github:** hide stale results when query no longer matches last search ([e4972ae](https://github.com/guichafy/ptolomeu/commit/e4972aee4dadffe9e7d80b66ae99115fc3c9ad08))


### Features

* **net:** add proxy mode configuration UI in preferences ([07c6eb9](https://github.com/guichafy/ptolomeu/commit/07c6eb91dcd21d21083211c6f8e201ffcdb5af6d))

## [0.3.1](https://github.com/guichafy/ptolomeu/compare/v0.3.0...v0.3.1) (2026-04-15)


### Bug Fixes

* **net:** honor system proxy configuration for outbound fetch ([318724e](https://github.com/guichafy/ptolomeu/commit/318724ed7aea337f64868918cbc35ce396fd6f90))

# [0.3.0](https://github.com/guichafy/ptolomeu/compare/v0.2.0...v0.3.0) (2026-04-14)


### Bug Fixes

* **chat:** instrument claude session flow and resolve multi-session bugs ([542ec82](https://github.com/guichafy/ptolomeu/commit/542ec82e6e7acaea8dc54c4a7f8f811772840b21))
* **chat:** persist structured blocks, unify tool display, fix multi-turn streaming ([a4d8d02](https://github.com/guichafy/ptolomeu/commit/a4d8d02dd1327bd4763385714510917ca8f5145e))
* **claude:** split rpc per window and push session list from bun ([b7dda6a](https://github.com/guichafy/ptolomeu/commit/b7dda6a7e26ddad6d17a55832d40d64937f156bf))
* **dev:** replace Vite dev server with build --watch to fix blank screen on first launch ([8f1a195](https://github.com/guichafy/ptolomeu/commit/8f1a1950a18fd00c7ee96ab8856ff426c5e63fd1))
* **settings:** add frontend-design plugin to enabled plugins ([fe29478](https://github.com/guichafy/ptolomeu/commit/fe29478ffbcf569f17d4695c1fc03eecc38a9251))
* **ui:** fix Tailwind v4 source detection and refine settings design ([4537794](https://github.com/guichafy/ptolomeu/commit/4537794703ed7cd9d8ac1d806ce59de5ab62484e))
* **ui:** scroll acompanhar seleção ao navegar resultados com setas ([06d1672](https://github.com/guichafy/ptolomeu/commit/06d16724aeb93cfccb9e08350bc69ac72b0eb6bc))
* **ui:** use native titlebar for chat window dragging and close ([682ff45](https://github.com/guichafy/ptolomeu/commit/682ff45c05753321498303817cb701382d62b7e2))


### Features

* **analytics:** integrate PostHog for anonymous usage analytics ([8a9610f](https://github.com/guichafy/ptolomeu/commit/8a9610f902aae7ed60a6611a9f4b81917370174d))
* **chat:** load message history and resume SDK session from URL params ([10eb3c3](https://github.com/guichafy/ptolomeu/commit/10eb3c3c3af12e501e586edde75828894fbac9e0))
* **claude:** add Claude chat integration with streaming, auth, and dedicated chat window ([c18710f](https://github.com/guichafy/ptolomeu/commit/c18710f162e3adb942aa4b8c03f565e3679c5fff))
* **claude:** add SDK dependency and register claude plugin ([163212a](https://github.com/guichafy/ptolomeu/commit/163212a0acf528fe9a34b1cc0bb04d5a99edf8ed))

# [0.2.0](https://github.com/guichafy/ptolomeu/compare/v0.1.0...v0.2.0) (2026-04-12)


### Features

* **icons:** use ptolomeu.icns as official app and tray icon ([5e6a0e2](https://github.com/guichafy/ptolomeu/commit/5e6a0e2436552e3661d06a1b2ab277372534251b))
* **ui:** migrate Tailwind CSS v3 to v4 with CSS-first config ([4a9a384](https://github.com/guichafy/ptolomeu/commit/4a9a384faaa99d2a443ad61028af4d245fde0a4c))

# [0.1.0](https://github.com/guichafy/ptolomeu/compare/v0.0.0...v0.1.0) (2026-04-12)


### Bug Fixes

* **github:** expand window when combobox popover opens to prevent clipping ([3f16fd3](https://github.com/guichafy/ptolomeu/commit/3f16fd3e0549fb18090aa910c648145e251a09f6))
* **github:** raise RPC timeout to 30s and log search lifecycle ([7454cd6](https://github.com/guichafy/ptolomeu/commit/7454cd6e009864e43769af69849f43ebf9fe6107))
* **github:** re-run search on Enter when query changed since last results ([32fe9ea](https://github.com/guichafy/ptolomeu/commit/32fe9ea94b86b5c45384ca503ded256331ef17d8))
* import defineConfig from vitest/config for type safety ([bcb708c](https://github.com/guichafy/ptolomeu/commit/bcb708c39f4056d7198cfcc300ad8c0ac75cc735))
* **macos:** install Edit menu to enable Cmd+A/C/V/X/Z in inputs ([53d0e39](https://github.com/guichafy/ptolomeu/commit/53d0e39e3c37dc5d393a67818d00b1d5bb08b670)), closes [#6](https://github.com/guichafy/ptolomeu/issues/6)
* **providers:** drop generic from SearchProvider to fix registry variance ([f3775cf](https://github.com/guichafy/ptolomeu/commit/f3775cf787424992a8d2a60402ded41d36673e6f))
* **settings:** use GitBranch icon instead of missing Github ([17d75d5](https://github.com/guichafy/ptolomeu/commit/17d75d574d4feef7a16c8b0d844f1147554c3cb2))
* **test:** cast fetch mock through unknown for strict typecheck ([6f79a7b](https://github.com/guichafy/ptolomeu/commit/6f79a7bee654aa0711072835cb14acc0d95f439e))
* **ui:** keep window centered when resizing by using setFrame instead of setSize ([5bf05c4](https://github.com/guichafy/ptolomeu/commit/5bf05c4c69e216cecb88388084aa5cd9069c6987))
* **ui:** move search type combobox outside input and add Lucide icons ([edba904](https://github.com/guichafy/ptolomeu/commit/edba90441e9f2e558f96eb9132efc87e5d27d00e))
* **ui:** prevent search results flickering by keeping previous results visible during loading ([8b3377b](https://github.com/guichafy/ptolomeu/commit/8b3377b6f3eed4eee128daf6d71337666e5e8659))


### Features

* add preferences dialog to configure active plugins ([f5339e5](https://github.com/guichafy/ptolomeu/commit/f5339e5d61fab5e24f8f0606496f705bf2ba1b09))
* **app:** wire GitHubProvider and pass subType into search ([6260db8](https://github.com/guichafy/ptolomeu/commit/6260db82e8d2f3b87fb24c5aa6407b5aa205cea8))
* **bun:** add github fetch handler with subType routing ([2f527c5](https://github.com/guichafy/ptolomeu/commit/2f527c556e7e6df9190ba324e97a434cd478bbc0))
* **bun:** add github token storage via macos keychain ([e9daaf2](https://github.com/guichafy/ptolomeu/commit/e9daaf2766c54fe43af320e9769ec423d5b1356d))
* **bun:** add team-repos cache with 5min TTL and pagination ([db29739](https://github.com/guichafy/ptolomeu/commit/db297391d947bdd97aca7a4c734aef67d232256e))
* **github:** add api wrapper using githubFetchSearch rpc ([ed2e042](https://github.com/guichafy/ptolomeu/commit/ed2e04210bf02ca73f89ef0baaf942586ec25163))
* **github:** add react context for subType, filters and token status ([375e6d9](https://github.com/guichafy/ptolomeu/commit/375e6d9297123c91712996295ef6ec88edd1864b))
* **github:** add renderers mapping GitHubItem to SearchResult ([664472d](https://github.com/guichafy/ptolomeu/commit/664472d972e67cf7eaaf41f8b0506ac488335f1e))
* **github:** add search type combobox component ([8375e17](https://github.com/guichafy/ptolomeu/commit/8375e179e0385e482e38fa95736b7b3dfaa47bac))
* **github:** add visual query builder for custom search filters ([965df3b](https://github.com/guichafy/ptolomeu/commit/965df3b6d43a48217e3bea75492f59ca63c03f70))
* **github:** wire combobox and cmd+1..4/cmd+f shortcuts into palette ([0baf0e8](https://github.com/guichafy/ptolomeu/commit/0baf0e85046d6389495ed8b32386a19ce763d1f4))
* **rpc:** add openUrl RPC and use native open instead of window.open ([3a4da4f](https://github.com/guichafy/ptolomeu/commit/3a4da4f5f56640abf5efc46c0ac707dc40025cdf))
* **rpc:** expose github token + fetch handlers on main process ([ef665b1](https://github.com/guichafy/ptolomeu/commit/ef665b1eaf6ff6869a06b9bef72057bfa9a455ce))
* **rpc:** mirror github rpc schema and types in renderer ([b87f77e](https://github.com/guichafy/ptolomeu/commit/b87f77e75898950d8a05b8aa4ca126f6cd233746))
* **search-input:** accept optional leftSlot for inline widgets ([f37aafc](https://github.com/guichafy/ptolomeu/commit/f37aafc10f6452ac5752d5be6941604bc29a345e))
* **settings:** add custom filters list with create/edit/reorder ([7b583a3](https://github.com/guichafy/ptolomeu/commit/7b583a33e04c3a029e3fd16b6aee698df181a873))
* **settings:** add custom filters state and section-aware openDialog ([422a7f5](https://github.com/guichafy/ptolomeu/commit/422a7f53b6100a297f8d7598a46c03e368822088))
* **settings:** add github schema with custom filters validation ([8f39594](https://github.com/guichafy/ptolomeu/commit/8f39594735c781dc4dec270d85a645a0d2d9c4f8))
* **settings:** add github tab and section-aware dialog ([a545de8](https://github.com/guichafy/ptolomeu/commit/a545de8fa1c97a98333c560384c45e3cd8066552))
* **settings:** add token field with keychain validation flow ([0670de7](https://github.com/guichafy/ptolomeu/commit/0670de7fec04c47b77100d101920dfbc63aea405))
* **settings:** move plugin config to hierarchical sidebar with per-provider configComponent ([2445ec3](https://github.com/guichafy/ptolomeu/commit/2445ec351fb941334ae6798ce6c7944b2d1a6c86))
* **ui:** make mode bar tabs clickable to switch providers ([942e424](https://github.com/guichafy/ptolomeu/commit/942e424d91e0650478228cdd33f8d55dadd98ef9))

# 0.0.0 (2026-04-11)


### Bug Fixes

* correct Github icon and type issues in providers ([86f6599](https://github.com/guichafy/ptolomeu/commit/86f65993dadea22fa05e7e5b37600580550688e3))
* instantiate Electroview to establish RPC WebSocket connection ([54d5a45](https://github.com/guichafy/ptolomeu/commit/54d5a45d45fdc6809add971dfd5df46c725289b4))
* prevent double Enter handler and improve keyboard navigation ([cbe897b](https://github.com/guichafy/ptolomeu/commit/cbe897b6367631bbb9a533de36fe1149e048b414))


### Features

* add apps provider with RPC-based macOS app search ([6433922](https://github.com/guichafy/ptolomeu/commit/643392256dbddb3b0852d014c7c0d6bc6b21e93f))
* add automated release workflow and PR validation ([bb56f44](https://github.com/guichafy/ptolomeu/commit/bb56f448d2708c934b9e7d9d916ac86c5f26e273))
* add calculator provider with safe math parser ([035e6a6](https://github.com/guichafy/ptolomeu/commit/035e6a67cc2edb1265d44d1cf063d0698ddfd581))
* add CI pipeline with GitHub Actions, Biome linting, and Vitest ([94e19c2](https://github.com/guichafy/ptolomeu/commit/94e19c27889c0d602e78c460e8cff412bc5f283c))
* add click-outside dismiss via windowDidResignKey ([446f630](https://github.com/guichafy/ptolomeu/commit/446f630c33bbc3da75840fc3521e524e494f4b6c))
* add E2E test infrastructure with Appium Mac2 and remove splash screen ([7a62f24](https://github.com/guichafy/ptolomeu/commit/7a62f24b283ed3d8d1e116b4d57ffd8a32c84cad))
* add ModeBar component with Tab-switching pills ([5d161ff](https://github.com/guichafy/ptolomeu/commit/5d161ff5d01584994aba55677f4bdce818eb72c9))
* add ProviderContext for managing active search provider ([301139d](https://github.com/guichafy/ptolomeu/commit/301139d50c771eff1a0249e84a46f992c73ad8f2))
* add real macOS app icons via sips conversion ([2f0d2aa](https://github.com/guichafy/ptolomeu/commit/2f0d2aa15eeb136f6fe4128b89cbb0703fa20b51))
* add ResultItem and CalculatorResult components ([87a0f12](https://github.com/guichafy/ptolomeu/commit/87a0f12c514de217ce5aaa01c3b38b7eee2b82a8))
* add SearchProvider and SearchResult interfaces ([d7179f8](https://github.com/guichafy/ptolomeu/commit/d7179f8e0963e42dd80f71f9027c89dbbc7a73be))
* add splash screen, recursive app scan, and rewrite README in pt-BR ([64a6ae5](https://github.com/guichafy/ptolomeu/commit/64a6ae50cd6839a2474020982e05150af3ddb502))
* add web search provider with Google, DuckDuckGo, SO, YouTube ([fbd5525](https://github.com/guichafy/ptolomeu/commit/fbd55254ed37f8d370b7bbc3f5e8b2885c4e4533))
* extract GitHub search into provider module ([47818de](https://github.com/guichafy/ptolomeu/commit/47818dece16029534acebfacca3c1d1f1dc00481))
* make search window frameless Alfred/Spotlight style ([40fab17](https://github.com/guichafy/ptolomeu/commit/40fab17bb63af167bc3763ce943aed0257317ecf))
* set up Electrobun RPC for app listing and launching ([2763e3b](https://github.com/guichafy/ptolomeu/commit/2763e3b0d6ed55bceb81ab7a4f4d6372208e174d))
* wire App.tsx with provider system and keyboard navigation ([a350db1](https://github.com/guichafy/ptolomeu/commit/a350db19e74da6a42c1f559cc40371c79efde3b8))
