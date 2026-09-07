/* Admin inline-editor (deploy-on-save).
   ACTIVATION (no URL param needed):
     Desktop: type "admin" on keyboard (not inside a field)
     Mobile:  tap the footer "oppskalert." logo 5× within 3 s
   Once activated, toolbar appears on every page for the session.
   "Publiser" commits content/<page>.json to git → Vercel rebuilds (~45 s).
*/
(function () {
  'use strict';
  var pageKey = document.body.getAttribute('data-page-key');
  if (!pageKey) return;

  // Chat-assistenten er av med mindre siden ber om den. Den koster et
  // /api/chat-endepunkt og en API-noekkel, og de fleste kundesider trenger
  // den ikke. Siden slaar den paa med <body data-admin-chat>. hasAttribute og
  // ikke getAttribute: et attributt uten verdi leser som tom streng, og en tom
  // streng er falsy, saa getAttribute ville skrudd bryteren av igjen.
  var CHAT_PAA = document.body.hasAttribute('data-admin-chat');

  // Verifies a PIN against /api/verify-pin, behind the same rate limiter as
  // save (5 wrong guesses from one IP -> 15 min lockout).
  // The editor is never built for an unverified PIN, so guessing or forging
  // a sessionStorage value pops nothing but a "wrong PIN" message.
  function verifyPin(pin) {
    return fetch('/api/verify-pin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pin })
    })
      // Leser som tekst først. Svarer serveren med noe annet enn JSON (404 fra en
      // feilrutet /api, en 502-side, vedlikehold), skal brukeren få en setning
      // som er til å forstå, ikke en rå SyntaxError.
      .then(function (r) {
        return r.text().then(function (t) {
          var j = {};
          try { j = JSON.parse(t); } catch (e) {}
          return {
            ok: r.ok && j.ok === true,
            status: r.status,
            error: j.error || ('Innlogging feilet. Serveren svarte ' + r.status + ' uten forklaring.')
          };
        });
      })
      .catch(function () {
        return { ok: false, status: 0, error: 'Fikk ikke kontakt med serveren. Sjekk nettforbindelsen og prøv igjen.' };
      });
  }

  // --- Activation via keyboard sequence "admin" ---
  var SEQ = 'admin', buf = '', bufTimer;
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
    buf += e.key.toLowerCase();
    clearTimeout(bufTimer);
    bufTimer = setTimeout(function () { buf = ''; }, 3000);
    if (buf.slice(-SEQ.length) === SEQ) { buf = ''; promptPin(); }
  });

  // --- Activation via 5× tap on the footer credit line ---
  // Lytteren ligger på omslaget, ikke på selve kredittlenken, og teller bare
  // trykk utenfor <a>. Ellers ville preventDefault gjort lenken til Oppskalert
  // uklikkbar, og den lenken er en del av leveransen.
  var tapEl = document.querySelector('.footer__credit');
  if (tapEl) {
    var taps = 0, tapTimer;
    tapEl.addEventListener('click', function (e) {
      if (e.target.closest('a')) return;
      taps++;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(function () { taps = 0; }, 3000);
      if (taps >= 5) { taps = 0; promptPin(); }
    });
  }

  function promptPin() {
    if (sessionStorage.getItem('admin_pin')) return;
    var entered = prompt('Admin-PIN:');
    if (!entered) return;
    verifyPin(entered).then(function (res) {
      if (res.ok) { sessionStorage.setItem('admin_pin', entered); location.reload(); }
      else alert(res.error || 'Feil PIN');
    });
  }

  // «Logg inn» i bunnteksten. Lenken lagret tidligere PIN-en usjekket og lastet
  // siden på nytt; var den feil, ble den forkastet i stillhet og siden så helt
  // vanlig ut. Nå går den gjennom promptPin, som viser svaret fra serveren.
  [].slice.call(document.querySelectorAll('[data-admin-login]')).forEach(function (el) {
    el.addEventListener('click', function (e) { e.preventDefault(); promptPin(); });
  });

  // Backward-compat: ?edit in URL still works
  if (new URLSearchParams(location.search).has('edit') && !sessionStorage.getItem('admin_pin')) {
    promptPin();
  }

  var storedPin = sessionStorage.getItem('admin_pin');
  if (!storedPin) return; // public visitor, zero extra requests, nothing loads

  // sessionStorage can be forged from devtools, so re-verify server-side
  // before building anything below. Nothing renders for an unverified PIN.
  verifyPin(storedPin).then(function (res) {
    if (res.ok) initEditor(storedPin);
    else sessionStorage.removeItem('admin_pin'); // stale/rotated/forged -> back to public view, silently
  });

  function initEditor(pin) {

  // Admin-stilarket lastes først her, slik at besøkende slipper å hente
  // det på hver sidevisning (denne siden linker det ikke i <head>).
  if (!document.querySelector('link[data-admin-css]')) {
    var admCss = document.createElement('link');
    admCss.rel = 'stylesheet';
    admCss.href = '/admin/edit.css';
    admCss.setAttribute('data-admin-css', '');
    document.head.appendChild(admCss);
  }

  // Always read the PIN back from sessionStorage when talking to the API, never
  // from the `pin` snapshot above. The PIN is only ever verified server-side at
  // save time, so a wrong one is discovered after a session of editing. If the
  // request used the captured value, the only way to correct it would be a
  // reload, which throws away every unsaved edit. Reading it fresh lets us swap
  // in a corrected PIN in place (see the 401 branch in publish()).
  function currentPin() { return sessionStorage.getItem('admin_pin') || pin; }

  var editing = false;

  // Paste as PLAIN TEXT. Strips foreign formatting (colors, fonts, nested tags)
  // that would otherwise follow text copied from other sites and break the design.
  document.addEventListener('paste', function (e) {
    var t = e.target;
    if (!t || !t.isContentEditable) return;
    e.preventDefault();
    var text = ((e.clipboardData || window.clipboardData).getData('text/plain') || '');
    document.execCommand('insertText', false, text);
  });

  // Normalise browser bold/italic tags to the semantic ones the site styles use
  function normalizeHtml(s) {
    return s.replace(/<(\/?)b>/gi, '<$1strong>').replace(/<(\/?)i>/gi, '<$1em>');
  }

  // --- Floating format toolbar: bold / italic / clear (appears on text selection) ---
  (function () {
    var fbar = document.createElement('div');
    fbar.className = 'adm-fmt';
    fbar.style.display = 'none';
    fbar.innerHTML =
      '<button type="button" data-f="bold" title="Fet (Cmd/Ctrl+B)"><b>B</b></button>' +
      '<button type="button" data-f="italic" title="Kursiv (Cmd/Ctrl+I)"><i>I</i></button>' +
      '<button type="button" data-f="sm" title="Mindre tekst" style="font-size:12px">A−</button>' +
      '<button type="button" data-f="lg" title="Større tekst" style="font-size:17px">A+</button>' +
      '<button type="button" data-f="clear" title="Fjern formatering">⨯</button>';
    document.body.appendChild(fbar);

    // Wrap (or toggle off) the selection in a size class, using safe predefined steps
    function sizeAncestor(node, cls) {
      while (node && node !== document.body) {
        if (node.nodeType === 1 && node.classList && node.classList.contains(cls)) return node;
        node = node.parentNode;
      }
      return null;
    }
    function applySize(cls) {
      var sel = window.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) return;
      var range = sel.getRangeAt(0);
      var existing = sizeAncestor(range.startContainer, cls);
      if (existing) { // toggle off
        var par = existing.parentNode;
        while (existing.firstChild) par.insertBefore(existing.firstChild, existing);
        par.removeChild(existing);
        return;
      }
      var span = document.createElement('span');
      span.className = cls;
      try { range.surroundContents(span); }
      catch (e) { span.appendChild(range.extractContents()); range.insertNode(span); }
      sel.removeAllRanges();
    }

    function editableAncestor(node) {
      while (node && node !== document.body) {
        if (node.nodeType === 1 && node.getAttribute && node.getAttribute('contenteditable') === 'true') return node;
        node = node.parentNode;
      }
      return null;
    }
    function hide() { fbar.style.display = 'none'; }
    function update() {
      if (!editing) return hide();
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return hide();
      var range = sel.getRangeAt(0);
      if (!editableAncestor(range.startContainer)) return hide();
      var r = range.getBoundingClientRect();
      if (!r || (!r.width && !r.height)) return hide();
      fbar.style.display = 'flex';
      var left = window.scrollX + r.left + r.width / 2 - fbar.offsetWidth / 2;
      left = Math.max(8, Math.min(left, window.scrollX + document.documentElement.clientWidth - fbar.offsetWidth - 8));
      fbar.style.top = (window.scrollY + r.top - fbar.offsetHeight - 8) + 'px';
      fbar.style.left = left + 'px';
    }
    document.addEventListener('selectionchange', update);
    window.addEventListener('scroll', hide, true);
    fbar.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep the selection
    fbar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      e.preventDefault();
      try { document.execCommand('styleWithCSS', false, false); } catch (x) {}
      var f = b.getAttribute('data-f');
      if (f === 'bold') document.execCommand('bold');
      else if (f === 'italic') document.execCommand('italic');
      else if (f === 'sm') applySize('txt-sm');
      else if (f === 'lg') applySize('txt-lg');
      else if (f === 'clear') document.execCommand('removeFormat');
      update();
    });
  })();

  // Fields are re-queried after an undo restore. Anything inside a
  // [data-content-src] block is a read-only MIRROR of another page's content
  // (e.g. the full CV shown on Om). Editing happens on its source page only.
  var textFields = [], imageFields = [], listContainers = [];
  function inMirror(el) { return !!(el.closest && el.closest('[data-content-src]')); }
  function refreshFields() {
    textFields     = [].slice.call(document.querySelectorAll('[data-edit]')).filter(function (el) { return !inMirror(el); });
    imageFields    = [].slice.call(document.querySelectorAll('[data-edit-image]')).filter(function (el) { return !inMirror(el); });
    listContainers = [].slice.call(document.querySelectorAll('[data-editable-list]')).filter(function (el) { return !inMirror(el); });
  }
  refreshFields();

  // --- Toolbar ---
  var bar = document.createElement('div');
  bar.className = 'adm';
  bar.innerHTML =
    '<span class="adm__tag">✎ Admin</span>' +
    '<button class="adm__btn" data-act="toggle">Rediger</button>' +
    '<button class="adm__btn" data-act="undo" hidden title="Angre siste endring (Cmd/Ctrl+Z)">↶ Angre</button>' +
    '<button class="adm__btn" data-act="chat" hidden title="Spør AI-assistenten">💬 Assistent</button>' +
    '<button class="adm__btn adm__btn--primary" data-act="publish" hidden>Publiser</button>' +
    '<span class="adm__status"></span>' +
    '<button class="adm__btn adm__btn--ghost" data-act="logout">Logg ut</button>';
  document.body.appendChild(bar);

  // Swap footer "Logg inn" link to "Logg ut" behavior when admin is active
  var adminFooterLink = document.querySelector('.footer__admin-link');
  if (adminFooterLink) {
    adminFooterLink.textContent = 'Logg ut';
    adminFooterLink.onclick = function (e) {
      e.preventDefault();
      sessionStorage.removeItem('admin_pin');
      location.href = location.pathname;
    };
  }

  var status     = bar.querySelector('.adm__status');
  var publishBtn = bar.querySelector('[data-act="publish"]');
  var toggleBtn  = bar.querySelector('[data-act="toggle"]');
  var undoBtn    = bar.querySelector('[data-act="undo"]');
  var chatBtn    = bar.querySelector('[data-act="chat"]');

  // Single hidden file-input reused for all uploads
  var fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  var pendingEl = null, pendingAddGalleri = null, MAX_GALLERI = 6;
  fileInput.addEventListener('change', function () {
    var f = fileInput.files && fileInput.files[0];
    if (!f) return;
    if (pendingAddGalleri) {
      var gal = pendingAddGalleri; pendingAddGalleri = null;
      uploadImage(f, null, function (url, forhaandsvisning) {
        var fig = document.createElement('figure');
        fig.className = 'galleri__item';
        var img = document.createElement('img');
        img.setAttribute('src', forhaandsvisning);
        img.setAttribute('data-img-url', url);
        img.setAttribute('loading', 'lazy');
        var cap = document.createElement('figcaption');
        cap.className = 'galleri__credit';
        cap.setAttribute('data-placeholder', 'Foto');
        fig.appendChild(img);
        fig.appendChild(cap);
        var tile = gal.querySelector('.adm-gallery-add');
        gal.insertBefore(fig, tile || null);
        decorateGalleries(true); // hides the "+" once we hit MAX_GALLERI
      });
    } else if (pendingEl) {
      uploadImage(f, pendingEl);
    }
    fileInput.value = '';
  });

  function pickImage(el) { pendingEl = el; pendingAddGalleri = null; fileInput.click(); }
  function addGalleryImage(gal) { pendingAddGalleri = gal; pendingEl = null; fileInput.click(); }

  // Add a clickable "+ Bilde" tile to each gallery in edit mode (up to MAX_GALLERI).
  // The tile lives inside the editable content but is stripped on save (see cleanFieldHtml).
  function decorateGalleries(on) {
    [].slice.call(editRegion().querySelectorAll('.galleri')).forEach(function (gal) {
      var tile = gal.querySelector('.adm-gallery-add');
      if (on) {
        var count = gal.querySelectorAll('img').length;
        if (count < MAX_GALLERI && !tile) {
          tile = document.createElement('button');
          tile.type = 'button';
          tile.className = 'adm-gallery-add';
          tile.setAttribute('contenteditable', 'false');
          tile.textContent = '+ Bilde';
          tile.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); addGalleryImage(gal); });
          gal.appendChild(tile);
        } else if (count >= MAX_GALLERI && tile) {
          tile.remove();
        }
      } else if (tile) {
        tile.remove();
      }
    });
  }
  // innerHTML of a field, minus any admin-injected gallery "+ Bilde" tiles, and
  // with untouched photo-credit captions normalized (a caption that was clicked
  // into and left empty can pick up a stray <br> from the browser).
  function cleanFieldHtml(el) {
    if (!el.querySelector('.adm-gallery-add') && !el.querySelector('.galleri__credit') &&
        !el.querySelector('img[data-img-url]')) return el.innerHTML;
    var c = el.cloneNode(true);
    c.querySelectorAll('.adm-gallery-add').forEach(function (n) { n.remove(); });
    c.querySelectorAll('.galleri__credit').forEach(function (n) { if (!n.textContent.trim()) n.innerHTML = ''; });
    // Et ventende bilde viser data-URL-en i src og baerer den endelige stien i
    // data-img-url. Her byttes den tilbake, saa innholdet som publiseres peker
    // paa fila og ikke paa en base64-streng.
    c.querySelectorAll('img[data-img-url]').forEach(function (n) {
      n.setAttribute('src', n.getAttribute('data-img-url'));
      n.removeAttribute('data-img-url');
    });
    return c.innerHTML;
  }
  // True if a field's cleaned HTML has no real content (only whitespace/<br>/&nbsp;).
  // Embedded media counts as content: an images-only field (e.g. the CV portfolio,
  // whose whole body is a gallery) has no text but must NEVER be treated as empty,
  // or publishing would silently wipe it.
  function fieldIsEmpty(html) {
    if (/<(?:img|iframe|video|source|embed)\b/i.test(html)) return false;
    return !html.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;/gi, ' ').replace(/<[^>]+>/g, '').trim();
  }

  // -------------------------------------------------------
  //  UNDO: snapshot-based, covers text, images and list ops
  // -------------------------------------------------------
  var undoStack = [], MAX_UNDO = 50;
  var skipFocusSnap = false; // suppress the focus snapshot triggered by auto-focusing a new row
  function editRegion() { return document.querySelector('main') || document.body; }
  // Snapshot the editable area WITHOUT admin-only scaffolding, so restoring a
  // snapshot re-injects fresh controls instead of duplicating the old ones.
  function captureState() {
    var clone = editRegion().cloneNode(true);
    clone.querySelectorAll('.adm-list__ctrl, .adm-list__add, .adm-gallery-add').forEach(function (n) { n.remove(); });
    clone.querySelectorAll('[contenteditable]').forEach(function (n) { n.removeAttribute('contenteditable'); });
    ['adm-editable', 'adm-image', 'adm-image-hit', 'adm-posing', 'is-dragging'].forEach(function (cls) {
      clone.querySelectorAll('.' + cls).forEach(function (n) { n.classList.remove(cls); });
    });
    return clone.innerHTML;
  }
  function pushUndo() {
    var snap = captureState();
    if (undoStack.length && undoStack[undoStack.length - 1] === snap) return; // no change
    undoStack.push(snap);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    refreshUndoBtn();
  }
  function refreshUndoBtn() { if (undoBtn) { undoBtn.hidden = !editing; undoBtn.disabled = undoStack.length === 0; } }
  function undo() {
    if (!undoStack.length) return;
    endPosMode();              // the element being positioned is about to be replaced
    editRegion().innerHTML = undoStack.pop();
    refreshFields();
    applyEditingState();
    refreshUndoBtn();
    // Replacing the innerHTML threw away every listener the site bound at
    // DOMContentLoaded (detail modal, "Vis mer"). Tell main.js to re-init now
    // that the restored DOM and the editing state are settled.
    document.dispatchEvent(new Event('adm:restored'));
    status.textContent = '↶ Angret';
  }

  // -------------------------------------------------------
  //  EDIT MODE ON / OFF
  // -------------------------------------------------------
  // Images can sit behind overlays or inside a link (e.g. the front-page
  // "doors"). Bind the click to the nearest <a> wrapper so the picker opens
  // and navigation is suppressed while editing.
  function decorateImageField(el, on) {
    el.classList.toggle('adm-image', on);
    var hit = el.closest('a') || el;
    if (on) {
      if (!hit.__admImg) {
        hit.__admImg = function (e) {
          e.preventDefault(); e.stopPropagation();
          if (posEl === el) return;          // being repositioned, taps belong to the drag
          openImgMenu(el, { del: false });
        };
        hit.addEventListener('click', hit.__admImg, true);
      }
      if (hit !== el) hit.classList.add('adm-image-hit');
    } else {
      if (hit.__admImg) { hit.removeEventListener('click', hit.__admImg, true); hit.__admImg = null; }
      hit.classList.remove('adm-image-hit');
    }
  }

  function applyEditingState() {
    var on = editing;
    if (!on) endPosMode();
    document.body.classList.toggle('adm-editing', on); // lets the site know (e.g. suppress detail-modal clicks)
    textFields.forEach(function (el) {
      el.contentEditable = on ? 'true' : 'false';
      el.classList.toggle('adm-editable', on);
    });
    imageFields.forEach(function (el) { decorateImageField(el, on); });
    listContainers.forEach(function (c) { activateList(c, on); });
    decorateGalleries(on);
    [].slice.call(document.querySelectorAll('[data-content-src]')).forEach(function (m) {
      m.classList.toggle('adm-readonly', on);
    });
    toggleBtn.textContent = on ? 'Avslutt' : 'Rediger';
    publishBtn.hidden = !on;
    chatBtn.hidden = !on || !CHAT_PAA;
    if (!on) closeChat();
    refreshUndoBtn();
    status.textContent = on ? 'Klikk i teksten eller på et bilde for å bytte …' : '';
  }

  function setEditing(on) {
    editing = on;
    if (!on) undoStack = []; // fresh history each editing session
    applyEditingState();
  }

  // -------------------------------------------------------
  //  LIST EDITING
  // -------------------------------------------------------
  function itemCount(container) { return container.querySelectorAll('[data-list-item]').length; }

  // Per-item control bar: move up/down, hide/show, delete
  function makeControls(container, item) {
    var ctrl = document.createElement('div');
    ctrl.className = 'adm-list__ctrl';
    function btn(act, label, title) {
      return '<button type="button" data-a="' + act + '" title="' + title + '">' + label + '</button>';
    }
    function hideLabel() { return item.classList.contains('is-hidden-item') ? '🙈' : '👁'; }
    ctrl.innerHTML = btn('up', '↑', 'Flytt opp') + btn('down', '↓', 'Flytt ned') +
                     btn('hide', hideLabel(), 'Skjul / vis') + btn('del', '×', 'Fjern');
    ctrl.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      pushUndo();
      var a = b.getAttribute('data-a');
      if (a === 'up') {
        var p = item.previousElementSibling;
        if (p && p.hasAttribute('data-list-item')) container.insertBefore(item, p);
      } else if (a === 'down') {
        var n = item.nextElementSibling;
        if (n && n.hasAttribute('data-list-item')) container.insertBefore(n, item);
      } else if (a === 'hide') {
        item.classList.toggle('is-hidden-item');
        b.textContent = hideLabel();
      } else if (a === 'del') {
        if (itemCount(container) > 1) item.remove();
        else status.textContent = 'Kan ikke fjerne det siste elementet';
      }
    });
    return ctrl;
  }

  function activateItem(container, item, on) {
    [].slice.call(item.querySelectorAll('[data-list-field]')).forEach(function (el) {
      el.contentEditable = on ? 'true' : 'false';
      el.classList.toggle('adm-editable', on);
    });
    [].slice.call(item.querySelectorAll('[data-list-image-field]')).forEach(function (el) {
      el.classList.toggle('adm-image', on);
      el.onclick = on ? function (e) {
        e.preventDefault();
        if (posEl === el) return;            // being repositioned, taps belong to the drag
        openImgMenu(el, { del: false });
      } : null;
    });
    var existing = item.querySelector('.adm-list__ctrl');
    if (on && !existing) {
      if (getComputedStyle(item).position === 'static') item.style.position = 'relative';
      item.appendChild(makeControls(container, item));
    } else if (!on && existing) {
      existing.remove();
    }
  }

  function activateList(container, on) {
    [].slice.call(container.querySelectorAll('[data-list-item]')).forEach(function (item) {
      activateItem(container, item, on);
    });

    var key = container.getAttribute('data-editable-list');
    var addBtn = container.parentNode && container.parentNode.querySelector('.adm-list__add[data-for="' + key + '"]');
    if (on && !addBtn) {
      addBtn = document.createElement('button');
      addBtn.className = 'adm-list__add adm__btn';
      addBtn.textContent = '+ Legg til';
      addBtn.setAttribute('data-for', key);
      addBtn.onclick = function (e) { e.preventDefault(); addListItem(container); };
      container.insertAdjacentElement('afterend', addBtn);
    } else if (!on && addBtn) {
      addBtn.remove();
    }
  }

  // data: optional {field: html} to prefill the new item (used by the chat assistant).
  // skipSnapshot: the chat assistant takes its own single snapshot for a whole batch
  // of ops, so a per-item snapshot here would only let "Angre" undo the last op.
  function addListItem(container, data, skipSnapshot) {
    var existing = [].slice.call(container.querySelectorAll('[data-list-item]'));
    if (!existing.length) return;
    if (!skipSnapshot) pushUndo();
    // Clone structure from the last item and clear its content
    var clone = existing[existing.length - 1].cloneNode(true);
    clone.classList.remove('is-hidden-item');
    [].slice.call(clone.querySelectorAll('[data-list-field]')).forEach(function (el) {
      var k = el.getAttribute('data-list-field');
      el.innerHTML = (data && Object.prototype.hasOwnProperty.call(data, k)) ? sanitizeInline(data[k]) : '';
    });
    [].slice.call(clone.querySelectorAll('[data-list-image-field]')).forEach(function (el) {
      if (el.tagName === 'IMG') el.setAttribute('src', '');
      else el.style.backgroundImage = '';
      el.removeAttribute('data-img-url');
    });
    var oldCtrl = clone.querySelector('.adm-list__ctrl'); if (oldCtrl) oldCtrl.remove();
    container.appendChild(clone);
    activateItem(container, clone, true);
    clone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (data) return; // chat-filled item, don't steal focus into it
    var firstField = clone.querySelector('[data-list-field]');
    if (firstField) { skipFocusSnap = true; firstField.focus(); }
  }

  function collectList(container) {
    return [].slice.call(container.querySelectorAll('[data-list-item]')).map(function (item) {
      var obj = {};
      [].slice.call(item.querySelectorAll('[data-list-field]')).forEach(function (el) {
        var html = normalizeHtml(cleanFieldHtml(el).trim());
        obj[el.getAttribute('data-list-field')] = fieldIsEmpty(html) ? '' : html;
      });
      [].slice.call(item.querySelectorAll('[data-list-image-field]')).forEach(function (el) {
        var url = currentImageUrl(el), k = el.getAttribute('data-list-image-field'), pos = savedPos(el);
        if (url) obj[k] = url;
        if (pos) obj[k + '@pos'] = pos;
        var modalPos = el.getAttribute('data-pos-modal');   // set by repositioning inside a "Les mer"
        if (modalPos) obj[k + '@pos-modal'] = modalPos;
      });
      if (item.classList.contains('is-hidden-item')) obj._skjult = '1';
      return obj;
    });
  }

  // -------------------------------------------------------
  //  IMAGE HELPERS
  // -------------------------------------------------------
  // Shrink large images in the browser BEFORE upload, so uploads stay web-sized
  // (max 1800px long side, JPEG q82). Small images pass through untouched. EXIF
  // orientation is baked in via createImageBitmap so photos never come out rotated.
  // Bonus: the upload payload drops from tens of MB to a few hundred KB.
  function prepImage(file, cb) {
    var pass = function () { var r = new FileReader(); r.onload = function () { cb(r.result, file.name, file.type); }; r.readAsDataURL(file); };
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return pass(); // leave gif/svg/etc. alone
    var done = false;
    function finish(src, sw, sh) {
      if (done) return; done = true;
      if (Math.max(sw, sh) <= 1800 && file.size < 800 * 1024) { if (src.close) src.close(); return pass(); } // already small
      var scale = Math.min(1, 1800 / Math.max(sw, sh));
      var w = Math.round(sw * scale), h = Math.round(sh * scale);
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(src, 0, 0, w, h);
      if (src.close) src.close();
      var isPng = file.type === 'image/png';
      var type = isPng ? 'image/png' : 'image/jpeg';
      var data = c.toDataURL(type, 0.82);
      var navn = file.name;
      if (type === 'image/jpeg' && !/\.jpe?g$/i.test(navn)) navn = navn.replace(/\.[^.]+$/, '') + '.jpg';
      cb(data, navn, type);
    }
    function viaImage() {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); finish(img, img.naturalWidth, img.naturalHeight); };
      img.onerror = function () { URL.revokeObjectURL(url); pass(); };
      img.src = url;
    }
    if (window.createImageBitmap) {
      createImageBitmap(file, { imageOrientation: 'from-image' })
        .then(function (bm) { finish(bm, bm.width, bm.height); })
        .catch(viaImage);
    } else { viaImage(); }
  }

  // Bilder lastes IKKE opp med det samme lenger. De legges til side og reiser
  // med publiseringen, slik at tekst og bilder blir ett commit og ett
  // Vercel-bygg. Bivirkning verdt aa ha: et bilde klienten angrer paa havner
  // aldri i repoet.
  var ventendeBilder = [];

  function uploadImage(file, el, onUrl) {
    status.textContent = 'Behandler bilde …';
    prepImage(file, function (data, navn) {
      var trygtNavn = navn.replace(/[^a-zA-Z0-9._-]/g, '_');
      var filnavn = Date.now() + '-' + trygtNavn;
      var url = '/assets/uploads/' + filnavn;

      ventendeBilder.push({ sti: 'static/assets/uploads/' + filnavn, data: data });

      pushUndo();
      // Vis data-URL-en med en gang saa klienten ser bildet, men skriv den
      // ENDELIGE stien i data-img-url. Det er den som havner i innholdet ved
      // publisering, og den peker paa fila commit-et legger igjen.
      if (onUrl) { onUrl(url, data); }
      else { applyImage(el, data); el.setAttribute('data-img-url', url); }
      status.textContent = '✓ Bilde klart. Husk å Publisere.';
    });
  }

  function applyImage(el, url) {
    if (el.tagName === 'IMG') el.setAttribute('src', url);
    else el.style.backgroundImage = "url('" + url + "')";
  }

  function currentImageUrl(el) {
    if (el.getAttribute('data-img-url')) return el.getAttribute('data-img-url');
    if (el.tagName === 'IMG') return el.getAttribute('src');
    var m = (el.getAttribute('style') || '').match(/url\(["']?([^"')]+)["']?\)/);
    return m ? m[1] : null;
  }

  // -------------------------------------------------------
  //  FOCAL POINT: drag a cropped image to pick what shows
  // -------------------------------------------------------
  // Cropped images are object-fit / background-size: cover, so the browser keeps
  // the CENTRE by default and happily cuts off heads. Dragging writes an explicit
  // object-position (or background-position) pair of percentages instead.
  // Persistence: a keyed image saves as "<key>@pos" (see build.mjs); an image inside
  // rich content (a gallery in a "Les mer") already saves its inline style with the
  // surrounding HTML, so nothing extra is needed there.
  var posEl = null, posBar = null, posDrag = null;

  // Pixels of image hidden outside the box, per axis, also the drag distance that
  // moves the crop from one edge to the other, so dragging tracks the finger 1:1.
  function cropOverflow(el) {
    var W = el.clientWidth, H = el.clientHeight;
    if (!W || !H) return null;
    if (el.tagName === 'IMG') {
      if (getComputedStyle(el).objectFit !== 'cover') return null;
      var nw = el.naturalWidth, nh = el.naturalHeight;
      // Not decoded yet (a lazy image only just scrolled into view): fall back to
      // the same half-box guess as a background. Drag start recomputes this, and
      // by then the photo is on screen and loaded.
      if (!nw || !nh) return { x: W * 0.5, y: H * 0.5 };
      var s = Math.max(W / nw, H / nh);
      return { x: Math.max(0, nw * s - W), y: Math.max(0, nh * s - H) };
    }
    if (!/cover/.test(getComputedStyle(el).backgroundSize)) return null;
    // A background image's natural size isn't readable synchronously, so assume a
    // half-box overflow, which gives a sane drag speed on the front-page "doors".
    return { x: W * 0.5, y: H * 0.5 };
  }
  function canReposition(el) {
    var o = cropOverflow(el);
    return !!o && (o.x > 2 || o.y > 2);
  }

  function readPos(el) {
    var v = el.tagName === 'IMG'
      ? (el.style.objectPosition || getComputedStyle(el).objectPosition)
      : (el.style.backgroundPosition || getComputedStyle(el).backgroundPosition);
    var m = String(v || '').match(/(-?[\d.]+)%\s+(-?[\d.]+)%/);
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 50, y: 50 };
  }
  function writePos(el, x, y) {
    x = Math.max(0, Math.min(100, x));
    y = Math.max(0, Math.min(100, y));
    var v = (Math.round(x * 10) / 10) + '% ' + (Math.round(y * 10) / 10) + '%';
    if (el.tagName === 'IMG') el.style.objectPosition = v; else el.style.backgroundPosition = v;
    // The image inside a "Les mer" modal is built by main.js and thrown away on
    // close, so its own style can't be saved. Mirror the value onto the card image
    // it came from, where collectList picks it up as "<felt>@pos-modal".
    if (el.__srcCard) el.__srcCard.setAttribute('data-pos-modal', v);
  }
  // Only ever set by a drag. An untouched image saves nothing, so the stylesheet
  // keeps deciding (e.g. the top-anchored clown portraits).
  function savedPos(el) {
    return ((el.tagName === 'IMG' ? el.style.objectPosition : el.style.backgroundPosition) || '').trim();
  }

  function startPosMode(el) {
    if (posEl === el) return;
    endPosMode();
    pushUndo();                    // one snapshot covers the whole reposition
    posEl = el;
    el.classList.add('adm-posing');
    el.addEventListener('pointerdown', onPosDown);
    showPosBar(el);
    status.textContent = 'Dra bildet dit du vil ha det – piltaster finjusterer';
  }
  function endPosMode() {
    if (!posEl) return;
    posEl.classList.remove('adm-posing', 'is-dragging');
    posEl.removeEventListener('pointerdown', onPosDown);
    posEl = null; posDrag = null;
    if (posBar) posBar.style.display = 'none';
  }

  function onPosDown(e) {
    if (!posEl) return;
    var o = cropOverflow(posEl); if (!o) return;
    e.preventDefault(); e.stopPropagation();
    var p = readPos(posEl);
    posDrag = { x: e.clientX, y: e.clientY, px: p.x, py: p.y, o: o };
    try { posEl.setPointerCapture(e.pointerId); } catch (x) {}
    posEl.classList.add('is-dragging');
    posEl.addEventListener('pointermove', onPosMove);
    posEl.addEventListener('pointerup', onPosUp);
    posEl.addEventListener('pointercancel', onPosUp);
  }
  function onPosMove(e) {
    if (!posDrag) return;
    e.preventDefault();
    // The photo follows the finger: drag DOWN to bring what's above into view,
    // which means a SMALLER y percentage. Same logic horizontally.
    var dx = posDrag.o.x > 2 ? ((e.clientX - posDrag.x) / posDrag.o.x) * 100 : 0;
    var dy = posDrag.o.y > 2 ? ((e.clientY - posDrag.y) / posDrag.o.y) * 100 : 0;
    writePos(posEl, posDrag.px - dx, posDrag.py - dy);
  }
  function onPosUp(e) {
    if (!posEl) return;
    posDrag = null;
    posEl.classList.remove('is-dragging');
    posEl.removeEventListener('pointermove', onPosMove);
    posEl.removeEventListener('pointerup', onPosUp);
    posEl.removeEventListener('pointercancel', onPosUp);
    try { posEl.releasePointerCapture(e.pointerId); } catch (x) {}
    status.textContent = '✓ Utsnitt endret – husk å Publisere';
  }

  function showPosBar(el) {
    if (!posBar) {
      posBar = document.createElement('div');
      posBar.className = 'adm-imgmenu adm-posbar';
      posBar.innerHTML =
        '<span class="adm-posbar__hint">✥ Dra bildet</span>' +
        '<button type="button" data-pa="center">Midtstill</button>' +
        '<button type="button" data-pa="done">✓ Ferdig</button>';
      document.body.appendChild(posBar);
      posBar.addEventListener('mousedown', function (e) { e.preventDefault(); });
      posBar.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b || !posEl) return;
        e.preventDefault(); e.stopPropagation();
        if (b.getAttribute('data-pa') === 'center') {
          writePos(posEl, 50, 50);
          status.textContent = '✓ Midtstilt – husk å Publisere';
        } else {
          endPosMode();
          status.textContent = '✓ Utsnitt satt – husk å Publisere';
        }
      });
    }
    posBar.style.display = 'flex';
    placeFloating(posBar, el);
  }

  // Arrow keys nudge the same way a drag would; Esc leaves positioning mode.
  document.addEventListener('keydown', function (e) {
    if (!posEl) return;
    if (e.key === 'Escape') { endPosMode(); return; }
    var step = e.shiftKey ? 5 : 1, p = readPos(posEl);
    if (e.key === 'ArrowDown')       writePos(posEl, p.x, p.y - step);
    else if (e.key === 'ArrowUp')    writePos(posEl, p.x, p.y + step);
    else if (e.key === 'ArrowLeft')  writePos(posEl, p.x + step, p.y);
    else if (e.key === 'ArrowRight') writePos(posEl, p.x - step, p.y);
    else return;
    e.preventDefault();
    status.textContent = '✓ Utsnitt endret – husk å Publisere';
  });

  // -------------------------------------------------------
  //  CHAT ASSISTANT: natural-language edits via Claude
  // -------------------------------------------------------
  // The assistant only ever PROPOSES edits (op/key/value shape below); nothing
  // touches the DOM until the admin clicks "Bruk endringene" on that specific
  // proposal, and every applied batch is one pushUndo() snapshot so "↶ Angre"
  // reverts the whole thing in one click. Publishing stays a fully separate,
  // manual step (publish() below), and the assistant never calls /api/save.
  var chatHistory = []; // [{role:'user'|'assistant', text}], plain text only, sent back for follow-ups
  var chatPanel = null, chatLog = null, chatForm = null, chatInput = null, chatSending = false;

  // Strip everything except the small inline set the site's CSS actually styles
  // (see gotcha #2 in the skill: <b>/<i> from execCommand are normalised on
  // publish, but here we go straight to the semantic tags since this never
  // passes through the format toolbar).
  function sanitizeInline(html) {
    var div = document.createElement('div');
    div.innerHTML = String(html == null ? '' : html);
    (function clean(node) {
      [].slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 8) { node.removeChild(n); return; } // comments
        if (n.nodeType !== 1) return;
        var tag = n.tagName.toLowerCase();
        if (['strong', 'em', 'br'].indexOf(tag) === -1) {
          while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n);
          n.parentNode.removeChild(n);
          return;
        }
        [].slice.call(n.attributes).forEach(function (a) { n.removeAttribute(a.name); });
        clean(n);
      });
    })(div);
    return div.innerHTML;
  }

  // What the assistant is allowed to see and edit: every data-edit text field and
  // every data-editable-list, by current value. Images are deliberately excluded:
  // the assistant can never touch them (no upload channel), and it's told so.
  function buildChatContext() {
    var ctx = {};
    textFields.forEach(function (el) {
      var html = normalizeHtml(cleanFieldHtml(el).trim());
      ctx[el.getAttribute('data-edit')] = { type: 'text', value: fieldIsEmpty(html) ? '' : html };
    });
    listContainers.forEach(function (c) {
      var key = c.getAttribute('data-editable-list');
      var items = [].slice.call(c.querySelectorAll('[data-list-item]')).map(function (item) {
        var obj = {};
        [].slice.call(item.querySelectorAll('[data-list-field]')).forEach(function (el) {
          var html = normalizeHtml(cleanFieldHtml(el).trim());
          obj[el.getAttribute('data-list-field')] = fieldIsEmpty(html) ? '' : html;
        });
        return obj;
      });
      ctx[key] = { type: 'list', items: items };
    });
    return ctx;
  }

  function ensureChatPanel() {
    if (chatPanel || !CHAT_PAA) return;
    chatPanel = document.createElement('div');
    chatPanel.className = 'adm-chat';
    chatPanel.hidden = true;
    chatPanel.innerHTML =
      '<div class="adm-chat__head">' +
        '<span>💬 AI-assistent</span>' +
        '<button type="button" class="adm-chat__close" title="Lukk">✕</button>' +
      '</div>' +
      '<div class="adm-chat__hint">Forklar hva du vil endre. Foreslåtte endringer må godkjennes før de brukes, og ingenting publiseres uten at du trykker Publiser.</div>' +
      '<div class="adm-chat__log"></div>' +
      '<form class="adm-chat__form">' +
        '<textarea class="adm-chat__input" rows="2" placeholder="F.eks. «Gjør ingressen litt kortere» …"></textarea>' +
        '<button type="submit" class="adm__btn adm__btn--primary">Send</button>' +
      '</form>';
    document.body.appendChild(chatPanel);
    chatLog = chatPanel.querySelector('.adm-chat__log');
    chatForm = chatPanel.querySelector('.adm-chat__form');
    chatInput = chatPanel.querySelector('.adm-chat__input');
    chatPanel.querySelector('.adm-chat__close').addEventListener('click', closeChat);
    chatForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = chatInput.value.trim();
      if (!text || chatSending) return;
      chatInput.value = '';
      sendChatMessage(text);
    });
    chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatForm.requestSubmit(); }
    });
  }

  function toggleChat() { chatPanel && !chatPanel.hidden ? closeChat() : openChat(); }
  function openChat() { ensureChatPanel(); if (!chatPanel) return; chatPanel.hidden = false; chatInput.focus(); }
  function closeChat() { if (chatPanel) chatPanel.hidden = true; }

  function addChatMsg(role, node) {
    var wrap = document.createElement('div');
    wrap.className = 'adm-chat__msg adm-chat__msg--' + role;
    if (typeof node === 'string') wrap.textContent = node; else wrap.appendChild(node);
    chatLog.appendChild(wrap);
    chatLog.scrollTop = chatLog.scrollHeight;
    return wrap;
  }

  function describeOp(op) {
    if (op.op === 'setText') return op.key + ': "' + op.value.replace(/<[^>]+>/g, '') + '"';
    if (op.op === 'listAdd') return '+ nytt element i «' + op.key + '»';
    if (op.op === 'listUpdate') return '« ' + op.key + ' [' + op.index + ']» endres';
    if (op.op === 'listRemove') return '– fjerner element ' + op.index + ' fra «' + op.key + '»';
    return op.op + ' ' + op.key;
  }

  function renderProposal(data) {
    var box = document.createElement('div');
    var summary = document.createElement('div');
    summary.className = 'adm-chat__summary';
    summary.textContent = data.summary || 'Forslag til endringer:';
    box.appendChild(summary);

    if (data.edits && data.edits.length) {
      var ul = document.createElement('ul');
      ul.className = 'adm-chat__diff';
      data.edits.forEach(function (op) {
        var li = document.createElement('li');
        li.textContent = describeOp(op);
        ul.appendChild(li);
      });
      box.appendChild(ul);

      var actions = document.createElement('div');
      actions.className = 'adm-chat__actions';
      var applyBtn = document.createElement('button');
      applyBtn.type = 'button'; applyBtn.className = 'adm__btn adm__btn--primary';
      applyBtn.textContent = '✓ Bruk endringene';
      var rejectBtn = document.createElement('button');
      rejectBtn.type = 'button'; rejectBtn.className = 'adm__btn adm__btn--ghost';
      rejectBtn.textContent = '✕ Avvis';
      actions.appendChild(applyBtn); actions.appendChild(rejectBtn);
      box.appendChild(actions);

      applyBtn.addEventListener('click', function () {
        applyChatEdits(data.edits);
        actions.innerHTML = '<span class="adm-chat__done">✓ Brukt. Husk å Publisere.</span>';
      });
      rejectBtn.addEventListener('click', function () {
        actions.innerHTML = '<span class="adm-chat__done">Avvist</span>';
      });
    }
    return box;
  }

  // Applies one proposal as a SINGLE undo step, using the same primitives as the
  // manual editor (addListItem, collectList's field lookups) so behaviour matches
  // a hand-made edit exactly.
  function applyChatEdits(edits) {
    pushUndo();
    (edits || []).forEach(function (op) {
      if (op.op === 'setText') {
        var tf = textFields.filter(function (el) { return el.getAttribute('data-edit') === op.key; })[0];
        if (tf) tf.innerHTML = sanitizeInline(op.value);
        return;
      }
      var container = listContainers.filter(function (c) { return c.getAttribute('data-editable-list') === op.key; })[0];
      if (!container) return;
      if (op.op === 'listAdd') {
        addListItem(container, op.item || {}, true);
      } else if (op.op === 'listUpdate') {
        var items = container.querySelectorAll('[data-list-item]');
        var item = items[op.index];
        if (!item) return;
        Object.keys(op.item || {}).forEach(function (fk) {
          var fEl = item.querySelector('[data-list-field="' + fk + '"]');
          if (fEl) fEl.innerHTML = sanitizeInline(op.item[fk]);
        });
      } else if (op.op === 'listRemove') {
        var list = container.querySelectorAll('[data-list-item]');
        if (list.length > 1 && list[op.index]) list[op.index].remove();
      }
    });
    status.textContent = '✓ AI-endringer brukt. Husk å Publisere.';
  }

  function sendChatMessage(text) {
    addChatMsg('user', text);
    chatHistory.push({ role: 'user', text: text });
    var pending = addChatMsg('ai', 'Tenker …');
    chatSending = true;
    chatForm.querySelector('button[type="submit"]').disabled = true;

    fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: pageKey, pin: currentPin(), message: text, context: buildChatContext(), history: chatHistory.slice(-8) })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
      .then(function (res) {
        pending.remove();
        if (res.ok && res.j.ok) {
          chatHistory.push({ role: 'assistant', text: res.j.summary || '' });
          addChatMsg('ai', renderProposal(res.j));
        } else {
          addChatMsg('ai', '✗ ' + (res.j.error || 'Noe gikk galt'));
          if (res.status === 401) offerPinRetry();
        }
      })
      .catch(function (err) {
        pending.remove();
        addChatMsg('ai', '✗ ' + err);
      })
      .finally(function () {
        chatSending = false;
        chatForm.querySelector('button[type="submit"]').disabled = false;
      });
  }

  // -------------------------------------------------------
  //  TOOLBAR EVENTS
  // -------------------------------------------------------
  bar.addEventListener('click', function (e) {
    var act = e.target.getAttribute('data-act');
    if (act === 'toggle')  setEditing(!editing);
    if (act === 'undo')    undo();
    if (act === 'chat')    toggleChat();
    if (act === 'logout')  { sessionStorage.removeItem('admin_pin'); location.href = location.pathname; }
    if (act === 'publish') publish();
  });

  // Snapshot the state BEFORE a text field is edited, so "Angre" can revert it.
  document.addEventListener('focusin', function (e) {
    if (!editing || !e.target || !e.target.isContentEditable) return;
    if (skipFocusSnap) { skipFocusSnap = false; return; } // just auto-focused a new row
    pushUndo();
  });
  // Cmd/Ctrl+Z outside a text field → step back through structural changes.
  // Inside a text field, let the browser's native text undo handle it.
  document.addEventListener('keydown', function (e) {
    if (!editing) return;
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      if (e.target && e.target.isContentEditable) return;
      e.preventDefault();
      undo();
    }
  });
  // Clicking any editable image opens a small floating menu: swap it, drag its
  // crop into place, and (inside rich content such as a gallery in a "Les mer")
  // delete it. The menu lives on <body>, never inside the editable region, so it
  // is never saved into the collected innerHTML.
  var imgMenu = document.createElement('div');
  imgMenu.className = 'adm-imgmenu';
  imgMenu.style.display = 'none';
  document.body.appendChild(imgMenu);
  var menuImg = null;
  function hideImgMenu() { imgMenu.style.display = 'none'; menuImg = null; }
  // Anchor a floating box just inside the top edge of an element, clamped to the page.
  // Inside a "Les mer" modal the target is position:fixed, so the box must be too.
  // An absolutely placed one would sit at the wrong spot once the page is scrolled.
  function placeFloating(box, el) {
    var r = el.getBoundingClientRect();
    var fixed = !!(el.closest && el.closest('.prod-modal, .dm'));
    var left = r.left + r.width / 2 - box.offsetWidth / 2;
    left = Math.max(8, Math.min(left, document.documentElement.clientWidth - box.offsetWidth - 8));
    box.style.position = fixed ? 'fixed' : 'absolute';
    box.style.left = (fixed ? left : window.scrollX + left) + 'px';
    box.style.top = (fixed ? r.top + 10 : window.scrollY + r.top + 10) + 'px';
  }
  function openImgMenu(img, opts) {
    endPosMode();
    menuImg = img;
    imgMenu.innerHTML =
      '<button type="button" data-ia="swap">↑ Bytt bilde</button>' +
      (canReposition(img) ? '<button type="button" data-ia="pos">✥ Flytt utsnitt</button>' : '') +
      (opts && opts.del ? '<button type="button" data-ia="del">🗑 Slett</button>' : '');
    imgMenu.style.display = 'flex';
    placeFloating(imgMenu, img);
  }
  imgMenu.addEventListener('mousedown', function (e) { e.preventDefault(); });
  imgMenu.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || !menuImg) return;
    var img = menuImg, act = b.getAttribute('data-ia');
    if (act === 'swap') { hideImgMenu(); pickImage(img); }
    else if (act === 'pos') { hideImgMenu(); startPosMode(img); }
    else { // delete
      pushUndo();
      var gal = img.closest('.galleri');
      var wrap = img.closest('.galleri__item');
      (wrap || img).remove(); // drop the caption along with its image
      if (gal) {
        decorateGalleries(true); // re-show "+ Bilde" if we dropped below the max
        if (!gal.querySelector('img') && !gal.querySelector('.adm-gallery-add')) gal.remove();
      }
      status.textContent = '✓ Bilde slettet. Husk å Publisere.';
      hideImgMenu();
    }
  });
  // The positioning bar is absolutely positioned in DOCUMENT coordinates, so it
  // rides along with its image while scrolling, so only the img menu needs hiding.
  window.addEventListener('scroll', hideImgMenu, true);
  document.addEventListener('click', function (e) {
    if (!editing) return;
    if (imgMenu.contains(e.target)) return;            // the menu handles its own clicks
    if (posBar && posBar.contains(e.target)) return;   // ditto the positioning bar
    if (posEl && posEl === e.target) return;           // a click on the image being dragged
    var img = e.target;
    // The photo at the top of an open "Les mer" modal. Repositioning is the only
    // thing that makes sense on it (swapping/deleting belong to the card), so skip
    // the menu and drop straight into drag mode.
    if (img && img.tagName === 'IMG' && img.closest('.prod-modal__media')) {
      e.preventDefault();
      e.stopPropagation();
      hideImgMenu();
      if (canReposition(img)) startPosMode(img);
      else status.textContent = 'Dette bildet er ikke beskåret – ingenting å flytte på';
      return;
    }
    if (img && img.tagName === 'IMG' &&
        !img.hasAttribute('data-edit-image') && !img.hasAttribute('data-list-image-field') &&
        img.closest('[contenteditable="true"], [data-list-detail], [data-edit]')) {
      e.preventDefault();
      e.stopPropagation();
      openImgMenu(img, { del: true });
    } else {
      hideImgMenu();
      endPosMode();
    }
  }, true);

  // -------------------------------------------------------
  //  PUBLISH
  // -------------------------------------------------------
  // Swap in a corrected PIN in place, so unsaved edits survive. Deliberately
  // does NOT re-send the save: every attempt spends one of the five the server
  // allows before a 15-minute lockout, so the retry should be a decision.
  function offerPinRetry() {
    var again = prompt('Feil PIN.\n\nSkriv inn riktig PIN for å prøve på nytt.\nEndringene dine beholdes.');
    if (!again) return;
    sessionStorage.setItem('admin_pin', again.trim());
    status.textContent = 'PIN oppdatert. Trykk Publiser igjen.';
  }

  function publish() {
    var edits = {};
    textFields.forEach(function (el) {
      var html = normalizeHtml(cleanFieldHtml(el).trim());
      // Normalize a browser-inserted "<br>" in an untouched field back to "",
      // so :empty keeps hiding optional fields (e.g. a blank photo credit).
      edits[el.getAttribute('data-edit')] = fieldIsEmpty(html) ? '' : html;
    });
    imageFields.forEach(function (el) {
      var url = currentImageUrl(el), key = el.getAttribute('data-edit-image'), pos = savedPos(el);
      if (url) edits[key] = url;
      if (pos) edits[key + '@pos'] = pos;
    });
    listContainers.forEach(function (c) {
      edits[c.getAttribute('data-editable-list')] = collectList(c);
    });

    status.textContent = 'Publiserer …';
    publishBtn.disabled = true;
    fetch('/api/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: pageKey,
        pin: currentPin(),
        edits: edits,
        bilder: ventendeBilder
      })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
      .then(function (res) {
        if (res.ok && res.j.ok) {
          ventendeBilder = [];
          showPublishModal(Math.round((res.j.rebuildMs || 50000) / 1000));
          return;
        }
        publishBtn.disabled = false;
        status.textContent = '✗ ' + (res.j.error || 'Feil');
        // For stor publisering: serveren sier hvor mye som er for mye, og en ny
        // PIN hjelper ikke. La feilteksten staa i stedet for aa spoerre om PIN.
        if (res.status === 413) {
          status.textContent = '✗ ' + res.j.error;
          return;
        }
        // Wrong PIN: let it be corrected right here. "Logg ut" reloads the page,
        // which would discard everything edited so far, so that must not be the
        // only way out. 429 (locked out) is deliberately excluded: re-asking
        // there just invites more attempts against a lock that has to time out.
        if (res.status === 401) offerPinRetry();
      })
      .catch(function (err) { publishBtn.disabled = false; status.textContent = '✗ ' + err; });
  }

  // -------------------------------------------------------
  //  PUBLISH MODAL
  // -------------------------------------------------------
  function showPublishModal(secs) {
    var overlay = document.createElement('div');
    overlay.className = 'adm-modal';
    overlay.innerHTML =
      '<div class="adm-modal__box">' +
        '<div class="adm-modal__icon">✓</div>' +
        '<div class="adm-modal__title">Lagret og publisert</div>' +
        '<div class="adm-modal__desc">Vercel bygger om siden nå.<br>Tar vanligvis 30–60 sekunder.</div>' +
        '<div class="adm-modal__timer">Laster inn på nytt om <strong class="adm-modal__count">' + secs + '</strong> sek …</div>' +
        '<div class="adm-modal__bar"><div class="adm-modal__fill"></div></div>' +
        '<div class="adm-modal__btns">' +
          '<button class="adm__btn adm__btn--primary adm-modal__now">Sjekk nå</button>' +
          '<button class="adm__btn adm__btn--ghost adm-modal__cancel">Avbryt</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var countEl = overlay.querySelector('.adm-modal__count');
    var fill    = overlay.querySelector('.adm-modal__fill');
    var remaining = secs;

    requestAnimationFrame(function () {
      fill.style.transition = 'width ' + secs + 's linear';
      fill.style.width = '100%';
    });

    var ticker = setInterval(function () {
      remaining--;
      countEl.textContent = remaining;
      if (remaining <= 0) { clearInterval(ticker); location.reload(); }
    }, 1000);

    overlay.querySelector('.adm-modal__now').addEventListener('click', function () {
      clearInterval(ticker); location.reload();
    });
    overlay.querySelector('.adm-modal__cancel').addEventListener('click', function () {
      clearInterval(ticker);
      overlay.remove();
      publishBtn.disabled = false;
      status.textContent = '✓ Publisert. Last inn siden manuelt for å se endringene.';
    });
  }
  } // end initEditor
})();
