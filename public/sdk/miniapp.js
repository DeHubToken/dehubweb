/*!
 * dehub mini app SDK v1
 * https://dehub.io/apps/dev
 *
 *   <script src="https://dehub.io/sdk/miniapp.js"></script>
 *   <script>
 *     dehub.ready();
 *     const { user } = await dehub.context;
 *     const { token } = await dehub.auth.getToken(); // send to your server
 *   </script>
 *
 * Talks to the dehub host over postMessage (web) or the React Native WebView
 * bridge (the dehub app). It never sees the user's session: every request is
 * checked and carried out by the host.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.dehub) return;

  var NS = 'dehub-miniapp';
  var VERSION = 1;
  var native = window.ReactNativeWebView;
  var framed = window.parent && window.parent !== window;
  var inHost = Boolean(native || framed);
  var nextId = 1;
  var pending = {};
  var listeners = {};

  function send(message) {
    message.ns = NS;
    message.v = VERSION;
    if (native) native.postMessage(JSON.stringify(message));
    else if (framed) window.parent.postMessage(message, '*');
  }

  function request(method, params, timeoutMs) {
    if (!inHost) return Promise.reject(new Error('Not running inside dehub.'));
    return new Promise(function (resolve, reject) {
      var id = nextId++;
      var timer = setTimeout(function () {
        delete pending[id];
        reject(new Error('dehub did not answer ' + method + '.'));
      }, timeoutMs || 15000);
      pending[id] = { resolve: resolve, reject: reject, timer: timer };
      send({ id: id, method: method, params: params || {} });
    });
  }

  function receive(event) {
    var data = event.data;
    // On the web only the parent frame is dehub. In the app, only native code
    // can deliver a message, and it arrives as a string.
    if (!native && event.source !== window.parent) return;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { return; }
    }
    if (!data || data.ns !== NS) return;
    if (data.event) {
      (listeners[data.event] || []).slice().forEach(function (fn) {
        try { fn(data.data); } catch (e) { console.error(e); }
      });
      return;
    }
    var slot = pending[data.id];
    if (!slot) return;
    delete pending[data.id];
    clearTimeout(slot.timer);
    if (data.error) {
      var err = new Error(data.error.message || 'dehub refused the request.');
      err.code = data.error.code;
      slot.reject(err);
    } else {
      slot.resolve(data.result);
    }
  }

  window.addEventListener('message', receive);
  if (native) document.addEventListener('message', receive);

  var contextPromise = null;
  var tokenCache = null;

  window.dehub = {
    version: VERSION,

    /** True when the page is running inside dehub (web or app). */
    isInDehub: function () { return inHost; },

    /** Hide the splash screen. Call it once your first screen has painted. */
    ready: function () { return request('ready'); },

    /** Close the mini app. */
    close: function () { return request('close'); },

    /** { user, location, client } — resolved once, then cached. */
    get context() {
      if (!contextPromise) contextPromise = request('context');
      return contextPromise;
    },

    /** The SDK methods this host supports, e.g. ['auth.getToken', 'actions.composePost']. */
    getCapabilities: function () { return request('getCapabilities'); },

    auth: {
      /**
       * A signed JWT proving who the user is, for YOUR server to verify:
       * iss https://dehub.io, sub = wallet address, aud = your domain, 1 hour.
       * The first call asks the user to share their identity with you.
       */
      getToken: function (options) {
        var force = options && options.force;
        if (!force && tokenCache && tokenCache.expiresAt - Date.now() > 60000) {
          return Promise.resolve(tokenCache);
        }
        return request('auth.getToken', {}, 120000).then(function (result) {
          tokenCache = result;
          return result;
        });
      },
    },

    actions: {
      /** Open the dehub composer with text, and optionally a link back into your app. */
      composePost: function (options) { return request('actions.composePost', options || {}, 600000); },
      /** Open a dehub profile by handle. */
      viewProfile: function (options) { return request('actions.viewProfile', options || {}); },
      /** Open a dehub post by id. */
      viewPost: function (options) { return request('actions.viewPost', options || {}); },
      /** Open an external https:// link outside the mini app. */
      openUrl: function (url) { return request('actions.openUrl', { url: url }); },
      /**
       * Ask the user to add your app. Once added, your server can notify them
       * through the DeHub notify API with your app's notify key.
       */
      addApp: function () { return request('actions.addApp', {}, 600000); },
      /**
       * Ask the user to pay you in DHB. DeHub shows the amount, your app and
       * your wallet; the DHB goes straight to the wallet that signed your
       * dehub.json. Resolves to { txHash, chainId, amount, receipt } — send
       * `receipt` (a JWT, typ 'payment') to your server and verify it there.
       */
      pay: function (options) { return request('actions.pay', options || {}, 600000); },
    },

    haptics: {
      impact: function (style) { return request('haptics.impact', { style: style || 'medium' }).catch(function () {}); },
    },

    /** Subscribe to host events. Returns an unsubscribe function. */
    on: function (name, fn) {
      (listeners[name] = listeners[name] || []).push(fn);
      return function () {
        listeners[name] = (listeners[name] || []).filter(function (f) { return f !== fn; });
      };
    },
  };
})();
