/*! masul-widget.js — drop-in ordering / booking / appointments / reviews for
 *  Masul Digital sites. Self-contained: injects its own UI + styles and posts to
 *  the shared backend. Works on any site regardless of how it was built.
 *
 *  Per-site setup (place before </body>):
 *    <script>
 *      window.MASUL_SITE_ID = "plumstead-a";
 *      window.MASUL_ACCENT  = "#2f6b4f";            // optional brand colour
 *      window.MASUL_MENU    = [ {cat:"Mains", name:"Suqaar", price:8.5}, ... ]; // restaurants
 *      window.MASUL_SERVICES= [ {name:"Ladies cut", price:25}, ... ];           // salons
 *    </script>
 *    <script src="masul-widget.js" defer></script>
 *
 *  It also wires:
 *    - any element with [data-masul-open="order|booking|appointment|review"] to open that tab
 *    - any container with [data-masul-reviews] to show approved reviews
 *    - window.MasulForms.submit(type, data) for custom integrations
 */
(function () {
  "use strict";
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var API = window.MASUL_API_BASE || (LOCAL ? "http://localhost:3000" : "https://masul-forms-backend.vercel.app");
  var SITE = window.MASUL_SITE_ID || "";
  var ACCENT = window.MASUL_ACCENT || "#b8472a";
  var MENU = Array.isArray(window.MASUL_MENU) ? window.MASUL_MENU : [];
  var SERVICES = Array.isArray(window.MASUL_SERVICES) ? window.MASUL_SERVICES : [];
  var LABELS = {
    order: "Order online",
    booking: "Book a table",
    appointment: "Book appointment",
    review: "Leave a review",
  };
  if (!SITE) { console.warn("[masul] window.MASUL_SITE_ID is not set — widget disabled"); return; }

  var state = { features: window.MASUL_FEATURES || null, name: "", open: false, tab: null, cart: {} };

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function el(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  function today() { return new Date().toISOString().slice(0, 10); }
  function money(n) { return "£" + (Number(n) || 0).toFixed(2); }

  async function submit(type, data) {
    var body = Object.assign({ siteId: SITE, type: type }, data);
    var res, j = {};
    try {
      res = await fetch(API + "/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      j = await res.json();
    } catch (e) { return { ok: false, errors: ["Network error — please try again."] }; }
    return Object.assign({ ok: res.ok && j.ok }, j);
  }

  function loadReviews(mount, summaryEl) {
    fetch(API + "/api/reviews?siteId=" + encodeURIComponent(SITE))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) return;
        if (summaryEl && d.summary.count) summaryEl.textContent = d.summary.avg + " ★ · " + d.summary.count + " reviews";
        if (mount && d.reviews.length) {
          mount.innerHTML = d.reviews.map(function (r) {
            return '<blockquote class="masul-review"><div class="masul-stars">' + "★".repeat(r.rating) + "☆".repeat(5 - r.rating) + "</div>" +
              (r.title ? '<p class="masul-review-title">' + esc(r.title) + "</p>" : "") +
              '<p class="masul-review-body">' + esc(r.body) + "</p><cite>— " + esc(r.name) + "</cite></blockquote>";
          }).join("");
        }
      }).catch(function () {});
  }

  /* ---------- styles ---------- */
  function injectCSS() {
    if (document.getElementById("mzf-css")) return;
    var css = `
.mzf-launch{position:fixed;right:18px;bottom:18px;z-index:2147483000;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;max-width:80vw}
.mzf-launch button{font:600 15px/1 system-ui,Segoe UI,Arial,sans-serif;color:#fff;background:var(--mzf-accent);border:0;border-radius:999px;padding:13px 20px;box-shadow:0 8px 24px rgba(0,0,0,.25);cursor:pointer;transition:transform .12s ease,filter .12s}
.mzf-launch button:hover{transform:translateY(-1px);filter:brightness(1.05)}
.mzf-launch button.mzf-ghost{background:#fff;color:#222;border:1px solid rgba(0,0,0,.12)}
.mzf-overlay{position:fixed;inset:0;z-index:2147483600;background:rgba(15,17,21,.55);backdrop-filter:blur(3px);display:flex;align-items:flex-end;justify-content:center;opacity:0;pointer-events:none;transition:opacity .2s}
.mzf-overlay.mzf-on{opacity:1;pointer-events:auto}
.mzf-modal{font:15px/1.5 system-ui,Segoe UI,Arial,sans-serif;color:#1c1c1c;background:#fff;width:min(520px,100%);max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;box-shadow:0 -10px 50px rgba(0,0,0,.3);transform:translateY(20px);transition:transform .22s}
@media(min-width:560px){.mzf-overlay{align-items:center}.mzf-modal{border-radius:18px}}
.mzf-on .mzf-modal{transform:none}
.mzf-head{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid #eee;position:sticky;top:0;background:#fff;z-index:2}
.mzf-head h3{margin:0;font-size:17px;font-weight:800;flex:1}
.mzf-x{border:0;background:#f1f1f1;width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer;line-height:1}
.mzf-tabs{display:flex;gap:6px;padding:12px 14px 0;flex-wrap:wrap}
.mzf-tabs button{border:0;background:#f3f3f3;color:#444;border-radius:999px;padding:8px 14px;font:600 13px/1 inherit;cursor:pointer}
.mzf-tabs button.mzf-active{background:var(--mzf-accent);color:#fff}
.mzf-body{padding:14px 18px 22px}
.mzf-field{margin:0 0 12px}
.mzf-field label{display:block;font-size:12px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;color:#666;margin:0 0 5px}
.mzf-field input,.mzf-field select,.mzf-field textarea{width:100%;box-sizing:border-box;font:15px/1.4 inherit;color:#1c1c1c;background:#fafafa;border:1px solid #ddd;border-radius:10px;padding:11px 12px}
.mzf-field input:focus,.mzf-field select:focus,.mzf-field textarea:focus{outline:0;border-color:var(--mzf-accent);background:#fff}
.mzf-row{display:flex;gap:10px}.mzf-row>*{flex:1}
.mzf-chips{display:flex;gap:8px;flex-wrap:wrap}
.mzf-chips button{border:1px solid #ddd;background:#fafafa;border-radius:10px;padding:9px 14px;cursor:pointer;font:600 14px/1 inherit}
.mzf-chips button.mzf-on{background:var(--mzf-accent);color:#fff;border-color:var(--mzf-accent)}
.mzf-stars{display:flex;gap:4px;font-size:30px;color:#ddd;cursor:pointer}
.mzf-stars span.mzf-lit{color:#e0a528}
.mzf-menu{border:1px solid #eee;border-radius:12px;overflow:hidden;margin-bottom:12px}
.mzf-cat{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:#888;background:#f7f7f7;padding:8px 12px}
.mzf-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-top:1px solid #f0f0f0}
.mzf-item .mzf-nm{flex:1}.mzf-item .mzf-pr{color:#666;font-variant-numeric:tabular-nums}
.mzf-step{display:flex;align-items:center;gap:8px}
.mzf-step button{width:28px;height:28px;border-radius:50%;border:1px solid #ddd;background:#fff;font-size:16px;cursor:pointer;line-height:1}
.mzf-step span{min-width:18px;text-align:center;font-weight:700}
.mzf-total{display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:17px;margin:6px 2px 14px}
.mzf-btn{width:100%;border:0;background:var(--mzf-accent);color:#fff;border-radius:12px;padding:14px;font:800 16px/1 inherit;cursor:pointer}
.mzf-btn[disabled]{opacity:.6;cursor:default}
.mzf-status{margin-top:12px;font-size:14px;min-height:1em;text-align:center}
.mzf-status[data-k="err"]{color:#c0392b;font-weight:600}.mzf-status[data-k="ok"]{color:#1f8a4c;font-weight:600}.mzf-status[data-k="pending"]{color:#888}
.mzf-done{text-align:center;padding:26px 10px}
.mzf-done .mzf-tick{width:54px;height:54px;border-radius:50%;background:var(--mzf-accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 12px}
.mzf-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}
.masul-review{margin:0 0 14px;padding:16px 18px;border-radius:12px;background:rgba(0,0,0,.04)}
.masul-stars{letter-spacing:2px;color:#e0a528}.masul-review-title{font-weight:700;margin:6px 0 4px}
.masul-review-body{margin:4px 0 10px}.masul-review cite{font-style:normal;opacity:.7}
`;
    var s = document.createElement("style");
    s.id = "mzf-css";
    s.textContent = ":root{--mzf-accent:" + ACCENT + "}" + css;
    document.head.appendChild(s);
  }

  /* ---------- form builders ---------- */
  function field(label, inner) { return '<div class="mzf-field"><label>' + label + "</label>" + inner + "</div>"; }
  function contactFields() {
    // Wrapped in a single element so el() (which keeps only the first child) keeps both.
    return '<div class="mzf-contact">' +
      field("Your name", '<input name="name" required autocomplete="name">') +
      field("Phone", '<input name="phone" type="tel" inputmode="tel" required autocomplete="tel" placeholder="07…">') +
      "</div>";
  }
  function timeInput() { return '<input name="time" type="time" required>'; }
  function dateInput() { return '<input name="date" type="date" min="' + today() + '" required>'; }
  function hp() { return '<input class="mzf-hp" tabindex="-1" autocomplete="off" name="hp" aria-hidden="true">'; }

  function buildOrder() {
    var f = el('<form class="mzf-form" novalidate></form>');
    var hasMenu = MENU.length > 0;
    state.cart = {};
    if (hasMenu) {
      var cats = {};
      MENU.forEach(function (it, i) { var c = it.cat || "Menu"; (cats[c] = cats[c] || []).push(Object.assign({ _i: i }, it)); });
      var html = '<div class="mzf-menu">';
      Object.keys(cats).forEach(function (c) {
        html += '<div class="mzf-cat">' + esc(c) + "</div>";
        cats[c].forEach(function (it) {
          html += '<div class="mzf-item" data-i="' + it._i + '"><span class="mzf-nm">' + esc(it.name) + '</span>' +
            (it.price ? '<span class="mzf-pr">' + money(it.price) + "</span>" : "") +
            '<span class="mzf-step"><button type="button" class="mzf-dec">−</button><span class="mzf-q">0</span><button type="button" class="mzf-inc">+</button></span></div>';
        });
      });
      html += "</div>";
      f.appendChild(el(html));
      f.appendChild(el('<div class="mzf-total"><span>Total (pay on collection)</span><span class="mzf-sum">£0.00</span></div>'));
    } else {
      f.appendChild(el(field("What would you like to order?", '<textarea name="ordertext" rows="3" placeholder="e.g. 2× chicken shawarma, 1× falafel wrap"></textarea>')));
    }
    f.appendChild(el(
      '<div class="mzf-field"><label>Collection or delivery</label><div class="mzf-chips" data-ful>' +
      '<button type="button" data-v="collection" class="mzf-on">Collection</button>' +
      '<button type="button" data-v="delivery">Delivery</button></div></div>'
    ));
    f.appendChild(el('<div class="mzf-addr" hidden>' + field("Delivery address", '<input name="address" autocomplete="street-address">') + "</div>"));
    f.appendChild(el('<div class="mzf-row">' + field("Collect/deliver at", timeInput()) + field("Today or later", dateInput()) + "</div>"));
    f.appendChild(el(contactFields()));
    f.appendChild(el(field("Notes (optional)", '<textarea name="notes" rows="2" placeholder="Allergies, spice level…"></textarea>')));
    f.appendChild(el(hp()));
    f.appendChild(el('<button class="mzf-btn" type="submit">Place order</button>'));
    f.appendChild(el('<div class="mzf-status" role="status"></div>'));

    var ful = "collection";
    f.querySelector("[data-ful]").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      f.querySelectorAll("[data-ful] button").forEach(function (x) { x.classList.remove("mzf-on"); });
      b.classList.add("mzf-on"); ful = b.getAttribute("data-v");
      f.querySelector(".mzf-addr").hidden = ful !== "delivery";
    });
    if (hasMenu) {
      function recalc() {
        var sum = 0; Object.keys(state.cart).forEach(function (i) { sum += (MENU[i].price || 0) * state.cart[i]; });
        f.querySelector(".mzf-sum").textContent = money(sum);
      }
      f.querySelectorAll(".mzf-item").forEach(function (row) {
        var i = row.getAttribute("data-i"); var q = row.querySelector(".mzf-q");
        row.querySelector(".mzf-inc").addEventListener("click", function () { state.cart[i] = (state.cart[i] || 0) + 1; q.textContent = state.cart[i]; recalc(); });
        row.querySelector(".mzf-dec").addEventListener("click", function () { state.cart[i] = Math.max(0, (state.cart[i] || 0) - 1); q.textContent = state.cart[i]; if (!state.cart[i]) delete state.cart[i]; recalc(); });
      });
    }

    bindSubmit(f, "order", function () {
      var items = [];
      if (hasMenu) { Object.keys(state.cart).forEach(function (i) { items.push({ name: MENU[i].name, qty: state.cart[i], price: MENU[i].price || 0 }); }); }
      else { var t = (f.querySelector('[name=ordertext]').value || "").trim(); if (t) items.push({ name: t, qty: 1, price: 0 }); }
      return { items: items, fulfillment: ful, address: val(f, "address"), time: val(f, "time"), date: val(f, "date"), name: val(f, "name"), phone: val(f, "phone"), notes: val(f, "notes") };
    });
    return f;
  }

  function buildBooking() {
    var f = el('<form class="mzf-form" novalidate></form>');
    var sizes = [1, 2, 3, 4, 5, 6, 8, 10];
    var chips = '<div class="mzf-field"><label>Party size</label><div class="mzf-chips" data-party>' +
      sizes.map(function (n, i) { return '<button type="button" data-v="' + n + '"' + (i === 1 ? ' class="mzf-on"' : "") + ">" + n + (n === 10 ? "+" : "") + "</button>"; }).join("") + "</div></div>";
    f.appendChild(el(chips));
    f.appendChild(el('<div class="mzf-row">' + field("Date", dateInput()) + field("Time", timeInput()) + "</div>"));
    f.appendChild(el(contactFields()));
    f.appendChild(el(field("Notes (optional)", '<textarea name="notes" rows="2" placeholder="High chair, allergies, celebration…"></textarea>')));
    f.appendChild(el(hp()));
    f.appendChild(el('<button class="mzf-btn" type="submit">Request table</button>'));
    f.appendChild(el('<div class="mzf-status" role="status"></div>'));
    var party = 2;
    f.querySelector("[data-party]").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; f.querySelectorAll("[data-party] button").forEach(function (x) { x.classList.remove("mzf-on"); }); b.classList.add("mzf-on"); party = b.getAttribute("data-v"); });
    bindSubmit(f, "booking", function () { return { party: party, date: val(f, "date"), time: val(f, "time"), name: val(f, "name"), phone: val(f, "phone"), notes: val(f, "notes") }; });
    return f;
  }

  function buildAppointment() {
    var f = el('<form class="mzf-form" novalidate></form>');
    var opts = SERVICES.length
      ? SERVICES.map(function (s) { var nm = typeof s === "string" ? s : s.name; var pr = typeof s === "object" && s.price ? " — " + money(s.price) : ""; return '<option value="' + esc(nm) + '">' + esc(nm) + esc(pr) + "</option>"; }).join("")
      : '<option value="Appointment">Appointment</option>';
    f.appendChild(el(field("Service", '<select name="service">' + opts + "</select>")));
    f.appendChild(el(field("Stylist (optional)", '<input name="stylist" placeholder="No preference">')));
    f.appendChild(el('<div class="mzf-row">' + field("Date", dateInput()) + field("Time", timeInput()) + "</div>"));
    f.appendChild(el(contactFields()));
    f.appendChild(el(field("Notes (optional)", '<textarea name="notes" rows="2"></textarea>')));
    f.appendChild(el(hp()));
    f.appendChild(el('<button class="mzf-btn" type="submit">Request appointment</button>'));
    f.appendChild(el('<div class="mzf-status" role="status"></div>'));
    bindSubmit(f, "appointment", function () { return { service: val(f, "service"), stylist: val(f, "stylist"), date: val(f, "date"), time: val(f, "time"), name: val(f, "name"), phone: val(f, "phone"), notes: val(f, "notes") }; });
    return f;
  }

  function buildReview() {
    var f = el('<form class="mzf-form" novalidate></form>');
    f.appendChild(el('<div class="mzf-field"><label>Your rating</label><div class="mzf-stars" data-stars>' +
      [1, 2, 3, 4, 5].map(function (n) { return '<span data-v="' + n + '">★</span>'; }).join("") + "</div></div>"));
    f.appendChild(el(field("Title (optional)", '<input name="title" maxlength="120" placeholder="Lovely food, warm welcome">')));
    f.appendChild(el(field("Your review", '<textarea name="body" rows="3" required placeholder="Tell others about your visit…"></textarea>')));
    f.appendChild(el(field("Your name", '<input name="name" required autocomplete="name">')));
    f.appendChild(el(hp()));
    f.appendChild(el('<button class="mzf-btn" type="submit">Submit review</button>'));
    f.appendChild(el('<div class="mzf-status" role="status"></div>'));
    var rating = 0; var stars = f.querySelectorAll("[data-stars] span");
    f.querySelector("[data-stars]").addEventListener("click", function (e) {
      var sp = e.target.closest("span"); if (!sp) return; rating = +sp.getAttribute("data-v");
      stars.forEach(function (s) { s.classList.toggle("mzf-lit", +s.getAttribute("data-v") <= rating); });
    });
    bindSubmit(f, "review", function () { return { rating: rating, title: val(f, "title"), body: val(f, "body"), name: val(f, "name") }; });
    return f;
  }

  function val(f, n) { var e = f.querySelector("[name=" + n + "]"); return e ? e.value : ""; }

  function bindSubmit(form, type, collect) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var btn = form.querySelector(".mzf-btn"); var st = form.querySelector(".mzf-status");
      if (form.querySelector("[name=hp]").value) { showDone(form, type); return; }
      st.textContent = "Sending…"; st.setAttribute("data-k", "pending"); btn.disabled = true;
      var r = await submit(type, collect());
      btn.disabled = false;
      if (r.ok) { showDone(form, type, r.message); }
      else { st.textContent = (r.errors && r.errors.join(". ")) || r.error || "Something went wrong."; st.setAttribute("data-k", "err"); }
    });
  }

  function showDone(form, type, msg) {
    var done = el('<div class="mzf-done"><div class="mzf-tick">✓</div><h3 style="margin:0 0 6px">' +
      (type === "review" ? "Thank you!" : "Request received") + "</h3><p style=\"margin:0;color:#555\">" +
      esc(msg || (type === "review" ? "Your review will appear once approved." : "We'll confirm with you shortly.")) +
      "</p></div>");
    form.replaceWith(done);
  }

  /* ---------- modal shell ---------- */
  var overlay, modalBody, tabsEl;
  function ensureModal() {
    if (overlay) return;
    overlay = el('<div class="mzf-overlay" role="dialog" aria-modal="true"><div class="mzf-modal">' +
      '<div class="mzf-head"><h3>' + esc(state.name || "Get in touch") + '</h3><button class="mzf-x" aria-label="Close">×</button></div>' +
      '<div class="mzf-tabs"></div><div class="mzf-body"></div></div></div>');
    document.body.appendChild(overlay);
    tabsEl = overlay.querySelector(".mzf-tabs");
    modalBody = overlay.querySelector(".mzf-body");
    overlay.querySelector(".mzf-x").addEventListener("click", close);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && state.open) close(); });
    renderTabs();
  }
  var BUILDERS = { order: buildOrder, booking: buildBooking, appointment: buildAppointment, review: buildReview };
  function renderTabs() {
    tabsEl.innerHTML = "";
    state.features.forEach(function (ft) {
      var b = el('<button data-tab="' + ft + '">' + LABELS[ft] + "</button>");
      b.addEventListener("click", function () { selectTab(ft); });
      tabsEl.appendChild(b);
    });
  }
  function selectTab(ft) {
    state.tab = ft;
    tabsEl.querySelectorAll("button").forEach(function (b) { b.classList.toggle("mzf-active", b.getAttribute("data-tab") === ft); });
    modalBody.innerHTML = "";
    modalBody.appendChild(BUILDERS[ft]());
  }
  function open(tab) { ensureModal(); state.open = true; overlay.classList.add("mzf-on"); selectTab(tab || state.features[0]); document.body.style.overflow = "hidden"; }
  function close() { state.open = false; if (overlay) overlay.classList.remove("mzf-on"); document.body.style.overflow = ""; }

  /* ---------- launcher ---------- */
  function renderLauncher() {
    if (document.querySelector(".mzf-launch")) return;
    var wrap = el('<div class="mzf-launch"></div>');
    var primary = state.features.filter(function (f) { return f !== "review"; })[0] || state.features[0];
    var b = el("<button>" + LABELS[primary] + "</button>");
    b.addEventListener("click", function () { open(primary); });
    wrap.appendChild(b);
    document.body.appendChild(wrap);
  }

  /* ---------- wire existing CTAs + review containers ---------- */
  function wireExisting() {
    document.querySelectorAll("[data-masul-open]").forEach(function (node) {
      if (node.dataset.masulBound) return;
      node.dataset.masulBound = "1";
      node.addEventListener("click", function (e) { e.preventDefault(); open(node.getAttribute("data-masul-open")); });
    });
    document.querySelectorAll("[data-masul-reviews]").forEach(function (node) {
      if (node.dataset.masulReviewed) return;
      node.dataset.masulReviewed = "1";
      loadReviews(node, node.getAttribute("data-summary") ? document.querySelector(node.getAttribute("data-summary")) : null);
    });
  }

  /* ---------- boot + self-heal ----------
     Single-file bundler sites (Adept, After Dark, site-delta) rebuild the whole
     document at runtime, which would wipe our launcher. Already-executed JS keeps
     running, so we re-attach whenever the launcher goes missing. */
  function boot() {
    injectCSS();
    renderLauncher();
    wireExisting();
  }
  function ensure() {
    if (!document.getElementById("mzf-css")) injectCSS();
    if (!document.querySelector(".mzf-launch")) renderLauncher();
    wireExisting();
  }
  function keepAlive() {
    var n = 0;
    var iv = setInterval(function () { ensure(); if (++n > 30) clearInterval(iv); }, 700); // ~21s
    try {
      var mo = new MutationObserver(function () { ensure(); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 30000);
    } catch (e) {}
  }
  function start() {
    var go = function () { boot(); keepAlive(); };
    if (state.features && state.features.length) { go(); return; }
    fetch(API + "/api/config?siteId=" + encodeURIComponent(SITE))
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.ok) { state.features = d.features; state.name = d.name; } else { state.features = ["review"]; } go(); })
      .catch(function () { state.features = window.MASUL_FEATURES || ["review"]; go(); });
  }

  if (document.readyState !== "loading") start();
  else document.addEventListener("DOMContentLoaded", start);

  window.MasulForms = { submit: submit, loadReviews: loadReviews, open: open, close: close };
})();
