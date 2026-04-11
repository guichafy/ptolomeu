# Changelog

## [1.1.0](https://github.com/guichafy/ptolomeu/compare/v1.0.0...v1.1.0) (2026-04-11)


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


### Bug Fixes

* correct Github icon and type issues in providers ([86f6599](https://github.com/guichafy/ptolomeu/commit/86f65993dadea22fa05e7e5b37600580550688e3))
* instantiate Electroview to establish RPC WebSocket connection ([54d5a45](https://github.com/guichafy/ptolomeu/commit/54d5a45d45fdc6809add971dfd5df46c725289b4))
* prevent double Enter handler and improve keyboard navigation ([cbe897b](https://github.com/guichafy/ptolomeu/commit/cbe897b6367631bbb9a533de36fe1149e048b414))
