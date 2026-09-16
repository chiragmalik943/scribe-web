/* ============================================================================
   main.js — renders the list-shaped content from data.js
   ----------------------------------------------------------------------------
   Three lists live in data.js rather than in markup, because each is long,
   repetitive and likely to be replaced wholesale: the logo strip, the
   testimonial columns and the integrations grid. Everything else on the site is
   written directly in HTML.

   Loaded after data.js and before reveal.js, so anything rendered here is in
   the DOM by the time the reveal observer looks for it.
   ========================================================================== */

(function () {
  'use strict';

  function icon(name, cls) {
    return '<svg class="' + (cls || 'icon') + '" aria-hidden="true"><use href="#' + name + '"></use></svg>';
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  /* ── logo strip ────────────────────────────────────────────────────────────
     The track holds the same group twice; the CSS animation translates it by
     exactly -50%, so the loop is seamless.                                   */
  function renderLogos() {
    var track = document.querySelector('[data-logos]');
    if (!track || typeof LOGOS === 'undefined') return;

    var group = LOGOS.map(function (logo) {
      return '<span class="logo-item">' + icon(logo.icon) +
             escapeHtml(logo.name) + '</span>';
    }).join('');

    track.innerHTML =
      '<div class="marquee__group" aria-hidden="false">' + group + '</div>' +
      '<div class="marquee__group" aria-hidden="true">' + group + '</div>';
  }

  /* ── testimonial columns ───────────────────────────────────────────────── */
  function renderTestimonials() {
    var host = document.querySelector('[data-testimonials]');
    if (!host || typeof TESTIMONIALS === 'undefined') return;

    var columns = [[], [], []];
    TESTIMONIALS.forEach(function (item, i) { columns[i % 3].push(item); });

    host.innerHTML = columns.map(function (column, i) {
      var cards = column.map(function (t) {
        return '' +
          '<figure class="quote-card">' +
            '<span class="quote-card__logo">' + icon(t.icon) + escapeHtml(t.company) + '</span>' +
            '<blockquote><p>&ldquo;' + escapeHtml(t.quote) + '&rdquo;</p></blockquote>' +
            '<figcaption class="quote-card__who">' +
              '<b>' + escapeHtml(t.name) + '</b>' +
              '<span>' + escapeHtml(t.role) + ' at ' + escapeHtml(t.company) + '</span>' +
            '</figcaption>' +
          '</figure>';
      }).join('');

      // duplicate the column so the vertical loop has something to scroll into
      return '' +
        '<div class="vmarquee' + (i === 1 ? ' vmarquee--reverse' : '') + '"' +
             ' style="--speed:' + (54 + i * 9) + 's">' +
          '<div class="vmarquee__track">' + cards + cards + '</div>' +
        '</div>';
    }).join('');
  }

  /* ── integrations grid ─────────────────────────────────────────────────── */
  function renderIntegrations() {
    var host = document.querySelector('[data-integrations]');
    if (!host || typeof INTEGRATIONS === 'undefined') return;

    host.innerHTML = INTEGRATIONS.map(function (item) {
      return '' +
        '<article class="integration" data-filter-item="' + escapeHtml(item.name + ' ' + item.blurb) + '">' +
          '<div class="integration__head">' +
            '<span class="icon-tile">' + icon(item.icon) + '</span>' +
            '<span><b>' + escapeHtml(item.name) + '</b><span>' + escapeHtml(item.status) + '</span></span>' +
          '</div>' +
          '<p>' + escapeHtml(item.blurb) + '</p>' +
          '<a class="link-arrow" href="contact.html">Read more' + icon('i-arrow-right') + '</a>' +
        '</article>';
    }).join('');
  }

  function init() {
    renderLogos();
    renderTestimonials();
    renderIntegrations();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
