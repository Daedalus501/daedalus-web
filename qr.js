/*! qr.js · QR-koder for Daedalus kommandosenter (gjesteerklæringen)
 *
 * Lager QR-koder lokalt i nettleseren, uten eksterne kall. Skrevet 2026-11-16 etter standarden
 * ISO/IEC 18004 (QR Code): byte-modus (UTF-8), versjon 1 til 40, feilretting L, M, Q og H,
 * maske valgt med straffepoengene i standarden. Tabellverdiene er fakta fra standarden.
 * Bygger på «QR Code generator library» av Project Nayuki (MIT-lisens),
 * https://www.nayuki.io/page/qr-code-generator-library : antall datamoduler, justeringsmønstre,
 * Reed-Solomon, blokkfletting, straffepoeng og tegning av format- og versjonsbitene følger det
 * biblioteket.
 * Kontrollert bit for bit mot Kazuhiko Arases «QR Code for JavaScript» og lest tilbake med
 * OpenCV og ZBar (rigg/qr_kryss.mjs og rigg/t_erklaering.mjs).
 *
 * Bruk:  DaeQR.encode(tekst, 'Q')            -> { version, size, ecl, mask, modules: [[true|false]] }
 *        DaeQR.svg(tekst, { ecl: 'Q', margin: 4 }) -> '<svg ...>' (svart på hvitt, crispEdges)
 *
 * MIT License
 *
 * Copyright (c) Project Nayuki. (MIT License)
 * Copyright (c) 2026 Høi Z (tilpasning)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
 * BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * «QR Code» er et registrert varemerke for DENSO WAVE INCORPORATED.
 */
