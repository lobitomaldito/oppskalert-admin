/* ============================================================
   Detail modal: click-to-expand overlay for editable list items.
   Self-hosted in editor/, copied to dist/admin/ by the build. Link it from
   the template with <script src="/admin/detail-modal.js" defer></script>.

   Any [data-list-item] that contains a [data-list-detail] block becomes
   clickable and opens the detail in a full-screen overlay. The card stays
   a short teaser, the detail block holds the long info (description,
   credits, links). Because the detail lives inside the list item, every
   item the admin adds via "+ Legg til" automatically gets a detail modal,
   no new pages, no routing.

   Reads from the clicked item:
     img / [data-list-image-field]   -> modal image (hidden if none)
     [data-list-field="meta"]        -> small label above title
     [data-list-field="tittel"] / h3 -> modal title
     [data-list-detail]              -> modal body (innerHTML)

   Skipped while the admin is editing (body.adm-editing) so clicks edit
   the text instead of opening the modal. Self-contained: injects its own
   minimal CSS, which the site may override via the .dm-* classes.
   ============================================================ */
(function () {
  'use strict';
  var CSS =
    '.dm{position:fixed;inset:0;z-index:1000;display:flex;align-items:flex-start;justify-content:center;padding:4vh 1rem;overflow-y:auto;background:rgba(12,10,8,0.78);backdrop-filter:blur(8px);opacity:0;pointer-events:none;transition:opacity .25s}' +
    '.dm.is-open{opacity:1;pointer-events:auto}' +
    '.dm__box{position:relative;width:100%;max-width:720px;margin:auto;background:#1c1916;color:#f4ecdd;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.6);overflow:hidden;transform:translateY(16px);transition:transform .25s}' +
    '.dm.is-open .dm__box{transform:translateY(0)}' +
    '.dm__media{aspect-ratio:16/9;background:#000}.dm__media img{width:100%;height:100%;object-fit:cover}' +
    '.dm__content{padding:2rem 2.2rem 2.4rem}' +
    '.dm__meta{font-size:.75rem;text-transform:uppercase;letter-spacing:.12em;opacity:.7;margin-bottom:.5rem}' +
    '.dm__title{font-size:1.7rem;margin:0 0 1.2rem}' +
    '.dm__body p{opacity:.82;margin-bottom:1rem;line-height:1.65}.dm__body strong{opacity:1;color:#fff}.dm__body a{color:#da762b;font-weight:700}' +
    '.dm__body blockquote{margin:1.2rem 0;padding-left:1.1rem;border-left:3px solid #da762b;font-style:italic}' +
    '.dm__close{position:absolute;top:14px;right:14px;z-index:2;width:40px;height:40px;border:0;border-radius:50%;cursor:pointer;background:rgba(12,10,8,.6);color:#fff;font-size:22px;line-height:1;display:flex;align-items:center;justify-content:center}' +
    '.dm__close:hover{background:#da762b}' +
    '.dm__back{margin-top:1.6rem;padding:.7rem 1.4rem;cursor:pointer;background:transparent;color:#da762b;font-weight:700;font-size:.9rem;border:1px solid #da762b;border-radius:100px}' +
    '.dm__back:hover{background:#da762b;color:#fff}' +
    'body.dm-open{overflow:hidden}' +
    '[data-list-item].dm-clickable{cursor:pointer}[data-list-detail]{display:none}' +
    'body.adm-editing [data-list-detail]{display:block}' +
    '.galleri{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:1.4rem 0}' +
    '.galleri img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;display:block}' +
    '.video-embed{position:relative;padding-top:56.25%;margin:1.4rem 0;border-radius:12px;overflow:hidden;background:#000}' +
    '.video-embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0}' +
    '@media(max-width:600px){.dm__content{padding:1.4rem 1.3rem 1.8rem}.galleri{grid-template-columns:1fr}}';

  var modal;
  // Cards we have already bound. NOT keyed on `.dm-clickable`: the admin's undo
  // snapshot preserves that class, so a restored card would look bound while its
  // listener died with the old DOM node. A WeakSet keyed on the element itself
  // is exact: restored cards are new nodes, so they rebind, survivors don't.
  var boundCards = new WeakSet();
  var cssDone = false;
  function injectCss() {
    if (cssDone) return; // init() can re-run; never inject the stylesheet twice
    cssDone = true;
    var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
  }
  function build() {
    modal = document.createElement('div');
    modal.className = 'dm'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    modal.innerHTML =
      '<div class="dm__box"><button class="dm__close" aria-label="Lukk">&times;</button>' +
      '<div class="dm__media"></div><div class="dm__content">' +
      '<div class="dm__meta"></div><h2 class="dm__title"></h2><div class="dm__body"></div>' +
      '<button class="dm__back" type="button">&lsaquo; Tilbake</button></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal || e.target.closest('.dm__close') || e.target.closest('.dm__back')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) close();
    });
  }
  function open(card) {
    if (!modal) build();
    var detail = card.querySelector('[data-list-detail]');
    var img = card.querySelector('[data-list-image-field], img');
    var meta = card.querySelector('[data-list-field="meta"]');
    var title = card.querySelector('[data-list-field="tittel"], h3, h2');
    var mediaBox = modal.querySelector('.dm__media');
    if (img && img.getAttribute('src')) {
      // The modal crop (16/9) is a different shape from the card's, so a focal point
      // that saves the faces on the card can still cut them here. Use the modal's own
      // point when the admin has set one (data-pos-modal), else inherit the card's.
      var focal = (img.getAttribute('data-pos-modal') || img.style.objectPosition || '').trim();
      if (!/^[\d.]+% [\d.]+%$/.test(focal)) focal = '';
      mediaBox.innerHTML = '<img src="' + img.getAttribute('src') + '" alt="' + (img.getAttribute('alt') || '') + '"' +
        (focal ? ' style="object-position:' + focal + '"' : '') + '>';
      // Point back at the card image so the admin editor knows where to save a
      // reposition made in here (see __srcCard in edit.js).
      mediaBox.firstChild.__srcCard = img;
      mediaBox.style.display = '';
    } else { mediaBox.style.display = 'none'; }
    modal.querySelector('.dm__meta').textContent = meta ? meta.textContent : '';
    modal.querySelector('.dm__title').textContent = title ? title.textContent : '';
    var bodyEl = modal.querySelector('.dm__body');
    bodyEl.innerHTML = detail ? detail.innerHTML : '';
    embedVideos(bodyEl);
    document.body.classList.add('dm-open');
    modal.classList.add('is-open');
  }

  // Map a YouTube/Vimeo URL to its embeddable player URL (null if not a video URL)
  function videoEmbedSrc(url) {
    var m;
    if ((m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/))) return 'https://www.youtube.com/embed/' + m[1];
    if ((m = url.match(/vimeo\.com\/(\d+)/))) return 'https://player.vimeo.com/video/' + m[1];
    return null;
  }
  function videoEmbedEl(src) {
    var wrap = document.createElement('div'); wrap.className = 'video-embed';
    wrap.innerHTML = '<iframe src="' + src + '" allowfullscreen loading="lazy"></iframe>';
    return wrap;
  }
  // Turn YouTube/Vimeo references into responsive embedded players. Handles both
  // proper <a href> links and bare URLs pasted as plain text. The admin paste
  // handler strips formatting, so a non-technical client's links arrive as text.
  function embedVideos(container) {
    [].slice.call(container.querySelectorAll('a[href]')).forEach(function (a) {
      var src = videoEmbedSrc(a.getAttribute('href') || '');
      if (src) a.parentNode.replaceChild(videoEmbedEl(src), a);
    });
    var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    var textNodes = []; while (walker.nextNode()) textNodes.push(walker.currentNode);
    var urlRe = /https?:\/\/[^\s<]+/g;
    textNodes.forEach(function (node) {
      var text = node.nodeValue; if (!text) return;
      var match, hit = null; urlRe.lastIndex = 0;
      while ((match = urlRe.exec(text))) { if (videoEmbedSrc(match[0])) { hit = match; break; } }
      if (!hit) return;
      var src = videoEmbedSrc(hit[0]);
      node.nodeValue = text.slice(0, hit.index) + text.slice(hit.index + hit[0].length);
      var block = node.parentNode;
      while (block && block !== container && 'P LI DIV BLOCKQUOTE SPAN'.indexOf(block.tagName) < 0) block = block.parentNode;
      var ref = (block && block !== container) ? block : node.parentNode;
      if (ref && ref.parentNode) ref.parentNode.insertBefore(videoEmbedEl(src), ref.nextSibling);
      else container.appendChild(videoEmbedEl(src));
      if (ref && ref !== container) {
        var leftover = (ref.textContent || '').replace(/ /g, ' ').trim();
        if (leftover === '' || /^(se\s+)?trailer:?$/i.test(leftover) || /^(se\s+)?video:?$/i.test(leftover)) ref.parentNode.removeChild(ref);
      }
    });
  }
  function close() {
    if (!modal) return;
    modal.classList.remove('is-open');
    document.body.classList.remove('dm-open');
  }
  // Idempotent: safe to call again after the DOM under <main> is replaced.
  // Never rebuilds `modal`: it lives on <body>, outside the edited region,
  // and the closure variable must keep pointing at that same element.
  function init() {
    injectCss();
    document.querySelectorAll('[data-list-item]').forEach(function (card) {
      if (!card.querySelector('[data-list-detail]')) return;
      card.classList.add('dm-clickable');
      if (boundCards.has(card)) return;
      boundCards.add(card);
      card.addEventListener('click', function (e) {
        if (document.body.classList.contains('adm-editing')) return;
        if (e.target.closest('a')) return;
        open(card);
      });
    });
  }
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
  // The admin's undo replaces <main>'s innerHTML, which drops every listener
  // bound here. edit.js fires this once the restored DOM is settled.
  document.addEventListener('adm:restored', init);
})();
