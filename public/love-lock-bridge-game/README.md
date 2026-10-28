# Love Lock Bridge

Vendored from the private `maldoteth/lovelockbridge` repository, commit
`f3686c5` (the standalone `index.html` export). Scene textures are embedded;
Three.js 0.180.0, Lucide and the fonts load from their CDNs.

The only change from upstream is the DeHub exit chip and its `postMessage`
bridge at the end of the document, which appear only when the page is framed.

Unlisted: reachable at `/arcade/love-lock-bridge` for anyone holding the link,
but not in the arcade grid, the apps page, search, the sitemap, or the crawler
copy, and served `noindex`. See `UNLISTED_ARCADE_GAMES` in
`src/config/arcade-games.ts`.
