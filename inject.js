(() => {
  'use strict';

  // Varsayilan: TAMAMEN PASIF. armed yalnizca sag tik -> "Dry run" secildiginde
  // ~1,5 saniyeligine acilir, sonra kendi kendine kapanir.
  let target = null, armed = false, got = 0, timer = 0, ctxLabel = '', ctxScope = '';

  document.addEventListener('contextmenu', (e) => { target = e.target; }, true);
  document.addEventListener('__dryrun_go', () => go());

  // Tiklamanin KENDI cagri yiginindan dogan istekler (senkron) her zaman sayilir.
  // Asenkron olanlar icin: yalnizca sayfanin kendi origin'ine gidenler. Ucuncu parti
  // telemetri (PostHog vb.) boylece ne ekrana cikar ne de engellenir.
  function dryRunClick(el) { el.click(); }

  function mine(url) {
    if (new Error().stack.includes('dryRunClick')) return true;
    try { return new URL(url, location.href).origin === location.origin; } catch { return false; }
  }

  function labelOf(el) {
    const a = el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'));
    const t = a || el.innerText || el.textContent || '';
    return t.trim().replace(/\s+/g, ' ').slice(0, 70);
  }

  function scopeOf(el) {
    // En YAKIN anlamli kapsayici: once tablo satiri / liste ogesi / kart,
    // sonra modal / form. Boylece listeden tiklanan butonda "hangi kayit"
    // sorusunu satirin kendisi cevaplar.
    const SEL = 'tr,[role="row"],li,[data-row],[role="dialog"],dialog,[aria-modal="true"],form,article,section';
    let n = el;
    while (n && n !== document.body) {
      if (n.matches && n.matches(SEL)) break;
      n = n.parentElement;
    }
    const box = (n && n !== document.body) ? n : document.body;
    const row = box.matches && box.matches('tr,[role="row"],li,[data-row]');
    const parts = (box.innerText || '')
      .split(row ? /[\t\n]+/ : /\n+/)
      .map((x) => x.trim())
      .filter(Boolean);
    return parts.slice(0, row ? 4 : 2).join(row ? ' · ' : ' — ').slice(0, 120);
  }

  function go() {
    if (!target) return note('Önce denemek istediğin öğeye sağ tıkla.');
    ctxLabel = labelOf(target); ctxScope = scopeOf(target);
    armed = true; got = 0;
    clearTimeout(timer);

    const noNav = (ev) => {
      const a = ev.target && ev.target.closest && ev.target.closest('a[href]');
      if (a) ev.preventDefault();
    };
    document.addEventListener('click', noNav, true);

    try { dryRunClick(target); } catch (e) { note('Öğe tıklanamadı: ' + e.message); }

    timer = setTimeout(() => {
      armed = false;
      document.removeEventListener('click', noNav, true);
      if (!got) note('İstek yakalanamadı. Öğe istek atmıyor olabilir, ya da handler geç (1 sn sonra) atıyordur.');
    }, 1000);
  }

  // ---------------- gövde ----------------
  const abs = (u) => { try { return new URL(u, location.href).href; } catch { return String(u); } };

  function text(b) {
    if (b == null || b === '') return '';
    if (typeof b === 'string') return b;
    if (b instanceof URLSearchParams) return b.toString();
    if (typeof FormData !== 'undefined' && b instanceof FormData) {
      const o = {};
      for (const [k, v] of b) o[k] = (typeof File !== 'undefined' && v instanceof File) ? `(dosya: ${v.name})` : v;
      return JSON.stringify(o, null, 2);
    }
    if (typeof Blob !== 'undefined' && b instanceof Blob) return `(blob, ${b.size} bayt)`;
    if (b instanceof ArrayBuffer || ArrayBuffer.isView(b)) return `(binary, ${b.byteLength} bayt)`;
    return String(b);
  }

  function pretty(t) {
    if (!t) return '(gövde yok — sorgu GET ise veri URL’de)';
    let bad = 0;
    for (let i = 0; i < Math.min(t.length, 200); i++) {
      const c = t.charCodeAt(i);
      if (c < 9 || (c > 13 && c < 32) || c === 65533) bad++;
    }
    if (bad > 5) return `(binary/sıkıştırılmış, ${t.length} bayt)`;
    try { return JSON.stringify(JSON.parse(t), null, 2); } catch { return t; }
  }

  // Istegi ATAN kodun yeri: yigindaki, bize ait olmayan ilk kare.
  function initiator() {
    const st = (new Error().stack || '').split('\n').slice(1);
    for (const line of st) {
      if (/chrome-extension:\/\//.test(line)) continue;
      if (/dryRunClick|inject\.js/.test(line)) continue;
      const m = line.match(/\(?((?:https?|blob|file):[^\s)]+):(\d+):(\d+)\)?/);
      if (!m) continue;
      let fn = line.trim().replace(/^at\s+/, '').split(' (')[0];
      if (/^(?:https?|blob|file):/.test(fn)) fn = '';
      return { fn: fn.slice(0, 50), at: m[1] + ':' + m[2] + ':' + m[3] };
    }
    return null;
  }
  const froms = (f) => !f ? '' : (f.fn ? f.fn + ' @ ' : '') + f.at;

  const q = (s) => String(s).replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'));
  const shq = (s) => String(s).replace(/'/g, "'\\''");
  const curl = (i) => [`curl -X ${i.method} '${i.url}'`]
    .concat(Object.entries(i.headers || {}).map(([k, v]) => `-H '${k}: ${shq(v)}'`))
    .concat(i.body ? [`--data-raw '${shq(i.body)}'`] : []).join(' \\\n  ');

  const md = (x) => String(x).replace(/\|/g, '\\|');

  function block(i) {
    const fs = fields(i), ri = resId(i.url), hs = Object.entries(i.headers || {});
    const L = [];
    L.push(`## Dry run — "${i.label || '(öğe)'}"`);
    L.push('');
    L.push(`- **Sayfa:** ${location.href}${document.title ? ' — ' + document.title : ''}`);
    if (i.scope) L.push(`- **Bağlam:** ${i.scope}`);
    L.push(`- **Zaman:** ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`);
    L.push('');
    L.push('### Gidecek istek — GÖNDERİLMEDİ');
    L.push('');
    L.push(`- **Nereye:** \`${i.method}\` ${ri || '—'}`);
    L.push(`- **Tam URL:** ${i.url}`);
    L.push(`- **Nereden:** ${froms(i.from) || 'belirlenemedi'}`);
    if (hs.length) L.push(`- **Header:** ${hs.map((h) => h[0] + ': ' + h[1]).join(' · ')}`);
    L.push('');
    if (fs) {
      L.push('| alan | değer |');
      L.push('|---|---|');
      fs.forEach((f) => L.push(`| ${md(f[0])} | ${md(f[1])} |`));
      L.push('');
    }
    if (i.body) { L.push('```json'); L.push(pretty(i.body)); L.push('```'); L.push(''); }
    L.push('```bash'); L.push(curl(i)); L.push('```');
    L.push('');
    L.push("> Oturum çerezi JS'e görünmediği için bu curl'de auth YOK — tek başına 401 döner.");
    L.push('>');
    L.push('> İstek gönderilmedi; uygulamaya ağ hatası döndürüldü.');
    return L.join('\n');
  }

  // ---------------- panel ----------------
  let root;
  function ui() {
    if (root) return root;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:0;z-index:2147483647';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      .s{position:fixed;top:12px;right:12px;width:430px;max-height:88vh;overflow:auto;
        display:flex;flex-direction:column;gap:8px}
      .c{background:#14161a;color:#e6e6e6;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.5);
        font:12px/1.5 ui-monospace,Menlo,monospace;overflow:hidden}
      .h{padding:9px 12px;background:#1d2026;display:flex;justify-content:space-between;
        align-items:center;font:600 12px/1.3 system-ui}
      .h b{color:#fbbf24}.x{cursor:pointer;color:#9aa3af;padding:0 4px}
      .p{padding:10px 12px}
      .u{color:#7dd3fc;word-break:break-all;margin:0 0 9px}
      h5{font:600 10px/1 system-ui;color:#9aa3af;letter-spacing:.6px;margin:10px 0 5px}
      pre{background:#0c0e11;padding:9px;border-radius:5px;margin:0;white-space:pre-wrap;
        word-break:break-word;max-height:34vh;overflow:auto}
      .k{background:#2b3038;color:#cbd5e1;border:0;border-radius:5px;padding:6px 10px;
        font:600 11px/1 system-ui;cursor:pointer;margin-top:10px}
      .n{padding:11px 12px;font:12px/1.5 system-ui;color:#cbd5e1}
      .t{font:600 14px/1.3 system-ui;color:#fff;margin-bottom:4px}
      .r{font:600 12px/1.4 ui-monospace,Menlo,monospace;color:#86efac;margin-bottom:3px}
      .g{font:11px/1.4 system-ui;color:#9aa3af;margin-bottom:4px}
      .f{font:11px/1.4 ui-monospace,Menlo,monospace;color:#c4b5fd;margin:6px 0 2px;word-break:break-all}
      .f span{color:#7c6ba8;margin-right:6px}
      .w{margin-top:9px;font:11px/1.4 system-ui;color:#a8845c}
      table{width:100%;border-collapse:collapse;margin:0}
      td{padding:4px 0;border-top:1px solid #22262e;vertical-align:top;font-size:12px}
      td:first-child{color:#9aa3af;width:44%;padding-right:10px}
      td:last-child{color:#e6e6e6;word-break:break-word}
      details{margin-top:10px}
      summary{cursor:pointer;color:#9aa3af;font:11px/1 system-ui}
      details pre{margin-top:6px}
    </style><div class="s"></div>`;
    (document.body || document.documentElement).appendChild(host);
    return root;
  }

  const all = [];

  function add(html, wire, info) {
    const el = document.createElement('div');
    el.className = 'c';
    el.innerHTML = html;
    el.querySelector('.x').onclick = () => {
      const ix = all.indexOf(info);
      if (ix > -1) all.splice(ix, 1);
      el.remove();
    };
    if (wire) wire(el);
    ui().querySelector('.s').prepend(el);
  }

  const note = (t) => add(`<div class="h"><span>Dry run</span><span class="x">✕</span></div>
    <div class="n">${q(t)}</div>`);

  // URL yolundan kaynak + kimlik cikar: /api/admin/orders/4821/refund
  // -> "orders #4821 → refund"
  function resId(u) {
    try {
      const segs = new URL(u, location.href).pathname.split('/').filter(Boolean);
      const out = [];
      segs.forEach((sg, i) => {
        if (/^\d{2,}$/.test(sg) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(sg) || /^[a-z]+_[A-Za-z0-9]{10,}$/.test(sg)) {
          out.push(`${segs[i - 1] || 'kayıt'} #${sg}`);
        }
      });
      const last = segs[segs.length - 1];
      if (out.length && last && !/^\d/.test(last) && !out[out.length - 1].endsWith('#' + last)) out.push('→ ' + last);
      return out.join(' ');
    } catch { return ''; }
  }

  // Govde ya da query'yi alan listesine cevir
  function fields(i) {
    try {
      const o = JSON.parse(i.body);
      if (o && typeof o === 'object' && !Array.isArray(o)) return Object.entries(o).map(kv => [kv[0], val(kv[1])]);
    } catch {}
    try {
      const sp = [...new URL(i.url, location.href).searchParams.entries()];
      if (sp.length) return sp.map(kv => [kv[0], val(kv[1])]);
    } catch {}
    return null;
  }
  const val = (v) => v === null || v === undefined ? '—'
    : v === '' ? '(boş)'
    : typeof v === 'object' ? JSON.stringify(v)
    : String(v);

  function card(i) {
    i.label = ctxLabel; i.scope = ctxScope;
    all.push(i);
    const fs = fields(i);
    const hs = Object.entries(i.headers || {});
    const ri = resId(i.url);
    add(`<div class="h"><span><b>${i.method}</b> · gitmedi</span><span class="x">✕</span></div>
      <div class="p">
        <div class="t">${q(ctxLabel || '(öğe)')}</div>
        ${ri ? `<div class="r">${q(ri)}</div>` : ''}
        ${ctxScope ? `<div class="g">${q(ctxScope)}</div>` : ''}
        ${i.from ? `<div class="f"><span>nereden</span>${q(froms(i.from))}</div>` : ''}
        ${fs ? `<h5>ALANLAR</h5><table>${fs.map(f =>
            `<tr><td>${q(f[0])}</td><td>${q(f[1])}</td></tr>`).join('')}</table>`
             : `<h5>GÖVDE</h5><pre>${q(pretty(i.body))}</pre>`}
        <div class="w">uygulamaya ağ hatası döndürüldü — buton hata gösterebilir, normal</div>
        <details><summary>ham istek</summary>
          <p class="u">${q(i.url)}</p>
          ${hs.length ? `<pre>${q(hs.map(h => h[0] + ': ' + h[1]).join('\n'))}</pre>` : ''}
          ${fs ? `<pre>${q(pretty(i.body))}</pre>` : ''}
        </details>
        <button class="k">kopyala</button></div>`,
      (el) => { el.querySelector('.k').onclick = (e) => {
        navigator.clipboard.writeText(all.map(block).join('\n\n---\n\n'));
        e.target.textContent = `kopyalandı (${all.length})`;
        setTimeout(() => { e.target.textContent = 'kopyala'; }, 1500);
      }; }, i);
  }

  // ---------------- yakalayıcılar ----------------
  const rf = window.fetch;
  window.fetch = function (input, init) {
    if (!armed || !mine(typeof input === 'string' ? input : (input && input.url))) return rf.apply(this, arguments);
    got++;
    const from = initiator();
    (async () => {
      try {
        const rq = new Request(input, init), h = {};
        rq.headers.forEach((v, k) => { h[k] = v; });
        card({ kind: 'fetch', method: rq.method, url: rq.url, headers: h, body: await rq.clone().text(), from });
      } catch {
        card({ kind: 'fetch', method: (init && init.method) || 'GET', url: abs(input), headers: {}, body: text(init && init.body), from });
      }
    })();
    // Ag hatasi olarak reddet. Sahte BASARI dondurmek uygulamayi "kaydedildi"
    // sanip yerel durumu guncellemeye iter; hic settle ETMEMEK ise butonu
    // sonsuza kadar "Kaydediliyor..."da birakir. Ikisi de yanlis; dogrusu bu.
    return Promise.reject(new TypeError('Failed to fetch — Dry Run: istek gönderilmedi'));
  };

  const P = XMLHttpRequest.prototype, xo = P.open, xs = P.send, xh = P.setRequestHeader;
  P.open = function (m, u, ...r) { this.__d = { method: m, url: abs(u), headers: {} }; return xo.call(this, m, u, ...r); };
  P.setRequestHeader = function (k, v) { if (this.__d) this.__d.headers[k] = v; return xh.call(this, k, v); };
  P.send = function (b) {
    if (!armed || !mine(this.__d && this.__d.url)) return xs.apply(this, arguments);
    got++;
    const self = this;
    setTimeout(() => {
      try {
        self.dispatchEvent(new ProgressEvent('error'));
        self.dispatchEvent(new ProgressEvent('loadend'));
      } catch (e) { /* yoksay */ }
    }, 0);
    card({ kind: 'xhr', ...(this.__d || { method: 'GET', url: location.href, headers: {} }), body: text(b), from: initiator() });
  };

  if (navigator.sendBeacon) {
    const sb = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (u, d) {
      if (!armed || !mine(u)) return sb(u, d);
      got++;
      card({ kind: 'beacon', method: 'POST', url: abs(u), headers: {}, body: text(d), from: initiator() });
      return true;
    };
  }

  document.addEventListener('submit', (e) => {
    if (!armed || !(e.target instanceof HTMLFormElement)) return;
    const f = e.target;
    e.preventDefault(); e.stopImmediatePropagation();
    got++;
    const o = {};
    for (const [k, v] of new FormData(f)) o[k] = (v instanceof File) ? `(dosya: ${v.name})` : v;
    card({ kind: 'form', method: (f.method || 'GET').toUpperCase(), url: abs(f.action || location.href), headers: {}, body: JSON.stringify(o, null, 2) });
  }, true);
})();
