/**
 * Surviving a browser that translates the page underneath React.
 * ==============================================================
 * Chrome, Edge and Safari all offer to translate a page themselves, and the
 * way they do it is to walk the DOM and swap each text node for a `<font>`
 * wrapper holding the translation. React knows nothing about that. Its next
 * update reaches for a text node it still holds a handle on, finds it has been
 * reparented, and throws:
 *
 *     NotFoundError: Failed to execute 'removeChild' on 'Node'
 *     NotFoundError: Failed to execute 'insertBefore' on 'Node'
 *
 * That exception escapes to the nearest error boundary, which unmounts the
 * subtree — so a page the user was part-way through simply disappears. On a
 * paywalled surface that is not cosmetic: the run that a transfer has already
 * paid for is orchestrated in the tab, so the tab dying strands the payment.
 *
 * The guard is two lines of defence and neither is speculative:
 *
 *   - `removeChild` on a node that is no longer ours is what React wanted
 *     anyway — the node is gone. Return it instead of throwing.
 *   - `insertBefore` against a reference node that has been reparented falls
 *     back to appending, which is where React was heading.
 *
 * Both narrow to exactly the case the translator creates: the argument's
 * `parentNode` is not `this`. Every other misuse still throws as it should, so
 * a genuine React bug is not hidden by this.
 *
 * This used to live inside the Google-widget fallback module and was therefore
 * installed ONLY for the tail languages whose locale files are not filled in.
 * Every other viewer — including all 100-odd languages that do have a locale
 * file — got no protection at all from their *browser's* translator, which
 * behaves identically. `client_error_logs` carried these crashes every day
 * across `/creator`, `/editor`, `/app/settings`, `/stages`, profiles and the
 * feed. Hence: installed for everyone, at boot.
 */

/** Marks a `<html>` that a translator has taken over. */
const TRANSLATED_CLASS = /(^|\s)translated-(ltr|rtl)(\s|$)/;

let domGuarded = false;

/**
 * Make the two DOM operations React relies on tolerate a translator having
 * moved the nodes first.
 *
 * O(1) — one `parentNode` comparison on each call — so it is cheap enough to
 * carry unconditionally, which is the point: a browser's translate menu is
 * available on every page in every language and gives no warning before it
 * rewrites the document.
 */
export function guardDomAgainstTranslator(): void {
  if (domGuarded) return;
  domGuarded = true;

  const proto = Node.prototype as unknown as {
    removeChild: <T extends Node>(child: T) => T;
    insertBefore: <T extends Node>(node: T, ref: Node | null) => T;
  };
  const { removeChild, insertBefore } = proto;

  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    // Already detached, or re-parented into a translator's <font> wrapper.
    // React's intent — that this node not be here — is satisfied either way.
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  };

  proto.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    // The anchor moved. Appending puts the node in the right parent, which is
    // the part that matters; ordering inside a translated run is the
    // translator's now regardless.
    if (ref && ref.parentNode !== this) return this.appendChild(node) as T;
    return insertBefore.call(this, node, ref) as T;
  };
}

/**
 * Wallet addresses, transaction hashes and contract ids must survive verbatim —
 * a translated address is a wrong address, and this app is full of them.
 * Translators skip anything under `.notranslate`, so every monospace wrapper is
 * tagged, including the ones React mounts later.
 *
 * The observer is the expensive half (it watches the whole document for
 * insertions), so it is armed only once something is actually translating the
 * page rather than carried by every viewer for the lifetime of the tab.
 */
const VERBATIM = '.font-mono, code, pre, [data-address], [data-tx-hash]';

let verbatimProtected = false;

export function protectVerbatimText(): void {
  if (verbatimProtected) return;
  verbatimProtected = true;

  const tag = (root: ParentNode) => {
    root.querySelectorAll?.(VERBATIM).forEach((el) => el.classList.add('notranslate'));
  };

  tag(document);
  new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches(VERBATIM)) node.classList.add('notranslate');
        tag(node);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });
}

/**
 * Install the crash guard, and watch for a translator arriving so the verbatim
 * protection can be armed at that moment.
 *
 * Chrome and Edge stamp `translated-ltr` / `translated-rtl` on `<html>` when
 * they translate, and so does the Google widget we load ourselves for the tail
 * languages. Watching one attribute on one element costs nothing — `<html>`'s
 * class already changes on theme switches and nothing else.
 *
 * If that class name ever changes, the page loses the `notranslate` tagging but
 * keeps the crash guard, which is the half that decides whether the app stays
 * on screen.
 */
export function installTranslatorDomGuard(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  guardDomAgainstTranslator();

  const root = document.documentElement;
  const armIfTranslated = () => {
    if (!TRANSLATED_CLASS.test(root.className)) return false;
    protectVerbatimText();
    return true;
  };

  // Already translated before our bundle ran — a reload with the setting on.
  if (armIfTranslated()) return;

  const observer = new MutationObserver(() => {
    if (armIfTranslated()) observer.disconnect();
  });
  observer.observe(root, { attributes: true, attributeFilter: ['class'] });
}