(function (root) {
  'use strict';
  var LEVELS = { L: 0, M: 1, Q: 2, H: 3 };
  var FORMAT_ECL = [1, 0, 3, 2];   /* formatbitene for L, M, Q, H */
  /* Feilrettingskodeord per blokk og antall blokker, per nivå (L, M, Q, H) og versjon (indeks 1 til 40). */
  var ECC_PER_BLOCK = [
    [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
  ];
  var BLOCKS = [
    [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
  ];

  function rawModules(ver) {   /* moduler som bærer data og feilretting */
    var n = (16 * ver + 128) * ver + 64;
    if (ver >= 2) { var a = Math.floor(ver / 7) + 2; n -= (25 * a - 10) * a - 55; if (ver >= 7) n -= 36; }
    return n;
  }
  function dataCodewords(ver, e) { return Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[e][ver] * BLOCKS[e][ver]; }
  function alignPositions(ver) {
    if (ver === 1) return [];
    var a = Math.floor(ver / 7) + 2, step = (ver === 32) ? 26 : Math.ceil((ver * 4 + 4) / (a * 2 - 2)) * 2, out = [6];
    for (var pos = ver * 4 + 10; out.length < a; pos -= step) out.splice(1, 0, pos);
    return out;
  }
  function utf8(s) {
    var b = [], u = unescape(encodeURIComponent(String(s)));
    for (var i = 0; i < u.length; i++) b.push(u.charCodeAt(i));
    return b;
  }
  /* Reed-Solomon over GF(256), polynomet 0x11D */
  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) { z = ((z << 1) ^ ((z >>> 7) * 0x11D)) & 0xFF; z ^= ((y >>> i) & 1) * x; }
    return z;
  }
  function rsDivisor(deg) {
    var r = [], root = 1, i, j;
    for (i = 0; i < deg - 1; i++) r.push(0);
    r.push(1);
    for (i = 0; i < deg; i++) {
      for (j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      root = gfMul(root, 2);
    }
    return r;
  }
  function rsRemainder(data, div) {
    var r = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ r.shift(); r.push(0);
      for (var i = 0; i < div.length; i++) r[i] ^= gfMul(div[i], f);
    });
    return r;
  }
  function maskBit(m, x, y) {
    switch (m) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return x * y % 2 + x * y % 3 === 0;
      case 6: return (x * y % 2 + x * y % 3) % 2 === 0;
      default: return ((x + y) % 2 + x * y % 3) % 2 === 0;
    }
  }

  /* forceMask (0 til 7) brukes bare av testene; ellers velges masken med lavest straffepoeng. */
  function encode(text, ecl, forceMask) {
    var e = LEVELS[String(ecl || 'M').toUpperCase()];
    if (e == null) throw new Error('qr: ukjent feilrettingsnivå');
    var bytes = utf8(text), ver, cap, i, j;
    for (ver = 1; ver <= 40; ver++) {
      cap = dataCodewords(ver, e) * 8;
      if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= cap) break;
    }
    if (ver > 40) throw new Error('qr: teksten er for lang');
    /* bitstrøm: modus 0100 (byte), lengde, data, avslutning, utfylling 0xEC 0x11 */
    var bits = [];
    var put = function (val, len) { for (var k = len - 1; k >= 0; k--) bits.push((val >>> k) & 1); };
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = [];
    for (i = 0; i < bits.length; i += 8) { var v = 0; for (j = 0; j < 8; j++) v = (v << 1) | bits[i + j]; data.push(v); }
    /* feilretting per blokk, så fletting */
    var nb = BLOCKS[e][ver], eccLen = ECC_PER_BLOCK[e][ver], raw = Math.floor(rawModules(ver) / 8);
    var nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDivisor(eccLen), blocks = [], k = 0;
    for (i = 0; i < nb; i++) {
      var dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1));
      k += dat.length;
      var ec = rsRemainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ec));
    }
    var cw = [];
    for (i = 0; i < blocks[0].length; i++) {
      for (j = 0; j < blocks.length; j++) { if (i !== shortLen - eccLen || j >= nShort) cw.push(blocks[j][i]); }
    }
    /* matrisen: tidsmønster, finnere, justeringsmønstre, format og versjon */
    var size = ver * 4 + 17, mod = [], fn = [];
    for (i = 0; i < size; i++) { mod.push([]); fn.push([]); for (j = 0; j < size; j++) { mod[i].push(false); fn[i].push(false); } }
    var set = function (x, y, dark) { mod[y][x] = dark; fn[y][x] = true; };
    for (i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), x = c[0] + dx, y = c[1] + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    });
    var ap = alignPositions(ver), na = ap.length;
    for (i = 0; i < na; i++) for (j = 0; j < na; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++) set(ap[i] + ax, ap[j] + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1);
    }
    var drawFormat = function (mask) {
      var d = FORMAT_ECL[e] << 3 | mask, r = d, q;
      for (q = 0; q < 10; q++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      var b = ((d << 10) | r) ^ 0x5412, bit = function (n) { return ((b >>> n) & 1) !== 0; };
      for (q = 0; q <= 5; q++) set(8, q, bit(q));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (q = 9; q < 15; q++) set(14 - q, 8, bit(q));
      for (q = 0; q < 8; q++) set(size - 1 - q, 8, bit(q));
      for (q = 8; q < 15; q++) set(8, size - 15 + q, bit(q));
      set(8, size - 8, true);
    };
    drawFormat(0);
    if (ver >= 7) {
      var r7 = ver, q7;
      for (q7 = 0; q7 < 12; q7++) r7 = (r7 << 1) ^ ((r7 >>> 11) * 0x1F25);
      var vb = (ver << 12) | r7;
      for (q7 = 0; q7 < 18; q7++) { var dk = ((vb >>> q7) & 1) !== 0, va = size - 11 + q7 % 3, vc = Math.floor(q7 / 3); set(va, vc, dk); set(vc, va, dk); }
    }
    /* data i sikksakk, to kolonner om gangen, fra nederste høyre hjørne */
    var bi = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (j = 0; j < 2; j++) {
          var x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
          if (!fn[y][x] && bi < cw.length * 8) { mod[y][x] = ((cw[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++; }
        }
      }
    }
    var applyMask = function (m) {
      for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) { if (!fn[yy][xx] && maskBit(m, xx, yy)) mod[yy][xx] = !mod[yy][xx]; }
    };
    /* straffepoeng N1 til N4 */
    var finder = function (h) {
      var n = h[1], core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
      return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0);
    };
    var addRun = function (len, h) { if (h[0] === 0) len += size; h.pop(); h.unshift(len); };
    var line = function (get) {
      var col = false, len = 0, h = [0, 0, 0, 0, 0, 0, 0], s = 0;
      for (var p = 0; p < size; p++) {
        if (get(p) === col) { len++; if (len === 5) s += 3; else if (len > 5) s++; }
        else { addRun(len, h); if (!col) s += finder(h) * 40; col = get(p); len = 1; }
      }
      if (col) { addRun(len, h); len = 0; }
      addRun(len + size, h);
      return s + finder(h) * 40;
    };
    var penalty = function () {
      var s = 0, x2, y2, c, dark = 0, total = size * size;
      for (y2 = 0; y2 < size; y2++) s += line(function (p) { return mod[y2][p]; });
      for (x2 = 0; x2 < size; x2++) s += line(function (p) { return mod[p][x2]; });
      for (y2 = 0; y2 < size - 1; y2++) for (x2 = 0; x2 < size - 1; x2++) {
        c = mod[y2][x2];
        if (c === mod[y2][x2 + 1] && c === mod[y2 + 1][x2] && c === mod[y2 + 1][x2 + 1]) s += 3;
      }
      for (y2 = 0; y2 < size; y2++) for (x2 = 0; x2 < size; x2++) if (mod[y2][x2]) dark++;
      return s + Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    };
    var best = (typeof forceMask === 'number' && forceMask >= 0 && forceMask <= 7 && forceMask === Math.floor(forceMask)) ? forceMask : -1, bestP = Infinity;
    if (best < 0) {
      for (var mk = 0; mk < 8; mk++) {
        applyMask(mk); drawFormat(mk);
        var pp = penalty();
        if (pp < bestP) { bestP = pp; best = mk; }
        applyMask(mk);
      }
    }
    applyMask(best); drawFormat(best);
    return { version: ver, size: size, ecl: ['L', 'M', 'Q', 'H'][e], mask: best, modules: mod };
  }

  function svg(text, opts) {
    opts = opts || {};
    var q = encode(text, opts.ecl || 'M'), m = (opts.margin == null) ? 4 : opts.margin, n = q.size + m * 2, d = '';
    for (var y = 0; y < q.size; y++) {
      for (var x = 0; x < q.size; x++) {
        if (!q.modules[y][x]) continue;
        var run = 1;
        while (x + run < q.size && q.modules[y][x + run]) run++;
        d += 'M' + (x + m) + ' ' + (y + m) + 'h' + run + 'v1h-' + run + 'z';
        x += run - 1;
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges">'
      + '<rect width="' + n + '" height="' + n + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }

  root.DaeQR = { encode: encode, svg: svg };
})(typeof window !== 'undefined' ? window : this);
