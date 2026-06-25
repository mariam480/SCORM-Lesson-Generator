/* player.js — slide-based lesson player.
 *
 * Reads the lesson JSON embedded in #__LESSON__, renders one composed slide at a
 * time inside a fixed frame, and drives navigation with the two nav buttons +
 * a "N / Total" counter (identical chrome on every slide). Reports completion
 * and the quiz score to a SCORM 1.2 LMS when one is present; degrades silently
 * over file:// for local preview.
 *
 * Component renderers live in RENDERERS — each maps one spec block to a DOM
 * node. generate-slides.mjs only serializes the spec; all rendering is here, so
 * the slide frame stays identical no matter what an author drops on a slide.
 */
(function () {
  "use strict";
  var LESSON = JSON.parse(document.getElementById("__LESSON__").textContent || "{}");
  var slides = LESSON.slides || [];
  var idx = 0;

  // ---- tiny DOM helper -----------------------------------------------------
  function el(tag, opts, kids) {
    var n = document.createElement(tag);
    opts = opts || {};
    for (var k in opts) {
      if (k === "class") n.className = opts[k];
      else if (k === "html") n.innerHTML = opts[k];
      else if (k === "text") n.textContent = opts[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2).toLowerCase(), opts[k]);
      else n.setAttribute(k, opts[k]);
    }
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function asHtml(s) { return s == null ? "" : (/^\s*</.test(String(s)) ? String(s) : "<p>" + String(s) + "</p>"); }

  // ---- icons (vendored Lucide subset, bundled offline in icons.js) ---------
  // window.__ICONS__ maps name -> inner SVG. We wrap it once and let CSS/color
  // do the rest (stroke=currentColor, sized to 1em so it flows with text).
  var ICONS = window.__ICONS__ || {};
  function iconSvg(name) {
    var body = ICONS[name];
    if (!body) return null;
    return '<svg class="lico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + "</svg>";
  }
  // Hydrate inline icons: any <i data-icon="name"> (in any HTML text field)
  // becomes the SVG. Lets authors drop icons into paragraphs, lists, tabs, etc.
  function hydrateIcons(root) {
    [].forEach.call(root.querySelectorAll("[data-icon]"), function (host) {
      var svg = iconSvg(host.getAttribute("data-icon"));
      if (svg) { host.innerHTML = svg; host.classList.add("lico-host"); }
    });
  }

  // ---- SCORM 1.2 (optional) ------------------------------------------------
  // The package launches via scormdriver/indexAPI.html, whose window exposes the
  // Rustici helper API to this iframe as window.parent.* — we feature-detect each.
  var scorm = {
    call: function (fn) {
      try {
        var p = window.parent;
        if (p && typeof p[fn] === "function") return p[fn].apply(p, [].slice.call(arguments, 1));
      } catch (e) { /* cross-origin / standalone — ignore */ }
    },
    complete: function () { this.call("SetReachedEnd", true); this.call("SetPassed"); this.call("CommitData"); },
    score: function (raw, max) {
      this.call("SetScore", raw, max, 0);
      if (max > 0 && raw / max >= 0.5) this.call("SetPassed"); else this.call("SetFailed");
      this.call("CommitData");
    },
  };
  var quiz = { total: 0, correct: 0, answered: {} };
  function recordQuiz(id, isCorrect) {
    if (quiz.answered[id]) return;            // count each question once
    quiz.answered[id] = true; quiz.total++; if (isCorrect) quiz.correct++;
  }

  // ---- component renderers -------------------------------------------------
  var uid = 0;
  function nextId() { return "k" + (++uid); }

  var RENDERERS = {
    heading: function (b) { return el("h3", { class: "c-h", text: b.heading || b.text || "" }); },
    subheading: function (b) { return el("h4", { class: "c-sub", text: b.heading || b.text || "" }); },
    paragraph: function (b) { return el("div", { class: "c-p", html: asHtml(b.text) }); },
    statement: function (b) { return el("div", { class: "c-statement", html: asHtml(b.text).replace(/^<p>|<\/p>$/g, "") }); },
    note: function (b) { return el("div", { class: "c-note", html: asHtml(b.text) }); },
    quote: function (b) {
      var inner = '<span class="qt">' + asHtml(b.text).replace(/^<p>|<\/p>$/g, "") + "</span>";
      if (b.attribution) inner += '<span class="by">— ' + b.attribution + "</span>";
      return el("blockquote", { class: "c-quote", html: inner });
    },
    list: function (b) {
      var style = b.style || "bulleted";
      var tag = style === "numbered" ? "ol" : "ul";
      var cls = "c-list" + (style === "checkbox" ? " c-check" : "");
      return el(tag, { class: cls }, (b.items || []).map(function (t) { return el("li", { html: t }); }));
    },
    divider: function () { return el("hr", { style: "border:0;border-top:1px solid var(--line)" }); },
    image: function (b) {
      var fig = el("figure", { class: "c-img" }, [el("img", { src: b.src, alt: b.alt || "" })]);
      if (b.caption) fig.appendChild(el("figcaption", { text: b.caption }));
      return fig;
    },
    gallery: function (b) {
      var n = (b.images || []).length;
      var cols = n >= 3 ? 3 : 2;
      return el("div", { class: "c-grid cols-" + cols }, (b.images || []).map(function (im) {
        return el("img", { src: im.src, alt: im.alt || "" });
      }));
    },
    audio: function (b) { return el("div", { class: "c-media" }, [el("audio", { controls: "", src: b.src })]); },
    video: function (b) { return el("div", { class: "c-media" }, [el("video", { controls: "", src: b.src, poster: b.poster || "" })]); },
    code: function (b) { return el("pre", { class: "c-code" }, [el("code", { text: b.code || "" })]); },
    button: function (b) {
      var a = el("a", { class: "c-btn", href: b.url || "#", target: "_blank" });
      var svg = b.icon && iconSvg(b.icon);
      if (svg) a.appendChild(el("span", { class: "btn-ico", html: svg }));
      a.appendChild(el("span", { text: b.label || "Open" }));
      return a;
    },
    icon: function (b) {
      var svg = iconSvg(b.name);
      var badge = el("span", { class: "ico-badge" + (b.plain ? " plain" : ""), html: svg || "" });
      if (!svg) badge.textContent = "▢";
      if (b.size != null) badge.style.fontSize = (typeof b.size === "number" ? b.size + "px" : b.size);
      if (b.color) badge.style.color = b.color;
      var wrap = el("div", { class: "c-icon" + (b.align === "left" ? " left" : "") }, [badge]);
      if (b.label) wrap.appendChild(el("div", { class: "ico-label", html: asHtml(b.label) }));
      return wrap;
    },
    iconList: function (b) {
      var cols = b.columns === 2 || b.columns === "2" ? " cols-2" : "";
      return el("div", { class: "c-iconlist" + cols }, (b.items || []).map(function (it) {
        var svg = it.icon && iconSvg(it.icon);
        var badge = el("span", { class: "ico-badge", html: svg || "" });
        if (!svg) badge.textContent = "▢";
        return el("div", { class: "ili" }, [
          badge,
          el("div", { class: "ili-tx" }, [
            it.title ? el("div", { class: "ili-h", html: asHtml(it.title).replace(/^<p>|<\/p>$/g, "") }) : null,
            it.text ? el("div", { class: "ili-p", html: asHtml(it.text) }) : null,
          ]),
        ]);
      }));
    },

    accordion: function (b) {
      return el("div", { class: "c-acc" }, (b.items || []).map(function (it) {
        return el("details", {}, [el("summary", { text: it.title || "" }), el("div", { class: "acc-body", html: asHtml(it.text) })]);
      }));
    },
    tabs: function (b) {
      var wrap = el("div", { class: "c-tabs" });
      var strip = el("div", { class: "tab-strip" });
      var body = el("div", { class: "tab-body" });
      (b.items || []).forEach(function (it, i) {
        var btn = el("button", { type: "button", text: it.title || ("Tab " + (i + 1)), onclick: function () {
          [].forEach.call(strip.children, function (c) { c.classList.remove("active"); });
          btn.classList.add("active"); body.innerHTML = asHtml(it.text);
        } });
        if (i === 0) { btn.classList.add("active"); body.innerHTML = asHtml(it.text); }
        strip.appendChild(btn);
      });
      wrap.appendChild(strip); wrap.appendChild(body); return wrap;
    },
    flashcards: function (b) {
      var cards = b.cards || []; var i = 0;
      var wrap = el("div", { class: "c-flash" });
      var card = el("div", { class: "card" });
      var front = el("div", { class: "face front" });
      var back = el("div", { class: "face back" });
      card.appendChild(front); card.appendChild(back);
      card.addEventListener("click", function () { card.classList.toggle("flipped"); });
      var hint = el("div", { class: "hint", text: "Click the card to flip" });
      var counter = el("span", { text: "" });
      function show() {
        card.classList.remove("flipped");
        front.innerHTML = asHtml((cards[i] || {}).front);
        back.innerHTML = asHtml((cards[i] || {}).back);
        counter.textContent = (i + 1) + " / " + cards.length;
      }
      var prev = el("button", { type: "button", text: "‹", onclick: function (e) { e.stopPropagation(); i = (i - 1 + cards.length) % cards.length; show(); } });
      var next = el("button", { type: "button", text: "›", onclick: function (e) { e.stopPropagation(); i = (i + 1) % cards.length; show(); } });
      var nav = el("div", { class: "nav" }, [prev, counter, next]);
      wrap.appendChild(card); wrap.appendChild(hint); if (cards.length > 1) wrap.appendChild(nav);
      show(); return wrap;
    },
    sorting: function (b) {
      var wrap = el("div", { class: "c-sort" });
      var pool = el("div", { class: "pool" });
      var cards = (b.cards || []).map(function (c, i) {
        var chip = el("div", { class: "chip", draggable: "true", "data-pile": c.pile, "data-id": i, text: c.text || "" });
        chip.addEventListener("dragstart", function (e) { e.dataTransfer.setData("text", String(i)); });
        return chip;
      });
      cards.forEach(function (c) { pool.appendChild(c); });
      var piles = el("div", { class: "piles" });
      (b.piles || []).forEach(function (title, pi) {
        var pile = el("div", { class: "pile", "data-pile": pi }, [el("h4", { text: title })]);
        pile.addEventListener("dragover", function (e) { e.preventDefault(); pile.classList.add("over"); });
        pile.addEventListener("dragleave", function () { pile.classList.remove("over"); });
        pile.addEventListener("drop", function (e) {
          e.preventDefault(); pile.classList.remove("over");
          var id = e.dataTransfer.getData("text"); var chip = cards[+id];
          pile.appendChild(chip);
          var ok = String(chip.getAttribute("data-pile")) === String(pi);
          chip.classList.toggle("correct", ok); chip.classList.toggle("wrong", !ok);
        });
        piles.appendChild(pile);
      });
      wrap.appendChild(pool); wrap.appendChild(piles); return wrap;
    },
    timeline: function (b) {
      return el("div", { class: "c-timeline" }, (b.events || []).map(function (ev) {
        return el("div", { class: "ev" }, [
          ev.date ? el("div", { class: "date", text: ev.date }) : null,
          el("div", { class: "c-sub", text: ev.title || "" }),
          el("div", { class: "c-p", html: asHtml(ev.text) }),
        ]);
      }));
    },
    knowledgeCheck: function (b) {
      var kind = b.kind || "multipleChoice";
      var qid = b.id || nextId();
      var wrap = el("div", { class: "c-quiz" });
      wrap.appendChild(el("div", { class: "q", text: b.question || "" }));
      var fb = el("div", { class: "fb" });

      if (kind === "fillBlank") {
        var input = el("input", { type: "text", placeholder: "Type your answer" });
        var accepted = (b.answers || [b.answer]).filter(Boolean).map(function (s) { return String(s).trim().toLowerCase(); });
        var check = el("button", { class: "check", type: "button", text: "Check", onclick: function () {
          var ok = accepted.indexOf((input.value || "").trim().toLowerCase()) !== -1;
          fb.className = "fb show " + (ok ? "ok" : "no");
          fb.textContent = ok ? "Correct!" : ("Not quite — answer: " + (b.answers || [b.answer])[0]);
          recordQuiz(qid, ok);
        } });
        wrap.appendChild(input); wrap.appendChild(check); wrap.appendChild(fb);
        return wrap;
      }

      var multi = kind === "multipleResponse";
      var opts = (b.answers || []).map(function (a, i) {
        var o = el("div", { class: "opt", "data-correct": !!a.correct, text: a.text || "" });
        o.addEventListener("click", function () {
          if (wrap.dataset.done) return;
          if (multi) o.classList.toggle("sel");
          else { [].forEach.call(o.parentNode.querySelectorAll(".opt"), function (x) { x.classList.remove("sel"); }); o.classList.add("sel"); }
        });
        return o;
      });
      opts.forEach(function (o) { wrap.appendChild(o); });
      var submit = el("button", { class: "check", type: "button", text: "Submit", onclick: function () {
        if (wrap.dataset.done) return; wrap.dataset.done = "1";
        var allOk = true;
        opts.forEach(function (o) {
          var correct = o.getAttribute("data-correct") === "true";
          var sel = o.classList.contains("sel");
          if (correct) o.classList.add("correct");
          if (sel && !correct) { o.classList.add("wrong"); allOk = false; }
          if (correct && !sel) allOk = false;
        });
        fb.className = "fb show " + (allOk ? "ok" : "no");
        fb.textContent = allOk ? "Correct!" : "Not quite — the right answer is highlighted.";
        recordQuiz(qid, allOk);
      } });
      wrap.appendChild(submit); wrap.appendChild(fb);
      return wrap;
    },
  };

  function renderBlock(b) {
    var fn = RENDERERS[b.type];
    if (!fn) return el("div", { class: "c-note", text: 'Unknown component: "' + b.type + '"' });
    try { return fn(b); } catch (e) { return el("div", { class: "c-note", text: "Error rendering " + b.type + ": " + e.message }); }
  }

  // ---- slide rendering + navigation ---------------------------------------
  var stageEl = document.getElementById("stage");
  var slideEl = document.getElementById("slide");
  var counterEl = document.getElementById("counter");
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");
  var bar = document.getElementById("progressBar");
  document.title = LESSON.title || "Lesson";
  if (LESSON.color) document.documentElement.style.setProperty("--accent", LESSON.color);

  function eyebrow(s) { return s.eyebrow ? el("span", { class: "eyebrow", text: s.eyebrow }) : null; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  // Three layouts give the deck visual variety like a real slide template:
  // cover (big title + framed hero), section (giant number divider), default.
  function layoutCover(s) {
    var imgs = (s.blocks || []).filter(function (b) { return b.type === "image"; });
    var rest = (s.blocks || []).filter(function (b) { return b.type !== "image"; });
    var left = el("div", { class: "cover-left" }, [
      eyebrow(s),
      s.title ? el("h1", { class: "cover-title", text: s.title }) : null,
    ]);
    rest.forEach(function (b) {
      var node = renderBlock(b);
      if (b.type === "paragraph") node.className = "cover-sub";
      left.appendChild(node);
    });
    var hero = imgs[0];
    var cover = el("div", { class: "cover" + (hero ? "" : " solo") }, [left]);
    if (hero) cover.appendChild(el("div", { class: "cover-art" }, [el("img", { src: hero.src, alt: hero.alt || "" })]));
    return cover;
  }
  function layoutSection(s, i) {
    return el("div", { class: "section" }, [
      el("div", { class: "num", text: s.number || pad2(i + 1) }),
      s.title ? el("h2", { class: "section-title", text: s.title }) : null,
      el("div", { class: "wrap", style: "max-width:760px;margin:18px 0 0" }, (s.blocks || []).map(renderBlock)),
    ]);
  }
  function isMedia(b) { return b && (b.type === "image" || b.type === "gallery"); }
  function head(s) {
    if (!s.eyebrow && !s.title) return null;
    return el("div", { class: "slide-head" }, [
      eyebrow(s), s.title ? el("h2", { class: "slide-title", text: s.title }) : null,
    ]);
  }
  function layoutDefault(s) {
    var frag = document.createDocumentFragment();
    var h = head(s); if (h) frag.appendChild(h);
    var center = (s.blocks || []).length === 1 && /statement|quote/.test((s.blocks[0] || {}).type);
    var body = el("div", { class: "slide-body" + (center ? " center" : "") });
    body.appendChild(el("div", { class: "wrap" }, (s.blocks || []).map(renderBlock)));
    frag.appendChild(body);
    return frag;
  }
  // Split layout: text on one side, image(s) on the other — side by side, no
  // scrolling. The image side is capped to the frame height so the slide fits.
  function layoutSplit(s) {
    var frag = document.createDocumentFragment();
    var h = head(s); if (h) frag.appendChild(h);
    var media = (s.blocks || []).filter(isMedia);
    var rest = (s.blocks || []).filter(function (b) { return !isMedia(b); });
    var side = s.imageSide === "left" ? "left" : "right";
    var body = el("div", { class: "slide-body split img-" + side }, [
      el("div", { class: "split-text" }, rest.map(renderBlock)),
      el("div", { class: "split-media" }, media.map(renderBlock)),
    ]);
    frag.appendChild(body);
    return frag;
  }

  var reachedEnd = false;
  function render() {
    var s = slides[idx] || { blocks: [] };
    var layout = s.layout || (idx === 0 ? "cover" : "default");
    // Auto split: a default slide that has both an image and text renders the
    // two side by side instead of stacking them (which would overflow/scroll).
    if (layout === "default") {
      var bl = s.blocks || [];
      if (bl.some(isMedia) && bl.some(function (b) { return !isMedia(b); })) layout = "split";
    }
    stageEl.className = "stage v" + (idx % 4);     // cycle the decorative color cast
    slideEl.innerHTML = "";
    slideEl.appendChild(
      layout === "cover" ? layoutCover(s) :
      layout === "section" ? layoutSection(s, idx) :
      layout === "split" ? layoutSplit(s) :
      layoutDefault(s)
    );
    slideEl.scrollTop = 0;

    counterEl.textContent = (idx + 1) + " / " + slides.length;
    bar.style.width = (slides.length ? ((idx + 1) / slides.length) * 100 : 0) + "%";
    prevBtn.disabled = idx === 0;
    nextBtn.textContent = idx === slides.length - 1 ? "Finish" : "Next ›";

    if (idx === slides.length - 1 && !reachedEnd) {
      reachedEnd = true; scorm.complete();
      if (quiz.total > 0) scorm.score(quiz.correct, quiz.total);
    }
  }
  function go(n) {
    idx = Math.max(0, Math.min(slides.length - 1, n));
    try { history.replaceState(null, "", "#s" + (idx + 1)); } catch (e) {}
    render();
  }
  prevBtn.addEventListener("click", function () { go(idx - 1); });
  nextBtn.addEventListener("click", function () {
    if (idx === slides.length - 1) { scorm.complete(); if (quiz.total > 0) scorm.score(quiz.correct, quiz.total); scorm.call("Finish"); }
    else go(idx + 1);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") go(idx + 1);
    if (e.key === "ArrowLeft") go(idx - 1);
  });

  scorm.call("SetBookmark", "");
  var fromHash = parseInt((location.hash.match(/^#s(\d+)$/) || [])[1], 10);
  if (fromHash >= 1 && fromHash <= slides.length) idx = fromHash - 1;
  render();
})();
