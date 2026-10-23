/*
 * DeHub embed resizer. Optional: an embedded post works without it, at the
 * height its embed code names. With it, each `iframe.dehub-embed` on the page
 * grows or shrinks to fit the post (a long caption, a tall photo).
 *
 * The embed page posts { type: 'dehub:embed-height', height } to its parent;
 * only messages from a DeHub origin and from one of this page's own embeds
 * are acted on.
 */
(function () {
  if (window.__dehubEmbedResizer) return;
  window.__dehubEmbedResizer = true;
  var ORIGINS = { 'https://dehub.io': 1, 'https://www.dehub.io': 1, 'https://staging.dehub.io': 1 };
  window.addEventListener('message', function (event) {
    if (!ORIGINS[event.origin]) return;
    var data = event.data;
    if (!data || data.type !== 'dehub:embed-height') return;
    var height = Math.round(Number(data.height));
    if (!(height > 0)) return;
    var frames = document.querySelectorAll('iframe.dehub-embed');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === event.source) {
        frames[i].style.height = Math.min(height, 3000) + 'px';
        frames[i].setAttribute('height', String(Math.min(height, 3000)));
      }
    }
  });
})();
