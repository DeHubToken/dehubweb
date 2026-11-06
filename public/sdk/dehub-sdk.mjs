const NS = 'dehub-miniapp';
const VERSION = 1;
export class DehubError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'DehubError';
        this.code = code;
    }
}
let started = false;
let nextId = 1;
const pending = new Map();
const listeners = new Map();
let contextPromise = null;
let tokenCache = null;
const browser = () => typeof window !== 'undefined';
const native = () => (browser() ? window.ReactNativeWebView : undefined);
const framed = () => browser() && window.parent && window.parent !== window;
/** True when the page is running inside DeHub (web or app). */
export function isInDehub() {
    return Boolean(native() || framed());
}
function receive(event) {
    let data = event.data;
    // On the web only the parent frame is DeHub. In the app only native code can
    // deliver a message, and it arrives as a string.
    if (!native() && event.source !== window.parent)
        return;
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        }
        catch {
            return;
        }
    }
    if (!data || data.ns !== NS)
        return;
    if (data.event) {
        for (const fn of [...(listeners.get(data.event) ?? [])]) {
            try {
                fn(data.data);
            }
            catch (e) {
                console.error(e);
            }
        }
        return;
    }
    const slot = pending.get(data.id);
    if (!slot)
        return;
    pending.delete(data.id);
    clearTimeout(slot.timer);
    if (data.error)
        slot.reject(new DehubError(data.error.message || 'DeHub refused the request.', data.error.code));
    else
        slot.resolve(data.result);
}
function start() {
    if (started || !browser())
        return;
    started = true;
    window.addEventListener('message', receive);
    if (native())
        document.addEventListener('message', receive);
}
function send(message) {
    const payload = { ...message, ns: NS, v: VERSION };
    const bridge = native();
    if (bridge)
        bridge.postMessage(JSON.stringify(payload));
    else if (framed())
        window.parent.postMessage(payload, '*');
}
function request(method, params = {}, timeoutMs = 15000) {
    if (!isInDehub())
        return Promise.reject(new DehubError('Not running inside DeHub.', 'not_in_dehub'));
    start();
    return new Promise((resolve, reject) => {
        const id = nextId++;
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(new DehubError(`DeHub did not answer ${method}.`, 'timeout'));
        }, timeoutMs);
        pending.set(id, { resolve: resolve, reject, timer });
        send({ id, method, params });
    });
}
export const dehub = {
    version: VERSION,
    isInDehub,
    /** Hide the splash screen. Call it once your first screen has painted. */
    ready: () => request('ready'),
    /** Close the mini app. */
    close: () => request('close'),
    /** `{ user, location, client }`, asked once and then cached. */
    get context() {
        contextPromise ?? (contextPromise = request('context'));
        return contextPromise;
    },
    /** The methods this host supports, e.g. `['auth.getToken', 'actions.pay']`. */
    getCapabilities: () => request('getCapabilities'),
    auth: {
        /**
         * A signed JWT proving who the person is, for YOUR server to verify
         * (`verifyDehubToken` in `dehub-sdk/server`). The first call asks the
         * person to share their identity with you. Cached until a minute before it
         * expires unless `force` is set.
         */
        async getToken(options = {}) {
            if (!options.force && tokenCache && tokenCache.expiresAt - Date.now() > 60000)
                return tokenCache;
            tokenCache = await request('auth.getToken', {}, 120000);
            return tokenCache;
        },
    },
    actions: {
        /** Open the DeHub composer with text, and optionally a link back into your app. */
        composePost: (options = {}) => request('actions.composePost', { ...options }, 600000),
        /** Open a DeHub profile by handle. */
        viewProfile: (options) => request('actions.viewProfile', { ...options }),
        /** Open a DeHub post by id. */
        viewPost: (options) => request('actions.viewPost', { ...options }),
        /** Open an external https:// link outside the mini app. */
        openUrl: (url) => request('actions.openUrl', { url }),
        /** Ask the person to add your app, so your server can notify them. */
        addApp: () => request('actions.addApp', {}, 600000),
        /** Ask the person to pay you in DHB. Verify `receipt` on your server (`verifyDehubPayment`). */
        pay: (options) => request('actions.pay', { ...options }, 600000),
    },
    haptics: {
        impact: (style = 'medium') => request('haptics.impact', { style }).catch(() => { }),
    },
    /** Listen for host events. Returns a function that stops listening. */
    on(name, fn) {
        start();
        if (!listeners.has(name))
            listeners.set(name, new Set());
        listeners.get(name).add(fn);
        return () => listeners.get(name)?.delete(fn);
    },
};
export default dehub;
