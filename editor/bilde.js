/* ============================================================
   Bildebehandling i nettleseren for kontrollpanelet (editor/panel.js).
   Kopiert til dist/admin/ av bygget. Gir window.oaBilde.

   logo(fil, ferdig)  firmalogo i fast format: hvit bakgrunn som henger
                      sammen med kanten blir gjennomsiktig (hvit tekst inne i
                      logoen blir staaende), tom kant kuttes, og logoen
                      skaleres inn i 400 x 160. Alltid png, originalfargene beholdes.
   foto(fil, ferdig)  vanlig bilde: maks 1600 px, jpg (png hvis det er gjennomsiktig).

   renLogo() er ren og testet i test/bilde.test.mjs. ES5 med vilje.
   ============================================================ */
(function (rot) {
  'use strict';

  var HVIT = 235;   // alle tre kanalene over dette regnes som bakgrunn
  var SYNLIG = 12;  // alfa under dette regnes som tomt ved kutting
  var MAKS_B = 400, MAKS_H = 160;

  // px: RGBA-piksler (Uint8ClampedArray eller vanlig tabell), endres paa stedet.
  // Gir boksen rundt det synlige: { x, y, b, h }, eller null hvis bildet er tomt.
  function renLogo(px, b, h) {
    var i, n = b * h, harAlfa = false;
    for (i = 0; i < n; i++) if (px[i * 4 + 3] < 250) { harAlfa = true; break; }

    if (!harAlfa) {
      // Flomfyll fra kanten: bare hvitt som henger sammen med kanten blir borte.
      var sett = new Uint8Array(n), ko = [], hode = 0;
      var hvit = function (p) { var o = p * 4; return px[o] >= HVIT && px[o + 1] >= HVIT && px[o + 2] >= HVIT; };
      var legg = function (p) { if (!sett[p] && hvit(p)) { sett[p] = 1; ko.push(p); } };
      for (i = 0; i < b; i++) { legg(i); legg((h - 1) * b + i); }
      for (i = 0; i < h; i++) { legg(i * b); legg(i * b + b - 1); }
      while (hode < ko.length) {
        var p = ko[hode++], x = p % b, y = (p - x) / b;
        px[p * 4 + 3] = 0;
        if (x > 0) legg(p - 1);
        if (x < b - 1) legg(p + 1);
        if (y > 0) legg(p - b);
        if (y < h - 1) legg(p + b);
      }
    }

    var x0 = b, y0 = h, x1 = -1, y1 = -1;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < b; x++) {
        if (px[(y * b + x) * 4 + 3] >= SYNLIG) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x: x0, y: y0, b: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  // Hvor stort logoen skal tegnes: inn i 400 x 160, aldri forstoerret.
  function maal(b, h) {
    var s = Math.min(1, MAKS_B / b, MAKS_H / h);
    return { b: Math.max(1, Math.round(b * s)), h: Math.max(1, Math.round(h * s)) };
  }

  function lastBilde(fil, ok, feil) {
    var url = URL.createObjectURL(fil), img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); ok(img); };
    img.onerror = function () { URL.revokeObjectURL(url); feil('Bildet lot seg ikke åpne. Prøv en png, jpg eller svg.'); };
    img.src = url;
  }

  function logo(fil, ferdig) {
    lastBilde(fil, function (img) {
      // Tegnes stort nok til at kuttingen blir skarp, men ikke enormt.
      var s = Math.min(1, 1600 / Math.max(img.naturalWidth || 400, img.naturalHeight || 160));
      var b = Math.max(1, Math.round((img.naturalWidth || 400) * s)), h = Math.max(1, Math.round((img.naturalHeight || 160) * s));
      var c = document.createElement('canvas'); c.width = b; c.height = h;
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, b, h);
      var data = ctx.getImageData(0, 0, b, h);
      var boks = renLogo(data.data, b, h);
      if (!boks) return ferdig(null, 'Bildet ser tomt ut. Velg en annen fil.');
      ctx.putImageData(data, 0, 0);
      var m = maal(boks.b, boks.h);
      var ut = document.createElement('canvas'); ut.width = m.b; ut.height = m.h;
      ut.getContext('2d').drawImage(c, boks.x, boks.y, boks.b, boks.h, 0, 0, m.b, m.h);
      ferdig(ut.toDataURL('image/png'), null, 'png');
    }, function (melding) { ferdig(null, melding); });
  }

  function foto(fil, ferdig) {
    lastBilde(fil, function (img) {
      var s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      var b = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
      var c = document.createElement('canvas'); c.width = b; c.height = h;
      var ctx = c.getContext('2d');
      var png = /png$/i.test(fil.type);
      if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, b, h); }
      ctx.drawImage(img, 0, 0, b, h);
      ferdig(c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.84), null, png ? 'png' : 'jpg');
    }, function (melding) { ferdig(null, melding); });
  }

  rot.oaBilde = { renLogo: renLogo, maal: maal, logo: logo, foto: foto };
})(typeof window !== 'undefined' ? window : this);
