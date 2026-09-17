/* ============================================================================
   download.js — the platform-aware download control
   ----------------------------------------------------------------------------
   Scribe ships on Windows, macOS, Linux, iOS and Android, so the button should
   not make the visitor work out which one they are on. It guesses from the
   browser, labels itself accordingly, and keeps every other platform one click
   away in a menu — a guess you can overrule, never a decision made for you.

   Two shapes, both driven from PLATFORMS in data.js:

     [data-download]    the full control — button + chevron + menu
     [data-dl-simple]   a plain button that only re-labels itself

   A chosen platform is remembered in localStorage so the rest of the site, and
   the visitor's next visit, agrees with what they picked. Anything under
   [data-dl-note] is rewritten with that platform's requirements line.

   Detection is deliberately conservative: userAgentData when the browser
   offers it, then the classic strings. iPadOS reports itself as a Mac, so a
   "Mac" with a touch screen is treated as iOS.
   ========================================================================== */

(function () {
  'use strict';

  if (typeof PLATFORMS === 'undefined' || !PLATFORMS.length) return;

  var KEY = 'scribe:platform';
  var groups = [];
  var current = null;

  function $$(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }
  function byId(id) {
    for (var i = 0; i < PLATFORMS.length; i++) if (PLATFORMS[i].id === id) return PLATFORMS[i];
    return null;
  }
  function icon(name, cls) {
    return '<svg class="' + (cls || 'icon') + '" aria-hidden="true"><use href="#' + name + '"></use></svg>';
  }
  function escapeHtml(v) {
    return String(v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ── what are we on? ───────────────────────────────────────────────────── */
  function detect() {
    var nav = window.navigator || {};
    var uad = nav.userAgentData;
    var plat = (uad && uad.platform) || nav.platform || '';
    var ua = nav.userAgent || '';
    var touch = (nav.maxTouchPoints || 0) > 1;
    var hay = (plat + ' ' + ua).toLowerCase();

    if (/android/.test(hay)) return 'android';
    if (/iphone|ipod|ipad/.test(hay)) return 'ios';
    /* iPadOS insists it is a Mac; a Mac with a touch screen is an iPad. */
    if (/mac/.test(hay) && touch) return 'ios';
    if (/win/.test(hay)) return 'windows';
    if (/mac|darwin/.test(hay)) return 'mac';
    if (/linux|x11|cros|ubuntu|fedora/.test(hay)) return 'linux';
    return 'windows';
  }

  function remembered() {
    try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function remember(id) {
    try { window.localStorage.setItem(KEY, id); } catch (e) {}
  }

  /* ── applying a choice ─────────────────────────────────────────────────── */
  function apply(p, persist) {
    if (!p) return;
    current = p;
    if (persist) remember(p.id);

    groups.forEach(function (g) {
      g.label.textContent = 'Download for ' + p.name;
      g.main.setAttribute('href', p.url);
      if (g.iconUse) g.iconUse.setAttribute('href', '#' + p.icon);
      if (g.toggle) g.toggle.setAttribute('aria-label', 'Download for ' + p.name + ' — choose another platform');
      $$('[data-dl-option]', g.root).forEach(function (btn) {
        btn.setAttribute('aria-checked', String(btn.getAttribute('data-dl-option') === p.id));
      });
    });

    $$('[data-dl-simple]').forEach(function (btn) {
      var span = btn.querySelector('[data-dl-label]') || btn;
      span.textContent = 'Download for ' + p.name;
      btn.setAttribute('href', p.url);
    });

    /* The requirements line sits between whatever the page wants either side
       of it, so one note can read differently in the hero and in a plan card. */
    $$('[data-dl-note]').forEach(function (el) {
      var before = el.getAttribute('data-dl-before');
      var after  = el.getAttribute('data-dl-after');
      if (before === null) before = 'Free while in beta';
      if (after === null)  after  = 'Your audio stays on your device';
      el.textContent = [before, p.req, after].filter(Boolean).join(' · ');
    });
  }

  /* ── the menu ──────────────────────────────────────────────────────────── */
  function buildMenu(g) {
    g.menu.innerHTML = PLATFORMS.map(function (p) {
      return '' +
        '<button class="dl__option" type="button" role="menuitemradio" aria-checked="false" data-dl-option="' + p.id + '">' +
          '<span class="dl__option-icon">' + icon(p.icon) + '</span>' +
          '<span class="dl__option-text">' +
            '<b>' + escapeHtml(p.name) + '</b>' +
            '<span>' + escapeHtml(p.format) + '</span>' +
          '</span>' +
          icon('i-check', 'dl__tick') +
        '</button>';
    }).join('');

    $$('[data-dl-option]', g.menu).forEach(function (btn) {
      btn.addEventListener('click', function () {
        apply(byId(btn.getAttribute('data-dl-option')), true);
        close(g);
        g.toggle.focus();
      });
    });
  }

  function open(g) {
    groups.forEach(function (other) { if (other !== g) close(other); });
    g.menu.hidden = false;
    g.root.classList.add('is-open');
    g.toggle.setAttribute('aria-expanded', 'true');
    var first = g.menu.querySelector('[aria-checked="true"]') || g.menu.querySelector('[data-dl-option]');
    if (first) first.focus();
  }
  function close(g) {
    g.menu.hidden = true;
    g.root.classList.remove('is-open');
    g.toggle.setAttribute('aria-expanded', 'false');
  }
  function isOpen(g) { return !g.menu.hidden; }

  function initGroup(root) {
    var main   = root.querySelector('[data-dl-main]');
    var toggle = root.querySelector('[data-dl-toggle]');
    var menu   = root.querySelector('[data-dl-menu]');
    var label  = root.querySelector('[data-dl-label]');
    if (!main || !toggle || !menu || !label) return;

    var iconEl = root.querySelector('[data-dl-icon]');
    var g = {
      root: root, main: main, toggle: toggle, menu: menu, label: label,
      iconUse: iconEl ? iconEl.querySelector('use') : null
    };
    groups.push(g);
    buildMenu(g);

    toggle.addEventListener('click', function () { isOpen(g) ? close(g) : open(g); });

    menu.addEventListener('keydown', function (e) {
      var opts = $$('[data-dl-option]', menu);
      var i = opts.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); opts[(i + 1) % opts.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); opts[(i <= 0 ? opts.length : i) - 1].focus(); }
      else if (e.key === 'Escape') { close(g); toggle.focus(); }
    });

    document.addEventListener('click', function (e) {
      if (isOpen(g) && !root.contains(e.target)) close(g);
    });
  }

  function init() {
    $$('[data-download]').forEach(initGroup);
    apply(byId(remembered()) || byId(detect()) || PLATFORMS[0], false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
