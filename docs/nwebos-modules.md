# NwebOS app modules (the games hook)

An NwebOS app can bring its own client code as a **module**: the shell opens the window, loads the module's script on the first open, and hands it the window's content area. This is how Pixelminen and Fünf plug in. It's also for anything else that must not load on every page (#100 perf budget: nothing is loaded or runs until the window is opened).

## 1. Register the app (server, `src/nwebos.js`)
Add one entry to `APPS`:

```js
{ k: "mines", path: "", de: "Pixelminen", en: "Pixel Mines", w: 300, h: 372, win: true, module: "/design/nwebos-games.js" },
{ k: "five",  path: "", de: "Fünf",       en: "Five",        w: 340, h: 560, win: true, module: "/design/nwebos-games.js" },
```

- `path: ""` gives the app no address of its own: opening it keeps the current URL, so there's no pushState.
- `module` is the script URL. The shell appends `?v=<asset version>`; files in `/design/` are cached as immutable.
- Add the window's **no-JS fallback** (a short sentence) to the content map in `nwebosPage`, keyed like `content.mines`. Without JS, that's what the section shows.
- Desktop icon and start menu entry come from `APPS` automatically. Add the icon as `<symbol id="i-<k>">` to `scripts/nwebos-icons.json` (16×16 grid, from `mockups/nwebos/src/art.py`: `ICONS["mines"]`, `_five()`), then run `node scripts/build-nwebos-icons.mjs`.

## 2. Write the module (client, e.g. `public/design/nwebos-games.js`)

```js
(function () {
  NwebOS.register("mines", {
    mount: function (el, ctx) {
      // el: the window's content element (empty); build the game inside it
      // ctx.lang        "de" | "en"
      // ctx.sound       { click(), open(), close(), tone(freq, delaySec, durSec, type, vol) }  (respects the mute toggle)
      // ctx.store       { get(name), set(name, value) }   localStorage, namespaced "nwebos.<key>.<name>"
      // ctx.window      the window element (e.g. for keyboard listeners scoped to it)
      // ctx.close()     close this window
    },
    unmount: function (el) { /* optional: stop timers, remove listeners */ }
  });
  NwebOS.register("five", { mount: function (el, ctx) { /* … */ } });
})();
```

- **One script can register several keys.** The shell loads each URL once.
- **Styles:** scope them under a class you put on `el` (e.g. `.g-mines`), in a stylesheet the module adds itself (`/design/nwebos-games.css?v=…` via a `<link>` it appends once), or inline in the module's CSS. Only CSS transforms and opacity for animation; no canvas.
- **No idle work:** timers only while a game runs, stopped in `unmount` and when the window is minimised (`ctx.window.classList.contains("min")`).
- **Window chrome:** title, minimise/maximise/close, dragging, the taskbar and the saved positions are all the shell's. Don't add your own.

## 3. Tests
Add a browser check in the style of `scripts/nwebos-ui.py`: open the icon, check that the module mounted (an element of yours exists), play a move, close it. Plus a unit check in `scripts/nwebos-unit.mjs` that the sections carry `data-module`.
