// octave-webfig — 출력 셀 안에서 Octave figure를 그리고 조작하는 anywidget 프론트엔드.
//
// 모델 상태
//   fig_json : Octave __webfig_export__ 가 만든 figure 트리 (JSON 문자열)
//   closed   : Octave 쪽 figure가 닫혔는지
//   live_slider : 슬라이더를 드래그하는 동안에도 콜백을 보낼지
// 메시지
//   → 커널 {type:"event", obj, kind, value, seq} / {type:"close"} / {type:"refresh"}
//   ← 커널 {type:"ack", seq, out, error}

const PT = 96 / 72; // 1pt 를 figure 픽셀로
const FONT = 'Helvetica, Arial, "Segoe UI", "Malgun Gothic", sans-serif';
const MAX_HOVER_PTS = 20000;

// ------------------------------------------------------------------ 기본 헬퍼
const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const nums = (v) => arr(v).map((x) => (x == null ? NaN : +x));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = Number.isFinite;

function num(v, d = NaN) {
  if (v == null) return d;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Array.isArray(v) && v.length) return v[0] == null ? d : +v[0];
  return d;
}

function rgbOf(c) {
  const a = arr(c);
  if (a.length === 3 && a.every((x) => typeof x === "number")) return a;
  return null;
}

function css(c, alpha = 1) {
  const a = rgbOf(c);
  if (!a) return null;
  const r = Math.round(clamp(a[0], 0, 1) * 255);
  const g = Math.round(clamp(a[1], 0, 1) * 255);
  const b = Math.round(clamp(a[2], 0, 1) * 255);
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

function mat(o) {
  if (!o || typeof o !== "object") return { m: 0, n: 0, k: 1, d: [], at: () => NaN };
  const s = nums(o.s);
  const d = nums(o.d);
  const m = s[0] || 0;
  const n = s[1] || 0;
  const k = s.length > 2 ? s[2] || 1 : 1;
  return { m, n, k, d, at: (i, j, c = 0) => d[i + j * m + c * m * n] };
}

function strs(v) {
  return arr(v).flat(4).map((s) => (s == null ? "" : String(s)));
}

function onoff(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "on";
  return !!v;
}

// ------------------------------------------------------------------ TeX 일부
const SYM = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ",
  eta: "η", theta: "θ", vartheta: "ϑ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν",
  xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", varphi: "φ",
  chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ",
  Pi: "Π", Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω", circ: "∘", pm: "±",
  times: "×", cdot: "·", infty: "∞", leq: "≤", geq: "≥", neq: "≠", approx: "≈", sim: "∼",
  rightarrow: "→", leftarrow: "←", uparrow: "↑", downarrow: "↓", leftrightarrow: "↔",
  partial: "∂", nabla: "∇", sum: "∑", int: "∫", surd: "√", sqrt: "√", prime: "′", bullet: "•",
  div: "÷", propto: "∝", equiv: "≡", in: "∈", forall: "∀", exists: "∃", cap: "∩", cup: "∪",
  ldots: "…", cdots: "⋯", angle: "∠", perp: "⊥", degree: "°", deg: "°", Re: "ℜ", Im: "ℑ",
};
const SUP = {
  0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "+": "⁺",
  "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", x: "ˣ", y: "ʸ", T: "ᵀ", a: "ᵃ",
  b: "ᵇ", c: "ᶜ", d: "ᵈ", e: "ᵉ", k: "ᵏ", m: "ᵐ", o: "ᵒ", p: "ᵖ", t: "ᵗ", "°": "°",
};
const SUB = {
  0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉", "+": "₊",
  "-": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", o: "ₒ", x: "ₓ", i: "ᵢ", j: "ⱼ",
  k: "ₖ", n: "ₙ", m: "ₘ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", h: "ₕ", l: "ₗ",
};

function tex(s, interp) {
  s = s == null ? "" : String(s);
  if (interp === "none") return s;
  if (interp === "latex") s = s.replace(/\$/g, "");
  s = s.replace(/\^\{?\\circ\}?/g, "°");
  s = s.replace(/\\(bf|it|rm|sl)\b\s?/g, "");
  s = s.replace(/\\(fontname|fontsize|color)\{[^}]*\}/g, "");
  s = s.replace(/\\([a-zA-Z]+)/g, (m, w) => (w in SYM ? SYM[w] : m));
  const conv = (op, t) => {
    const map = op === "^" ? SUP : SUB;
    return [...t].map((ch) => map[ch] || ch).join("");
  };
  s = s.replace(/([\^_])\{([^}]*)\}/g, (m, op, t) => conv(op, t));
  s = s.replace(/(^|[^\\])([\^_])([^\s{\\])/g, (m, pre, op, t) => pre + conv(op, t));
  s = s.replace(/\\([{}_^\\])/g, "$1");
  return s;
}

// ------------------------------------------------------------------ 눈금
function niceStep(span, maxN) {
  const raw = span / Math.max(1, maxN);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * p;
}

function linTicks(lo, hi, maxN) {
  if (!(hi > lo) || !fin(lo) || !fin(hi)) return { ticks: fin(lo) ? [lo] : [], step: 1 };
  const st = niceStep(hi - lo, maxN);
  const out = [];
  const a = Math.ceil(lo / st - 1e-9);
  for (let i = a; i * st <= hi + st * 1e-9 && out.length < 200; i++) {
    const v = i * st;
    out.push(Math.abs(v) < st * 1e-10 ? 0 : v);
  }
  return { ticks: out, step: st };
}

function fmtTicks(ticks, step) {
  const maxAbs = Math.max(0, ...ticks.map(Math.abs));
  let e = 0;
  if (maxAbs >= 1e5 || (maxAbs > 0 && maxAbs < 1e-3)) e = Math.floor(Math.log10(maxAbs));
  const sc = Math.pow(10, e);
  const st = step / sc;
  const mant = st / Math.pow(10, Math.floor(Math.log10(st) + 1e-12));
  let dec = -Math.floor(Math.log10(st) + 1e-9);
  if (Math.abs(mant - 2.5) < 1e-6) dec += 1;
  dec = clamp(dec, 0, 10);
  const labels = ticks.map((v) => {
    let s = (v / sc).toFixed(dec);
    if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);
    return s;
  });
  return { labels, exp: e };
}

function logTicks(lo, hi) {
  const a = Math.floor(Math.log10(lo));
  const b = Math.ceil(Math.log10(hi));
  const n = b - a;
  const every = Math.max(1, Math.ceil(n / 8));
  const ticks = [];
  for (let k = a; k <= b; k += every) {
    const v = Math.pow(10, k);
    if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) ticks.push(v);
  }
  return { ticks, labels: ticks.map((v) => "10" + tex("^{" + Math.round(Math.log10(v)) + "}")), exp: 0 };
}

function axisTicks(a, n, lim, maxN) {
  // n: "x" | "y" | "z"; lim: 현재 화면 범위
  const scale = a[n + "scale"];
  const manual = a[n + "tickmode"] === "manual";
  let ticks;
  let labels;
  let exp = 0;
  const lo = Math.min(lim[0], lim[1]);
  const hi = Math.max(lim[0], lim[1]);
  if (manual) {
    ticks = nums(a[n + "tick"]).filter((v) => fin(v) && v >= lo - 1e-12 * (hi - lo) && v <= hi + 1e-12 * (hi - lo));
    if (a[n + "ticklabelmode"] === "manual") {
      const all = nums(a[n + "tick"]);
      const lab = strs(a[n + "ticklabel"]);
      labels = ticks.map((v) => {
        const i = all.indexOf(v);
        return lab.length ? lab[(i < 0 ? 0 : i) % lab.length] : "";
      });
    } else if (scale === "log") {
      labels = ticks.map((v) => String(v));
    } else {
      const st = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : Math.abs(ticks[0] || 1);
      const f = fmtTicks(ticks, st || 1);
      labels = f.labels;
      exp = f.exp;
    }
  } else if (scale === "log" && lo > 0) {
    const t = logTicks(lo, hi);
    ticks = t.ticks;
    labels = t.labels;
  } else {
    const t = linTicks(lo, hi, maxN);
    ticks = t.ticks;
    const f = fmtTicks(ticks, t.step);
    labels = f.labels;
    exp = f.exp;
  }
  return { ticks, labels: labels.map((s) => tex(s, "tex")), exp };
}

// ------------------------------------------------------------------ 그리기 헬퍼
function dashFor(ls, lw) {
  const u = Math.max(1, lw);
  switch (ls) {
    case "--":
      return [6 * u, 4 * u];
    case ":":
      return [Math.max(1, u), 3 * u];
    case "-.":
      return [6 * u, 3 * u, Math.max(1, u), 3 * u];
    default:
      return [];
  }
}

function markerPath(ctx, m, x, y, r) {
  switch (m) {
    case "o":
    case ".":
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      return true;
    case "s":
    case "square":
      ctx.rect(x - r, y - r, 2 * r, 2 * r);
      return true;
    case "d":
    case "diamond":
      ctx.moveTo(x, y - r * 1.25);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r * 1.25);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      return true;
    case "^":
      ctx.moveTo(x, y - r * 1.15);
      ctx.lineTo(x + r, y + r * 0.85);
      ctx.lineTo(x - r, y + r * 0.85);
      ctx.closePath();
      return true;
    case "v":
      ctx.moveTo(x, y + r * 1.15);
      ctx.lineTo(x + r, y - r * 0.85);
      ctx.lineTo(x - r, y - r * 0.85);
      ctx.closePath();
      return true;
    case ">":
      ctx.moveTo(x + r * 1.15, y);
      ctx.lineTo(x - r * 0.85, y + r);
      ctx.lineTo(x - r * 0.85, y - r);
      ctx.closePath();
      return true;
    case "<":
      ctx.moveTo(x - r * 1.15, y);
      ctx.lineTo(x + r * 0.85, y + r);
      ctx.lineTo(x + r * 0.85, y - r);
      ctx.closePath();
      return true;
    case "p":
    case "pentagram":
    case "h":
    case "hexagram": {
      const pts = m[0] === "p" ? 5 : 6;
      for (let i = 0; i < pts * 2; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / pts;
        const rr = i % 2 ? r * 0.45 : r * 1.2;
        const px = x + rr * Math.cos(ang);
        const py = y + rr * Math.sin(ang);
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
      return true;
    }
    case "+":
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      return false;
    case "x": {
      const q = r * 0.75;
      ctx.moveTo(x - q, y - q);
      ctx.lineTo(x + q, y + q);
      ctx.moveTo(x - q, y + q);
      ctx.lineTo(x + q, y - q);
      return false;
    }
    case "*": {
      const q = r * 0.75;
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      ctx.moveTo(x - q, y - q);
      ctx.lineTo(x + q, y + q);
      ctx.moveTo(x - q, y + q);
      ctx.lineTo(x + q, y - q);
      return false;
    }
    case "|":
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      return false;
    case "_":
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      return false;
    default:
      return null;
  }
}

function drawMarker(ctx, m, x, y, sizePx, edge, face, lw) {
  if (!m || m === "none") return;
  let r = sizePx / 2;
  if (m === ".") r = Math.max(1, sizePx / 6);
  ctx.beginPath();
  const closed = markerPath(ctx, m, x, y, r);
  if (closed === null) return;
  if (m === ".") {
    ctx.fillStyle = edge || face || "#000";
    ctx.fill();
    return;
  }
  if (closed && face) {
    ctx.fillStyle = face;
    ctx.fill();
  }
  if (edge) {
    ctx.setLineDash([]);
    ctx.lineWidth = lw;
    ctx.strokeStyle = edge;
    ctx.stroke();
  }
}

function lineMarkerColors(o, lineColor, axColor) {
  let edge = o.mec;
  let face = o.mfc;
  edge = edge === "auto" || edge == null ? lineColor : edge === "none" ? null : css(edge);
  if (face === "auto") face = css(axColor) || lineColor;
  else if (face === "none" || face == null) face = null;
  else face = css(face);
  return [edge, face];
}

function cmapColor(cm, v, clim, mapping) {
  if (!fin(v) || cm.m === 0) return null;
  const n = cm.m;
  let i;
  if (mapping === "direct") i = Math.floor(v) - 1;
  else {
    const d = clim[1] - clim[0] || 1;
    i = Math.floor(((v - clim[0]) / d) * n);
  }
  i = clamp(i, 0, n - 1);
  return [cm.at(i, 0), cm.at(i, 1), cm.at(i, 2)];
}

function setFont(ctx, sizePx, weight = "normal", angle = "normal") {
  ctx.font = `${angle === "italic" ? "italic " : ""}${weight === "bold" ? "bold " : ""}${sizePx.toFixed(1)}px ${FONT}`;
}

// 여러 줄 텍스트. (x,y)는 앵커, halign/valign 은 MATLAB 방식
function drawText(ctx, lines, x, y, o) {
  lines = lines.filter((s) => s != null);
  if (!lines.length) return null;
  const size = o.size || 13;
  setFont(ctx, size, o.weight, o.angle);
  const lh = size * 1.2;
  const w = Math.max(...lines.map((s) => ctx.measureText(s).width));
  const h = lh * lines.length;
  let dx = 0;
  if (o.halign === "center") dx = -w / 2;
  else if (o.halign === "right") dx = -w;
  let dy;
  switch (o.valign) {
    case "top":
    case "cap":
      dy = 0;
      break;
    case "bottom":
    case "baseline":
      dy = -h;
      break;
    default:
      dy = -h / 2;
  }
  ctx.save();
  ctx.translate(x, y);
  if (o.rotation) ctx.rotate((-o.rotation * Math.PI) / 180);
  if (o.bg) {
    ctx.fillStyle = o.bg;
    ctx.fillRect(dx - 2, dy - 1, w + 4, h + 2);
  }
  if (o.edge) {
    ctx.strokeStyle = o.edge;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(dx - 2, dy - 1, w + 4, h + 2);
  }
  ctx.fillStyle = o.color || "#000";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  lines.forEach((s, i) => {
    let lx = dx;
    if (o.halign === "center") lx = dx + (w - ctx.measureText(s).width) / 2;
    else if (o.halign === "right") lx = dx + (w - ctx.measureText(s).width);
    ctx.fillText(s, lx, dy + lh * (i + 0.5));
  });
  ctx.restore();
  return { w, h };
}

function textLines(t) {
  return strs(t.string).flatMap((s) => s.split("\n")).map((s) => tex(s, t.interpreter));
}

function fmtNum(v) {
  if (!fin(v)) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return v.toExponential(3);
  return String(+v.toPrecision(5));
}

// ------------------------------------------------------------------ figure 뷰
class FigView {
  constructor(model, el) {
    this.model = model;
    this.el = el;
    this.fig = null;
    this.scale = 1;
    this.vstate = new Map(); // axes id → 사용자 줌/회전 상태
    this.layouts = [];
    this.controls = new Map(); // uicontrol id → {el, style, input}
    this.dragging = new Set();
    this.lastSent = new Map();
    this.pending = new Map();
    this.inflight = 0;
    this.seq = 0;
    this.mode = "auto";
    this.images = new Map();
    this.drag = null;
    this.raf = 0;
    this.build();
    this.onFig = () => this.load();
    this.onClosed = () => this.setClosed(!!model.get("closed"));
    this.onMsg = (msg) => this.message(msg);
    model.on("change:fig_json", this.onFig);
    model.on("change:closed", this.onClosed);
    model.on("msg:custom", this.onMsg);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
    this.load();
    this.setClosed(!!model.get("closed"));
  }

  destroy() {
    this.model.off("change:fig_json", this.onFig);
    this.model.off("change:closed", this.onClosed);
    this.model.off("msg:custom", this.onMsg);
    this.ro.disconnect();
    cancelAnimationFrame(this.raf);
    clearTimeout(this.ackTimer);
  }

  // -------------------------------------------------------------- DOM
  build() {
    const h = (tag, cls, parent, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      if (parent) parent.appendChild(e);
      return e;
    };
    this.h = h;
    const root = h("div", "owf-root", this.el);
    this.root = root;
    const bar = h("div", "owf-bar", root);
    this.titleEl = h("span", "owf-title", bar, "Figure");
    this.busyEl = h("span", "owf-busy", bar);
    this.busyEl.title = "Octave에서 콜백 실행 중";
    this.readout = h("span", "owf-readout", bar);
    h("span", "owf-spacer", bar);
    const btn = (label, title, fn) => {
      const b = h("button", "owf-btn", bar, label);
      b.type = "button";
      b.title = title;
      b.addEventListener("click", fn);
      return b;
    };
    this.btnPan = btn("✥", "이동/확대 모드 (드래그: 이동, 휠: 확대, Shift+드래그: 영역 확대)", () => this.setMode("pan"));
    this.btnRot = btn("⟳", "3D 회전 모드 (드래그: 회전, 휠: 확대, 우클릭 드래그: 이동)", () => this.setMode("rotate"));
    btn("⌂", "보기 초기화 (축을 더블클릭해도 됨)", () => {
      this.vstate.clear();
      this.draw();
    });
    btn("⤓", "PNG로 저장", () => this.savePNG());
    this.btnCon = btn("›_", "콘솔 (콜백 출력/에러)", () => this.toggleConsole());
    this.btnClose = btn("✕", "figure 닫기", () => {
      if (!this.closed) this.model.send({ type: "close", seq: ++this.seq });
    });

    const stage = h("div", "owf-stage", root);
    this.stage = stage;
    this.canvas = h("canvas", "owf-canvas", stage);
    this.ctx = this.canvas.getContext("2d");
    this.layer = h("div", "owf-layer", stage);
    this.tip = h("div", "owf-tip", stage);
    this.band = h("div", "owf-band", stage);
    this.closedEl = h("div", "owf-closed", stage, "figure가 닫혔어");
    this.console = h("pre", "owf-console", root);
    this.console.hidden = true;

    const cv = this.canvas;
    cv.addEventListener("pointerdown", (e) => this.pointerDown(e));
    cv.addEventListener("pointermove", (e) => this.pointerMove(e));
    cv.addEventListener("pointerup", (e) => this.pointerUp(e));
    cv.addEventListener("pointercancel", (e) => this.pointerUp(e));
    cv.addEventListener("pointerleave", () => {
      if (!this.drag) this.hideTip();
    });
    cv.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    cv.addEventListener("dblclick", (e) => this.dblclick(e));
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
    this.updateModeButtons();
  }

  setMode(m) {
    this.mode = this.mode === m ? "auto" : m;
    this.updateModeButtons();
  }

  updateModeButtons() {
    this.btnPan.classList.toggle("on", this.mode === "pan");
    this.btnRot.classList.toggle("on", this.mode === "rotate");
  }

  toggleConsole(show) {
    this.console.hidden = show === undefined ? !this.console.hidden : !show;
    this.btnCon.classList.toggle("on", !this.console.hidden);
  }

  log(text, isErr) {
    if (!text) return;
    const line = document.createElement("div");
    line.className = isErr ? "owf-err" : "";
    line.textContent = text;
    this.console.appendChild(line);
    while (this.console.childNodes.length > 200) this.console.removeChild(this.console.firstChild);
    this.console.scrollTop = this.console.scrollHeight;
    this.btnCon.classList.toggle("alert", !!isErr && this.console.hidden);
    if (isErr) this.toggleConsole(true);
  }

  setClosed(c) {
    this.closed = c;
    this.root.classList.toggle("is-closed", c);
    this.closedEl.style.display = c ? "flex" : "none";
    for (const ctl of this.controls.values()) ctl.disable(c);
  }

  setBusy(b) {
    this.busyEl.classList.toggle("on", b);
  }

  // -------------------------------------------------------------- 데이터
  load() {
    const txt = this.model.get("fig_json");
    if (!txt) return;
    try {
      this.fig = JSON.parse(txt);
    } catch (e) {
      this.log("figure JSON 파싱 실패: " + e, true);
      return;
    }
    const f = this.fig;
    const name = f.name || "";
    let title = onoff(f.numbertitle) ? `Figure ${f.number}` : "";
    if (name) title = title ? `${title}: ${name}` : name;
    this.titleEl.textContent = title || "Figure";
    this.W = Math.max(50, num(arr(f.size)[0], 560));
    this.H = Math.max(50, num(arr(f.size)[1], 420));
    this.resize(true);
    this.syncControls();
  }

  resize(force) {
    if (!this.fig) return;
    const w = this.el.getBoundingClientRect().width || this.root.getBoundingClientRect().width;
    let s = w > 0 ? (w - 2) / this.W : 1;
    s = clamp(s, 0.25, 1);
    if (!force && Math.abs(s - this.scale) < 1e-3 && this.canvas.width) {
      return;
    }
    this.scale = s;
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    const cw = Math.round(this.W * s);
    const ch = Math.round(this.H * s);
    this.stage.style.width = cw + "px";
    this.stage.style.height = ch + "px";
    this.canvas.style.width = cw + "px";
    this.canvas.style.height = ch + "px";
    this.canvas.width = Math.round(cw * dpr);
    this.canvas.height = Math.round(ch * dpr);
    this.layer.style.width = this.W + "px";
    this.layer.style.height = this.H + "px";
    this.layer.style.transform = `scale(${s})`;
    this.draw();
  }

  requestDraw() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }

  // 부모 기준 [x y w h] (원점 왼쪽 아래) → figure 캔버스 좌표 (원점 왼쪽 위)
  rectOf(pos, off) {
    const p = nums(pos);
    const x = off.x + (p[0] || 0);
    const y = off.y + (p[1] || 0);
    const w = p[2] || 0;
    const h = p[3] || 0;
    return { x, y: this.H - (y + h), w, h };
  }

  draw() {
    const f = this.fig;
    if (!f) return;
    const ctx = this.ctx;
    const k = this.scale * (this.dpr || 1);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.fillStyle = css(f.color) || "#fff";
    ctx.fillRect(0, 0, this.W, this.H);
    this.layouts = [];
    this.legends = [];
    this.cmapFig = mat(f.colormap);
    this.walkDraw(arr(f.children), { x: 0, y: 0 });
    for (const lg of this.legends) this.drawLegend(lg.o, lg.off);
  }

  walkDraw(children, off) {
    for (const o of children) {
      if (!o || typeof o !== "object") continue;
      switch (o.type) {
        case "axes":
          this.drawAxes(o, off);
          break;
        case "legend":
          this.legends.push({ o, off });
          break;
        case "uipanel":
        case "uibuttongroup":
          if (onoff(o.visible)) {
            const r = this.drawPanel(o, off);
            this.walkDraw(arr(o.children), r);
          }
          break;
        default:
      }
    }
  }

  drawPanel(o, off) {
    const ctx = this.ctx;
    const R = this.rectOf(o.pos, off);
    ctx.fillStyle = css(o.bg) || "#eee";
    ctx.fillRect(R.x, R.y, R.w, R.h);
    if (o.bordertype !== "none") {
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.strokeRect(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1);
      if (String(o.bordertype).startsWith("etched")) {
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.strokeRect(R.x + 1.5, R.y + 1.5, R.w - 3, R.h - 3);
      }
    }
    if (o.title) {
      const size = num(o.fontsize, 10) * PT;
      setFont(ctx, size);
      const tw = ctx.measureText(o.title).width;
      const pos = String(o.titleposition || "lefttop");
      let tx = R.x + 8;
      if (pos.includes("center")) tx = R.x + (R.w - tw) / 2;
      else if (pos.includes("right")) tx = R.x + R.w - tw - 8;
      const ty = pos.includes("bottom") ? R.y + R.h : R.y;
      ctx.fillStyle = css(o.bg) || "#eee";
      ctx.fillRect(tx - 3, ty - size * 0.6, tw + 6, size * 1.2);
      ctx.fillStyle = css(o.fg) || "#000";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(o.title, tx, ty);
    }
    return { x: off.x + num(arr(o.pos)[0], 0), y: off.y + num(arr(o.pos)[1], 0) };
  }

  // -------------------------------------------------------------- axes
  viewOf(a) {
    const sig = JSON.stringify([
      a.xlimmode === "manual" ? a.xlim : "a",
      a.ylimmode === "manual" ? a.ylim : "a",
      a.zlimmode === "manual" ? a.zlim : "a",
      a.view,
    ]);
    let st = this.vstate.get(a.id);
    if (st && st.sig !== sig) {
      this.vstate.delete(a.id);
      st = null;
    }
    const fixLim = (l) => {
      const v = nums(l);
      let lo = fin(v[0]) ? v[0] : 0;
      let hi = fin(v[1]) ? v[1] : 1;
      if (hi === lo) {
        lo -= 0.5;
        hi += 0.5;
      }
      return [lo, hi];
    };
    return {
      sig,
      st,
      xlim: st ? st.xlim : fixLim(a.xlim),
      ylim: st ? st.ylim : fixLim(a.ylim),
      zlim: st ? st.zlim : fixLim(a.zlim),
      view: st ? st.view : nums(a.view).concat([0, 90]).slice(0, 2),
      zoom: st ? st.zoom : 1,
      pan: st ? st.pan : [0, 0],
    };
  }

  stateFor(L) {
    let st = this.vstate.get(L.a.id);
    if (!st) {
      st = {
        sig: L.v.sig,
        xlim: [...L.v.xlim],
        ylim: [...L.v.ylim],
        zlim: [...L.v.zlim],
        view: [...L.v.view],
        zoom: L.v.zoom,
        pan: [...L.v.pan],
      };
      this.vstate.set(L.a.id, st);
    }
    return st;
  }

  drawAxes(a, off) {
    const R = this.rectOf(a.pos, off);
    if (R.w <= 1 || R.h <= 1) return;
    const v = this.viewOf(a);
    const [az, el] = v.view;
    const is3d = !(Math.abs(el - 90) < 1e-9 && Math.abs(((az % 360) + 360) % 360) < 1e-9);
    const L = { a, R, v, is3d, pts: [], cmap: mat(a.colormap), clim: nums(a.clim) };
    if (L.cmap.m === 0) L.cmap = this.cmapFig;
    if (!(L.clim[1] > L.clim[0])) L.clim = [0, 1];
    this.layouts.push(L);
    if (is3d) this.drawAxes3D(L);
    else this.drawAxes2D(L);
  }

  tf(a, n) {
    return a[n + "scale"] === "log" ? (x) => (x > 0 ? Math.log10(x) : NaN) : (x) => x;
  }

  // ---------------------------------------------------------- 2D
  drawAxes2D(L) {
    const { a, R, v } = L;
    const ctx = this.ctx;
    const legendish = a.tag === "legend";
    const tx = this.tf(a, "x");
    const ty = this.tf(a, "y");
    let X0 = tx(v.xlim[0]);
    let X1 = tx(v.xlim[1]);
    let Y0 = ty(v.ylim[0]);
    let Y1 = ty(v.ylim[1]);
    if (!fin(X0) || !fin(X1) || X1 === X0) [X0, X1] = [0, 1];
    if (!fin(Y0) || !fin(Y1) || Y1 === Y0) [Y0, Y1] = [0, 1];
    const b = { ...R };
    if (!legendish && (a.darmode === "manual" || a.pbarmode === "manual")) {
      let rx;
      let ry;
      if (a.darmode === "manual") {
        const dar = nums(a.dar);
        rx = (X1 - X0) / (dar[0] || 1);
        ry = (Y1 - Y0) / (dar[1] || 1);
      } else {
        const pb = nums(a.pbar);
        rx = pb[0] || 1;
        ry = pb[1] || 1;
      }
      const want = Math.abs(rx / ry);
      if (fin(want) && want > 0) {
        if (b.w / b.h > want) {
          const nw = b.h * want;
          b.x += (b.w - nw) / 2;
          b.w = nw;
        } else {
          const nh = b.w / want;
          b.y += (b.h - nh) / 2;
          b.h = nh;
        }
      }
    }
    const xrev = a.xdir === "reverse";
    const yrev = a.ydir === "reverse";
    const fx = (x) => {
      const t = (tx(x) - X0) / (X1 - X0);
      return b.x + (xrev ? 1 - t : t) * b.w;
    };
    const fy = (y) => {
      const t = (ty(y) - Y0) / (Y1 - Y0);
      return b.y + (yrev ? t : 1 - t) * b.h;
    };
    const lx = a.xscale === "log";
    const ly = a.yscale === "log";
    L.b = b;
    L.T = { X0, X1, Y0, Y1, xrev, yrev, lx, ly };
    L.proj = (x, y) => [fx(x), fy(y), 0];
    L.inv = (sx, sy) => {
      let t = (sx - b.x) / b.w;
      if (xrev) t = 1 - t;
      let u = (sy - b.y) / b.h;
      u = yrev ? u : 1 - u;
      const xv = X0 + t * (X1 - X0);
      const yv = Y0 + u * (Y1 - Y0);
      return [lx ? Math.pow(10, xv) : xv, ly ? Math.pow(10, yv) : yv];
    };

    const vis = onoff(a.visible);
    const fs = num(a.fontsize, 10) * PT;
    const alw = Math.max(0.5, num(a.linewidth, 0.5) * PT);
    if (vis && css(a.color)) {
      ctx.fillStyle = css(a.color);
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }

    let xt = { ticks: [], labels: [], exp: 0 };
    let yt = { ticks: [], labels: [], exp: 0 };
    if (vis && !legendish) {
      xt = axisTicks(a, "x", v.xlim, Math.max(3, Math.floor(b.w / 60)));
      yt = axisTicks(a, "y", v.ylim, Math.max(3, Math.floor(b.h / 40)));
    }
    const drawGrid = () => {
      if (!vis || legendish) return;
      ctx.save();
      ctx.setLineDash([]);
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = css(a.gridcolor, clamp(num(a.gridalpha, 0.15) * 1.6, 0.08, 1)) || "rgba(0,0,0,0.2)";
      ctx.beginPath();
      if (onoff(a.xgrid))
        for (const t of xt.ticks) {
          const X = Math.round(fx(t)) + 0.5;
          ctx.moveTo(X, b.y);
          ctx.lineTo(X, b.y + b.h);
        }
      if (onoff(a.ygrid))
        for (const t of yt.ticks) {
          const Y = Math.round(fy(t)) + 0.5;
          ctx.moveTo(b.x, Y);
          ctx.lineTo(b.x + b.w, Y);
        }
      ctx.stroke();
      ctx.restore();
    };
    if (a.layer !== "top") drawGrid();

    // 데이터 (클리핑)
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x, b.y, b.w, b.h);
    ctx.clip();
    const texts = [];
    for (const o of arr(a.children)) {
      if (!o || !onoff(o.visible)) continue;
      if (o.type === "text") texts.push(o);
      else this.drawObj2D(o, L);
    }
    ctx.restore();
    if (a.layer === "top") drawGrid();

    // 축선, 눈금, 레이블
    let xLabelBottom = b.y + b.h;
    let yLabelLeft = b.x;
    if (vis) {
      ctx.save();
      ctx.setLineDash([]);
      ctx.lineWidth = alw;
      const xc = css(a.xcolor) || "#262626";
      const yc = css(a.ycolor) || "#262626";
      const xTop = a.xaxislocation === "top";
      const yRight = a.yaxislocation === "right";
      const xAxisY = xTop ? b.y : b.y + b.h;
      const yAxisX = yRight ? b.x + b.w : b.x;
      const tl = 5;
      const tin = a.tickdir !== "out";
      ctx.strokeStyle = xc;
      ctx.beginPath();
      ctx.moveTo(b.x, xAxisY);
      ctx.lineTo(b.x + b.w, xAxisY);
      if (onoff(a.box)) {
        const oy = xTop ? b.y + b.h : b.y;
        ctx.moveTo(b.x, oy);
        ctx.lineTo(b.x + b.w, oy);
      }
      for (const t of xt.ticks) {
        const X = fx(t);
        const d = (xTop ? 1 : -1) * (tin ? 1 : -1) * tl;
        ctx.moveTo(X, xAxisY);
        ctx.lineTo(X, xAxisY + d);
        if (onoff(a.box)) {
          const oy = xTop ? b.y + b.h : b.y;
          ctx.moveTo(X, oy);
          ctx.lineTo(X, oy - d);
        }
      }
      ctx.stroke();
      ctx.strokeStyle = yc;
      ctx.beginPath();
      ctx.moveTo(yAxisX, b.y);
      ctx.lineTo(yAxisX, b.y + b.h);
      if (onoff(a.box)) {
        const ox = yRight ? b.x : b.x + b.w;
        ctx.moveTo(ox, b.y);
        ctx.lineTo(ox, b.y + b.h);
      }
      for (const t of yt.ticks) {
        const Y = fy(t);
        const d = (yRight ? -1 : 1) * (tin ? 1 : -1) * tl;
        ctx.moveTo(yAxisX, Y);
        ctx.lineTo(yAxisX + d, Y);
        if (onoff(a.box)) {
          const ox = yRight ? b.x : b.x + b.w;
          ctx.moveTo(ox, Y);
          ctx.lineTo(ox - d, Y);
        }
      }
      ctx.stroke();

      // 눈금 레이블
      setFont(ctx, fs);
      const gap = tin ? 4 : tl + 4;
      ctx.fillStyle = xc;
      ctx.textAlign = "center";
      ctx.textBaseline = xTop ? "bottom" : "top";
      xt.ticks.forEach((t, i) => {
        ctx.fillText(xt.labels[i] ?? "", fx(t), xTop ? xAxisY - gap : xAxisY + gap);
      });
      if (xt.ticks.length) xLabelBottom = xTop ? xAxisY - gap - fs : xAxisY + gap + fs;
      if (xt.exp) {
        ctx.textAlign = "right";
        ctx.fillText("×10" + tex("^{" + xt.exp + "}"), b.x + b.w, xTop ? xLabelBottom - 2 : xLabelBottom + fs);
      }
      ctx.fillStyle = yc;
      ctx.textBaseline = "middle";
      ctx.textAlign = yRight ? "left" : "right";
      let maxw = 0;
      yt.ticks.forEach((t, i) => {
        const s = yt.labels[i] ?? "";
        maxw = Math.max(maxw, ctx.measureText(s).width);
        ctx.fillText(s, yRight ? yAxisX + gap : yAxisX - gap, fy(t));
      });
      yLabelLeft = yRight ? yAxisX + gap + maxw : yAxisX - gap - maxw;
      if (yt.exp) {
        ctx.textAlign = yRight ? "right" : "left";
        ctx.textBaseline = "bottom";
        ctx.fillText("×10" + tex("^{" + yt.exp + "}"), b.x, b.y - 2);
      }
      ctx.restore();

      // 축 레이블
      const xl = a.xlabel;
      if (xl && onoff(xl.visible) && !legendish) {
        const lines = textLines(xl);
        drawText(ctx, lines, b.x + b.w / 2, xTop ? xLabelBottom - 4 : xLabelBottom + 4, {
          size: num(xl.fontsize, 11) * PT,
          halign: "center",
          valign: xTop ? "bottom" : "top",
          color: css(xl.color) || xc,
          weight: xl.fontweight,
          angle: xl.fontangle,
        });
      }
      const yl = a.ylabel;
      if (yl && onoff(yl.visible) && !legendish) {
        const lines = textLines(yl);
        const sz = num(yl.fontsize, 11) * PT;
        drawText(ctx, lines, yRight ? yLabelLeft + 6 + sz / 2 : yLabelLeft - 6 - sz / 2, b.y + b.h / 2, {
          size: sz,
          halign: "center",
          valign: "middle",
          rotation: yRight ? -90 : 90,
          color: css(yl.color) || yc,
          weight: yl.fontweight,
          angle: yl.fontangle,
        });
      }
    }
    const t = a.title;
    if (t && onoff(t.visible)) {
      const xTop = vis && a.xaxislocation === "top";
      drawText(ctx, textLines(t), b.x + b.w / 2, (xTop ? xLabelBottom : b.y) - 6, {
        size: num(t.fontsize, 11) * PT,
        halign: "center",
        valign: "bottom",
        color: css(t.color) || "#000",
        weight: t.fontweight,
        angle: t.fontangle,
      });
    }
    for (const o of texts) this.drawDataText(o, L);
  }

  drawDataText(o, L) {
    let x;
    let y;
    const p = nums(o.pos);
    if (o.units === "normalized") {
      const b = L.b || L.R;
      x = b.x + p[0] * b.w;
      y = b.y + (1 - p[1]) * b.h;
    } else if (o.units === "pixels") {
      x = L.R.x + p[0];
      y = L.R.y + L.R.h - p[1];
    } else {
      [x, y] = L.proj(p[0], p[1], fin(p[2]) ? p[2] : 0);
    }
    if (!fin(x) || !fin(y)) return;
    drawText(this.ctx, textLines(o), x, y, {
      size: num(o.fontsize, 10) * PT,
      halign: o.halign,
      valign: o.valign,
      rotation: num(o.rotation, 0),
      color: css(o.color) || "#000",
      weight: o.fontweight,
      angle: o.fontangle,
      bg: css(o.bg),
      edge: css(o.edgecolor),
    });
  }

  pushPt(L, sx, sy, x, y, z) {
    if (L.pts.length < MAX_HOVER_PTS && fin(sx) && fin(sy)) L.pts.push([sx, sy, x, y, z]);
  }

  drawObj2D(o, L) {
    const ctx = this.ctx;
    const a = L.a;
    const P = L.proj;
    switch (o.type) {
      case "line": {
        const x = nums(o.x);
        const y = nums(o.y);
        const n = Math.min(x.length, y.length);
        const col = css(o.color) || "#000";
        const lw = Math.max(0.5, num(o.lw, 0.5) * PT);
        if (o.ls !== "none") {
          ctx.beginPath();
          let pen = false;
          for (let i = 0; i < n; i++) {
            const [sx, sy] = P(x[i], y[i]);
            if (!fin(sx) || !fin(sy)) {
              pen = false;
              continue;
            }
            const cx = clamp(sx, -1e6, 1e6);
            const cy = clamp(sy, -1e6, 1e6);
            if (pen) ctx.lineTo(cx, cy);
            else ctx.moveTo(cx, cy);
            pen = true;
          }
          ctx.setLineDash(dashFor(o.ls, lw));
          ctx.lineWidth = lw;
          ctx.strokeStyle = col;
          ctx.lineJoin = "round";
          ctx.lineCap = "butt";
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const [mec, mfc] = lineMarkerColors(o, col, a.color);
        const ms = num(o.ms, 6) * PT;
        for (let i = 0; i < n; i++) {
          const [sx, sy] = P(x[i], y[i]);
          if (o.marker && o.marker !== "none" && fin(sx) && fin(sy))
            drawMarker(ctx, o.marker, sx, sy, ms, mec, mfc, lw);
          this.pushPt(L, sx, sy, x[i], y[i]);
        }
        break;
      }
      case "patch":
        this.drawPatch(o, L, null);
        break;
      case "surface":
        this.drawSurface(o, L, null);
        break;
      case "image":
        this.drawImage(o, L);
        break;
      case "scatter":
        this.drawScatter(o, L, null);
        break;
      default:
    }
  }

  drawPatch(o, L, prims) {
    const ctx = this.ctx;
    const F = mat(o.faces);
    const V = mat(o.vertices);
    const C = mat(o.fvcdata);
    if (F.m === 0 || V.m === 0) return;
    const has3 = V.n >= 3;
    const fa = clamp(num(o.facealpha, 1), 0, 1);
    const ea = clamp(num(o.edgealpha, 1), 0, 1);
    const lw = Math.max(0.5, num(o.lw, 0.5) * PT);
    const vcol = (vi) => {
      // 정점 vi(0-based)의 색
      if (C.m === 0) return null;
      const r = C.m === V.m ? vi : 0;
      if (C.n === 3) return [C.at(r, 0), C.at(r, 1), C.at(r, 2)];
      return cmapColor(L.cmap, C.at(r, 0), L.clim, o.cdatamapping);
    };
    const fcol = (fi, idx) => {
      if (C.m === 0) return null;
      if (C.m === F.m && C.m !== V.m) {
        if (C.n === 3) return [C.at(fi, 0), C.at(fi, 1), C.at(fi, 2)];
        return cmapColor(L.cmap, C.at(fi, 0), L.clim, o.cdatamapping);
      }
      if (C.m === 1) return vcol(0);
      return vcol(idx[0]);
    };
    const colorFor = (spec, fi, idx) => {
      const c = rgbOf(spec);
      if (c) return c;
      if (spec === "none") return null;
      if (spec === "interp" && C.m === V.m) {
        const cs = idx.map(vcol).filter(Boolean);
        if (!cs.length) return null;
        return [0, 1, 2].map((k) => cs.reduce((s, q) => s + q[k], 0) / cs.length);
      }
      return fcol(fi, idx);
    };
    for (let fi = 0; fi < F.m; fi++) {
      const idx = [];
      for (let j = 0; j < F.n; j++) {
        const vi = F.at(fi, j);
        if (!fin(vi)) break;
        idx.push(vi - 1);
      }
      if (idx.length < 2) continue;
      const pts = [];
      let dsum = 0;
      let ok = true;
      for (const vi of idx) {
        const p = L.proj(V.at(vi, 0), V.at(vi, 1), has3 ? V.at(vi, 2) : 0);
        if (!fin(p[0]) || !fin(p[1])) {
          ok = false;
          break;
        }
        pts.push(p);
        dsum += p[2];
      }
      if (!ok) continue;
      const fc = colorFor(o.facecolor, fi, idx);
      const ec = colorFor(o.edgecolor, fi, idx);
      const prim = {
        d: dsum / pts.length,
        pts,
        fill: fc ? css(fc, fa) : null,
        stroke: ec && o.ls !== "none" ? css(ec, ea) : null,
        lw,
        dash: dashFor(o.ls, lw),
        closed: idx.length > 2,
      };
      if (prims) prims.push(prim);
      else this.drawPoly(ctx, prim);
    }
    if (o.marker && o.marker !== "none") {
      const col = rgbOf(o.edgecolor) ? css(o.edgecolor) : "#000";
      const [mec, mfc] = lineMarkerColors(o, col, L.a.color);
      for (let vi = 0; vi < V.m; vi++) {
        const p = L.proj(V.at(vi, 0), V.at(vi, 1), has3 ? V.at(vi, 2) : 0);
        if (prims) prims.push({ d: p[2], marker: o.marker, x: p[0], y: p[1], ms: num(o.ms, 6) * PT, mec, mfc, lw });
        else drawMarker(ctx, o.marker, p[0], p[1], num(o.ms, 6) * PT, mec, mfc, lw);
      }
    }
  }

  drawPoly(ctx, p) {
    if (p.marker) {
      drawMarker(ctx, p.marker, p.x, p.y, p.ms, p.mec, p.mfc, p.lw);
      return;
    }
    ctx.beginPath();
    p.pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
    if (p.closed) ctx.closePath();
    if (p.fill && p.closed) {
      ctx.fillStyle = p.fill;
      ctx.fill();
    }
    if (p.stroke) {
      ctx.setLineDash(p.dash || []);
      ctx.lineWidth = p.lw;
      ctx.strokeStyle = p.stroke;
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (p.fill && p.closed && !p.noSeam) {
      // 인접 면 사이 틈(안티앨리어싱) 메우기
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = p.fill;
      ctx.stroke();
    }
  }

  drawSurface(o, L, prims) {
    const ctx = this.ctx;
    const X = mat(o.x);
    const Y = mat(o.y);
    const Z = mat(o.z);
    let C = mat(o.c);
    const m = Z.m;
    const n = Z.n;
    if (m === 0 || n === 0) return;
    if (C.m === 0) C = Z;
    const xv = X.m * X.n === n && !(X.m === m && X.n === n);
    const yv = Y.m * Y.n === m && !(Y.m === m && Y.n === n);
    const gx = (i, j) => (xv ? X.d[j] : X.at(i, j));
    const gy = (i, j) => (yv ? Y.d[i] : Y.at(i, j));
    const fa = clamp(num(o.facealpha, 1), 0, 1);
    const ea = clamp(num(o.edgealpha, 1), 0, 1);
    const lw = Math.max(0.5, num(o.lw, 0.5) * PT);
    const P = new Array(m * n);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < m; i++) P[i + j * m] = L.proj(gx(i, j), gy(i, j), L.is3d ? Z.at(i, j) : 0);
    const rgbC = C.k === 3;
    const cAt = (i, j) => {
      if (rgbC) return [C.at(i, j, 0), C.at(i, j, 1), C.at(i, j, 2)];
      return cmapColor(L.cmap, C.at(i, j), L.clim, o.cdatamapping);
    };
    const cAvg = (i, j) => {
      if (rgbC) {
        return [0, 1, 2].map((k) => (C.at(i, j, k) + C.at(i + 1, j, k) + C.at(i, j + 1, k) + C.at(i + 1, j + 1, k)) / 4);
      }
      const v = (C.at(i, j) + C.at(i + 1, j) + C.at(i, j + 1) + C.at(i + 1, j + 1)) / 4;
      return cmapColor(L.cmap, v, L.clim, o.cdatamapping);
    };
    const faceSpec = o.facecolor;
    const edgeSpec = o.ls === "none" ? "none" : o.edgecolor;
    const quadColor = (spec, i, j) => {
      const c = rgbOf(spec);
      if (c) return c;
      if (spec === "none") return null;
      if (spec === "interp") return cAvg(i, j);
      return cAt(i, j);
    };
    const edgeConst = rgbOf(edgeSpec);
    const strokePerQuad = prims || (!edgeConst && edgeSpec !== "none");
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < m - 1; i++) {
        const q = [P[i + j * m], P[i + 1 + j * m], P[i + 1 + (j + 1) * m], P[i + (j + 1) * m]];
        if (q.some((p) => !fin(p[0]) || !fin(p[1]))) continue;
        const fc = quadColor(faceSpec, i, j);
        const ec = strokePerQuad ? quadColor(edgeSpec, i, j) : null;
        const prim = {
          d: (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4,
          pts: q,
          fill: fc ? css(fc, fa) : null,
          stroke: ec ? css(ec, ea) : null,
          lw,
          closed: true,
        };
        if (prims) prims.push(prim);
        else this.drawPoly(ctx, prim);
      }
    }
    // 2D에서 단색 엣지는 격자선으로 한 번에
    if (!prims && edgeConst) {
      ctx.beginPath();
      for (let i = 0; i < m; i++) {
        let pen = false;
        for (let j = 0; j < n; j++) {
          const p = P[i + j * m];
          if (!fin(p[0]) || !fin(p[1])) {
            pen = false;
            continue;
          }
          if (pen) ctx.lineTo(p[0], p[1]);
          else ctx.moveTo(p[0], p[1]);
          pen = true;
        }
      }
      for (let j = 0; j < n; j++) {
        let pen = false;
        for (let i = 0; i < m; i++) {
          const p = P[i + j * m];
          if (!fin(p[0]) || !fin(p[1])) {
            pen = false;
            continue;
          }
          if (pen) ctx.lineTo(p[0], p[1]);
          else ctx.moveTo(p[0], p[1]);
          pen = true;
        }
      }
      ctx.setLineDash(dashFor(o.ls, lw));
      ctx.lineWidth = lw;
      ctx.strokeStyle = css(edgeConst, ea);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (o.marker && o.marker !== "none") {
      const col = edgeConst ? css(edgeConst) : "#000";
      const [mec, mfc] = lineMarkerColors(o, col, L.a.color);
      for (let k = 0; k < m * n; k++) {
        const p = P[k];
        if (prims) prims.push({ d: p[2], marker: o.marker, x: p[0], y: p[1], ms: num(o.ms, 6) * PT, mec, mfc, lw });
        else drawMarker(ctx, o.marker, p[0], p[1], num(o.ms, 6) * PT, mec, mfc, lw);
      }
    }
  }

  drawScatter(o, L, prims) {
    const ctx = this.ctx;
    const x = nums(o.x);
    const y = nums(o.y);
    const z = nums(o.z);
    const n = Math.min(x.length, y.length);
    const S = nums(o.sizedata);
    const C = mat(o.c);
    const lw = Math.max(0.5, num(o.lw, 0.5) * PT);
    const colAt = (i) => {
      if (C.m * C.n === 3 && C.k === 1 && !(C.m === n && n === 3 && C.n === 1)) return [C.d[0], C.d[1], C.d[2]];
      if (C.n === 3 && C.m === n) return [C.at(i, 0), C.at(i, 1), C.at(i, 2)];
      if (C.m * C.n === n) return cmapColor(L.cmap, C.d[i], L.clim, "scaled");
      return [0, 0.447, 0.741];
    };
    for (let i = 0; i < n; i++) {
      const p = L.proj(x[i], y[i], z.length ? z[i] : 0);
      if (!fin(p[0]) || !fin(p[1])) continue;
      const c = colAt(i);
      const pc = css(c) || "#000";
      const edge = o.mec === "none" ? null : o.mec === "flat" || o.mec === "auto" ? pc : css(o.mec);
      const face = o.mfc === "none" ? null : o.mfc === "flat" ? pc : o.mfc === "auto" ? css(L.a.color) : css(o.mfc);
      const sz = Math.sqrt(Math.max(1, S.length > 1 ? S[i] : S[0] || 36)) * PT;
      if (prims) prims.push({ d: p[2], marker: o.marker || "o", x: p[0], y: p[1], ms: sz, mec: edge, mfc: face, lw });
      else drawMarker(ctx, o.marker || "o", p[0], p[1], sz, edge, face, lw);
      this.pushPt(L, p[0], p[1], x[i], y[i], z.length ? z[i] : undefined);
    }
  }

  drawImage(o, L) {
    if (!o.src) return;
    let ent = this.images.get(o.src);
    if (!ent) {
      const img = new Image();
      ent = { img, ok: false };
      img.onload = () => {
        ent.ok = true;
        this.requestDraw();
      };
      img.src = o.src;
      this.images.set(o.src, ent);
      if (this.images.size > 64) this.images.delete(this.images.keys().next().value);
    }
    if (!ent.ok) return;
    const cols = num(o.cols, ent.img.width);
    const rows = num(o.rows, ent.img.height);
    const xd = nums(o.xdata);
    const yd = nums(o.ydata);
    const x1 = xd[0];
    const x2 = xd.length > 1 ? xd[xd.length - 1] : x1 + cols - 1;
    const y1 = yd[0];
    const y2 = yd.length > 1 ? yd[yd.length - 1] : y1 + rows - 1;
    const dx = cols > 1 ? (x2 - x1) / (cols - 1) : 1;
    const dy = rows > 1 ? (y2 - y1) / (rows - 1) : 1;
    // 첫 행/열 쪽 모서리와 마지막 행/열 쪽 모서리
    const [ax, ay] = L.proj(x1 - dx / 2, y1 - dy / 2);
    const [bx, by] = L.proj(x2 + dx / 2, y2 + dy / 2);
    if (![ax, ay, bx, by].every(fin)) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(ax, ay);
    ctx.scale((bx - ax) / ent.img.width, (by - ay) / ent.img.height);
    ctx.drawImage(ent.img, 0, 0);
    ctx.restore();
  }

  // ---------------------------------------------------------- 3D
  drawAxes3D(L) {
    const { a, R, v } = L;
    const ctx = this.ctx;
    const tr = ["x", "y", "z"].map((n) => this.tf(a, n));
    const lims = [v.xlim, v.ylim, v.zlim];
    const L0 = lims.map((l, i) => tr[i](l[0]));
    const L1 = lims.map((l, i) => tr[i](l[1]));
    for (let i = 0; i < 3; i++) if (!fin(L0[i]) || !fin(L1[i]) || L0[i] === L1[i]) [L0[i], L1[i]] = [0, 1];
    const rev = ["x", "y", "z"].map((n) => a[n + "dir"] === "reverse");
    let asp = [1, 1, 1];
    if (a.darmode === "manual") {
      const dar = nums(a.dar);
      asp = [0, 1, 2].map((i) => Math.abs(L1[i] - L0[i]) / (dar[i] || 1));
    } else if (a.pbarmode === "manual") {
      asp = nums(a.pbar).slice(0, 3);
    }
    const mx = Math.max(...asp.map((q) => (fin(q) ? q : 0))) || 1;
    asp = asp.map((q) => (fin(q) && q > 0 ? q / mx : 1));
    const [az, el] = v.view;
    const A = (az * Math.PI) / 180;
    const E = (el * Math.PI) / 180;
    const ca = Math.cos(A);
    const sa = Math.sin(A);
    const ce = Math.cos(E);
    const se = Math.sin(E);
    const rad = 0.5 * Math.hypot(asp[0], asp[1], asp[2]);
    const kk = (Math.min(R.w, R.h) / (2 * rad)) * 0.98 * v.zoom;
    const cx = R.x + R.w / 2 + v.pan[0];
    const cy = R.y + R.h / 2 + v.pan[1];
    // 단위 큐브 좌표 q∈[0,1]^3 → 화면
    const PQ = (qx, qy, qz) => {
      const px = (qx - 0.5) * asp[0];
      const py = (qy - 0.5) * asp[1];
      const pz = (qz - 0.5) * asp[2];
      const X = ca * px + sa * py;
      const Y = -se * sa * px + se * ca * py + ce * pz;
      const D = ce * sa * px - ce * ca * py + se * pz;
      return [cx + X * kk, cy - Y * kk, D];
    };
    const q = (val, i) => {
      const t = (tr[i](val) - L0[i]) / (L1[i] - L0[i]);
      return rev[i] ? 1 - t : t;
    };
    L.proj = (x, y, z) => PQ(q(x, 0), q(y, 1), q(fin(z) ? z : L0[2] <= 0 && L1[2] >= 0 ? 0 : v.zlim[0], 2));
    L.b = R;
    L.PQ = PQ;

    const vis = onoff(a.visible);
    const fs = num(a.fontsize, 10) * PT;
    const alw = Math.max(0.5, num(a.linewidth, 0.5) * PT);
    const backX = ce * sa > 0 ? 0 : 1;
    const backY = -ce * ca > 0 ? 0 : 1;
    const backZ = se > 0 ? 0 : 1;
    const ticks = ["x", "y", "z"].map((n, i) => {
      if (!vis) return { ticks: [], labels: [], exp: 0 };
      return axisTicks(a, n, lims[i], 5);
    });
    const qt = ticks.map((t, i) => t.ticks.map((val) => q(val, i)));
    const seg = (p, r) => {
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(r[0], r[1]);
    };

    ctx.save();
    ctx.beginPath();
    ctx.rect(R.x, R.y, R.w, R.h);
    ctx.clip();

    if (vis) {
      // 뒤쪽 세 면 칠하기 + 격자
      if (css(a.color)) {
        ctx.fillStyle = css(a.color);
        const faces = [
          [[backX, 0, 0], [backX, 1, 0], [backX, 1, 1], [backX, 0, 1]],
          [[0, backY, 0], [1, backY, 0], [1, backY, 1], [0, backY, 1]],
          [[0, 0, backZ], [1, 0, backZ], [1, 1, backZ], [0, 1, backZ]],
        ];
        for (const f of faces) {
          ctx.beginPath();
          f.map((c) => PQ(...c)).forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.setLineDash([]);
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = css(a.gridcolor, clamp(num(a.gridalpha, 0.15) * 1.6, 0.08, 1)) || "rgba(0,0,0,0.2)";
      ctx.beginPath();
      if (onoff(a.xgrid))
        for (const t of qt[0]) {
          seg(PQ(t, 0, backZ), PQ(t, 1, backZ));
          seg(PQ(t, backY, 0), PQ(t, backY, 1));
        }
      if (onoff(a.ygrid))
        for (const t of qt[1]) {
          seg(PQ(0, t, backZ), PQ(1, t, backZ));
          seg(PQ(backX, t, 0), PQ(backX, t, 1));
        }
      if (onoff(a.zgrid))
        for (const t of qt[2]) {
          seg(PQ(backX, 0, t), PQ(backX, 1, t));
          seg(PQ(0, backY, t), PQ(1, backY, t));
        }
      ctx.stroke();
      // 뒤쪽 면 테두리
      ctx.lineWidth = alw;
      ctx.strokeStyle = css(a.xcolor, 0.6) || "rgba(38,38,38,0.6)";
      ctx.beginPath();
      const sq = (pts) => pts.forEach((c, i) => seg(PQ(...c), PQ(...pts[(i + 1) % pts.length])));
      sq([[backX, 0, 0], [backX, 1, 0], [backX, 1, 1], [backX, 0, 1]]);
      sq([[0, backY, 0], [1, backY, 0], [1, backY, 1], [0, backY, 1]]);
      sq([[0, 0, backZ], [1, 0, backZ], [1, 1, backZ], [0, 1, backZ]]);
      ctx.stroke();
    }

    // 데이터: 면이 있으면 깊이 정렬(화가 알고리즘)
    const kids = arr(a.children).filter((o) => o && onoff(o.visible));
    const hasFaces = kids.some((o) => o.type === "surface" || o.type === "patch");
    const texts = [];
    if (hasFaces) {
      const prims = [];
      for (const o of kids) {
        if (o.type === "text") texts.push(o);
        else if (o.type === "surface") this.drawSurface(o, L, prims);
        else if (o.type === "patch") this.drawPatch(o, L, prims);
        else if (o.type === "scatter") this.drawScatter(o, L, prims);
        else if (o.type === "line") this.line3DPrims(o, L, prims);
      }
      prims.sort((p, r) => p.d - r.d);
      for (const p of prims) {
        p.noSeam = false;
        this.drawPoly(ctx, p);
      }
    } else {
      for (const o of kids) {
        if (o.type === "text") texts.push(o);
        else if (o.type === "line") this.line3D(o, L);
        else if (o.type === "scatter") this.drawScatter(o, L, null);
      }
    }

    if (vis && onoff(a.box)) {
      ctx.setLineDash([]);
      ctx.lineWidth = alw;
      ctx.strokeStyle = css(a.xcolor) || "#262626";
      ctx.beginPath();
      for (const y of [0, 1]) for (const z of [0, 1]) seg(PQ(0, y, z), PQ(1, y, z));
      for (const x of [0, 1]) for (const z of [0, 1]) seg(PQ(x, 0, z), PQ(x, 1, z));
      for (const x of [0, 1]) for (const y of [0, 1]) seg(PQ(x, y, 0), PQ(x, y, 1));
      ctx.stroke();
    }
    ctx.restore();

    if (vis) {
      // 눈금과 레이블 (앞쪽 아래 모서리)
      const C0 = PQ(0.5, 0.5, 0.5);
      const outward = (p) => {
        const dx = p[0] - C0[0];
        const dy = p[1] - C0[1];
        const d = Math.hypot(dx, dy) || 1;
        return [dx / d, dy / d];
      };
      const fy = 1 - backY;
      const fx = 1 - backX;
      const zEdgeA = [fx, backY];
      const zEdgeB = [backX, fy];
      const pa = PQ(zEdgeA[0], zEdgeA[1], 0.5);
      const pb = PQ(zEdgeB[0], zEdgeB[1], 0.5);
      const zE = pa[0] <= pb[0] ? zEdgeA : zEdgeB;
      const edges = [
        { i: 0, at: (t) => PQ(t, fy, backZ), mid: PQ(0.5, fy, backZ), lab: a.xlabel, col: a.xcolor },
        { i: 1, at: (t) => PQ(fx, t, backZ), mid: PQ(fx, 0.5, backZ), lab: a.ylabel, col: a.ycolor },
        { i: 2, at: (t) => PQ(zE[0], zE[1], t), mid: PQ(zE[0], zE[1], 0.5), lab: a.zlabel, col: a.zcolor },
      ];
      for (const E2 of edges) {
        const col = css(E2.col) || "#262626";
        const dir = E2.i === 2 ? [-1, 0] : outward(E2.mid);
        ctx.strokeStyle = col;
        ctx.fillStyle = col;
        ctx.lineWidth = alw;
        ctx.setLineDash([]);
        ctx.beginPath();
        seg(E2.at(0), E2.at(1));
        ctx.stroke();
        setFont(ctx, fs);
        let maxw = 0;
        const t = ticks[E2.i];
        ctx.beginPath();
        qt[E2.i].forEach((qq, k) => {
          const p = E2.at(qq);
          seg(p, [p[0] + dir[0] * 4, p[1] + dir[1] * 4]);
          const s = t.labels[k] ?? "";
          maxw = Math.max(maxw, ctx.measureText(s).width);
          const lp = [p[0] + dir[0] * 9, p[1] + dir[1] * 9];
          ctx.textAlign = dir[0] > 0.35 ? "left" : dir[0] < -0.35 ? "right" : "center";
          ctx.textBaseline = dir[1] > 0.35 ? "top" : dir[1] < -0.35 ? "bottom" : "middle";
          ctx.fillText(s, lp[0], lp[1]);
        });
        ctx.stroke();
        const lab = E2.lab;
        if (lab && onoff(lab.visible)) {
          const lines = textLines(lab);
          if (lines.join("").length) {
            const dist = 22 + (Math.abs(dir[0]) > 0.5 ? maxw : fs * 0.6);
            drawText(ctx, lines, E2.mid[0] + dir[0] * dist, E2.mid[1] + dir[1] * dist, {
              size: num(lab.fontsize, 11) * PT,
              halign: "center",
              valign: "middle",
              rotation: E2.i === 2 ? 90 : 0,
              color: css(lab.color) || col,
              weight: lab.fontweight,
            });
          }
        }
      }
    }
    const t = a.title;
    if (t && onoff(t.visible)) {
      drawText(ctx, textLines(t), R.x + R.w / 2, R.y - 4, {
        size: num(t.fontsize, 11) * PT,
        halign: "center",
        valign: "bottom",
        color: css(t.color) || "#000",
        weight: t.fontweight,
      });
    }
    for (const o of texts) this.drawDataText(o, L);
  }

  line3D(o, L) {
    const ctx = this.ctx;
    const x = nums(o.x);
    const y = nums(o.y);
    const z = nums(o.z);
    const n = Math.min(x.length, y.length);
    const col = css(o.color) || "#000";
    const lw = Math.max(0.5, num(o.lw, 0.5) * PT);
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(L.proj(x[i], y[i], z.length ? z[i] : NaN));
    if (o.ls !== "none") {
      ctx.beginPath();
      let pen = false;
      for (const p of pts) {
        if (!fin(p[0]) || !fin(p[1])) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(p[0], p[1]);
        else ctx.moveTo(p[0], p[1]);
        pen = true;
      }
      ctx.setLineDash(dashFor(o.ls, lw));
      ctx.lineWidth = lw;
      ctx.strokeStyle = col;
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const [mec, mfc] = lineMarkerColors(o, col, L.a.color);
    pts.forEach((p, i) => {
      if (o.marker && o.marker !== "none") drawMarker(ctx, o.marker, p[0], p[1], num(o.ms, 6) * PT, mec, mfc, lw);
      this.pushPt(L, p[0], p[1], x[i], y[i], z.length ? z[i] : undefined);
    });
  }

  line3DPrims(o, L, prims) {
    const x = nums(o.x);
    const y = nums(o.y);
    const z = nums(o.z);
    const n = Math.min(x.length, y.length);
    const col = css(o.color) || "#000";
    const lw = Math.max(0.5, num(o.lw, 0.5) * PT);
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(L.proj(x[i], y[i], z.length ? z[i] : NaN));
    if (o.ls !== "none")
      for (let i = 0; i + 1 < n; i++) {
        const p = pts[i];
        const r = pts[i + 1];
        if (![p[0], p[1], r[0], r[1]].every(fin)) continue;
        // 선은 같은 깊이의 면보다 살짝 앞에
        prims.push({ d: (p[2] + r[2]) / 2 + 1e-4, pts: [p, r], stroke: col, lw, dash: dashFor(o.ls, lw), closed: false });
      }
    const [mec, mfc] = lineMarkerColors(o, col, L.a.color);
    pts.forEach((p, i) => {
      if (o.marker && o.marker !== "none") prims.push({ d: p[2] + 2e-4, marker: o.marker, x: p[0], y: p[1], ms: num(o.ms, 6) * PT, mec, mfc, lw });
      this.pushPt(L, p[0], p[1], x[i], y[i], z.length ? z[i] : undefined);
    });
  }

  // ---------------------------------------------------------- legend
  drawLegend(o, off) {
    if (!onoff(o.visible)) return;
    const ctx = this.ctx;
    const items = arr(o.items);
    const strings = strs(o.strings).map((s) => tex(s, "tex"));
    const n = Math.min(items.length || strings.length, strings.length);
    if (!n) return;
    const fs = num(o.fontsize, 9) * PT;
    setFont(ctx, fs);
    const sample = 26;
    const rowh = fs * 1.45;
    const horiz = o.orientation === "horizontal";
    const widths = strings.slice(0, n).map((s) => ctx.measureText(s).width);
    const entW = (i) => 6 + sample + 6 + widths[i] + 6;
    let W;
    let H;
    if (horiz) {
      W = widths.reduce((s, w, i) => s + entW(i), 0) + 4;
      H = rowh + 6;
    } else {
      W = Math.max(...widths.map((w, i) => entW(i))) + 4;
      H = rowh * n + 6;
    }
    const L = this.layouts.find((l) => l.a.id === o.axes) || this.layouts[this.layouts.length - 1];
    let x;
    let y;
    const loc = String(o.location || "northeast").toLowerCase();
    if (L && loc !== "none") {
      const b = L.b || L.R;
      const pad = 6;
      const out = loc.endsWith("outside");
      const base = out ? loc.replace("outside", "") : loc === "best" ? "northeast" : loc;
      x = b.x + b.w - W - pad;
      y = b.y + pad;
      if (base.includes("west")) x = b.x + pad;
      if (base === "north" || base === "south") x = b.x + (b.w - W) / 2;
      if (base.includes("south")) y = b.y + b.h - H - pad;
      if (base === "east" || base === "west") y = b.y + (b.h - H) / 2;
      if (out) {
        if (base.includes("east")) x = b.x + b.w + pad;
        else if (base.includes("west")) x = b.x - W - pad;
        else if (base === "north") y = b.y - H - pad;
        else if (base === "south") y = b.y + b.h + pad;
      }
    } else {
      const r = this.rectOf(o.pos, off);
      x = r.x;
      y = r.y;
    }
    if (onoff(o.box)) {
      ctx.fillStyle = css(o.color) || "#fff";
      ctx.fillRect(x, y, W, H);
      ctx.strokeStyle = css(o.edgecolor) || "#262626";
      ctx.lineWidth = 0.75;
      ctx.setLineDash([]);
      ctx.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
    }
    let cx = x + 2;
    for (let i = 0; i < n; i++) {
      const it = items[i] || {};
      const ex = horiz ? cx : x + 2;
      const ey = horiz ? y + 3 + rowh / 2 : y + 3 + rowh * (i + 0.5);
      const sx0 = ex + 6;
      const sx1 = sx0 + sample;
      if (it.kind === "patch" || it.kind === "surface") {
        const fc = css(it.facecolor) || (it.facecolor === "flat" || it.facecolor === "interp" ? "#3d6fc4" : null);
        if (fc) {
          ctx.fillStyle = fc;
          ctx.fillRect(sx0 + 4, ey - fs * 0.4, sample - 8, fs * 0.8);
        }
        const ec = css(it.edgecolor);
        if (ec) {
          ctx.strokeStyle = ec;
          ctx.lineWidth = 0.75;
          ctx.strokeRect(sx0 + 4, ey - fs * 0.4, sample - 8, fs * 0.8);
        }
      } else {
        const col = css(it.color) || "#000";
        const lw = Math.max(0.5, num(it.lw, 0.5) * PT);
        if (it.ls !== "none") {
          ctx.beginPath();
          ctx.moveTo(sx0, ey);
          ctx.lineTo(sx1, ey);
          ctx.setLineDash(dashFor(it.ls, lw));
          ctx.lineWidth = lw;
          ctx.strokeStyle = col;
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const [mec, mfc] = lineMarkerColors(it, col, [1, 1, 1]);
        drawMarker(ctx, it.marker, (sx0 + sx1) / 2, ey, num(it.ms, 6) * PT, mec, mfc, lw);
      }
      setFont(ctx, fs);
      ctx.fillStyle = css(o.textcolor) || "#000";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillText(strings[i], sx1 + 6, ey);
      cx += entW(i);
    }
  }

  // -------------------------------------------------------------- uicontrol
  syncControls() {
    const seen = new Set();
    const walk = (children, off, group) => {
      for (const o of arr(children)) {
        if (!o || typeof o !== "object") continue;
        if (o.type === "uicontrol") {
          seen.add(o.id);
          this.syncControl(o, off, group);
        } else if (o.type === "uipanel" || o.type === "uibuttongroup") {
          if (!onoff(o.visible)) continue;
          const p = nums(o.pos);
          walk(o.children, { x: off.x + (p[0] || 0), y: off.y + (p[1] || 0) }, o.type === "uibuttongroup" ? o : null);
        }
      }
    };
    walk(this.fig.children, { x: 0, y: 0 }, null);
    for (const [id, c] of this.controls) {
      if (!seen.has(id)) {
        c.el.remove();
        this.controls.delete(id);
      }
    }
  }

  syncControl(u, off, group) {
    const style = String(u.style || "pushbutton");
    let c = this.controls.get(u.id);
    const key = style + (style === "edit" ? (num(u.max, 1) - num(u.min, 0) > 1 ? "m" : "s") : "") + (style === "listbox" ? (num(u.max, 1) - num(u.min, 0) > 1 ? "m" : "s") : "");
    if (c && c.key !== key) {
      c.el.remove();
      this.controls.delete(u.id);
      c = null;
    }
    if (!c) {
      c = this.makeControl(u, style, key);
      this.controls.set(u.id, c);
      this.layer.appendChild(c.el);
    }
    c.u = u;
    c.group = group;
    const R = this.rectOf(u.pos, off);
    const st = c.el.style;
    st.left = R.x + "px";
    st.top = R.y + "px";
    st.width = Math.max(0, R.w) + "px";
    st.height = Math.max(0, R.h) + "px";
    st.display = onoff(u.visible) ? "" : "none";
    st.fontSize = num(u.fontsize, 10) * PT + "px";
    st.fontWeight = u.fontweight === "bold" ? "bold" : "normal";
    st.color = css(u.fg) || "#000";
    const bg = css(u.bg);
    if (style !== "slider") st.backgroundColor = bg || "";
    c.el.title = u.tooltip || "";
    const enabled = u.enable === "on" || u.enable === true;
    c.disable(!enabled || this.closed);
    if (u.enable === "inactive") c.el.classList.add("owf-inactive");
    else c.el.classList.remove("owf-inactive");
    c.update(u, R);
  }

  makeControl(u, style, key) {
    const id = u.id;
    const el = document.createElement("div");
    el.className = "owf-ctl owf-" + style;
    const c = { el, key, style, u, update: () => {}, disable: () => {} };
    const send = (kind, value) => this.queue({ obj: id, kind, value });
    const strings = (uu) => {
      const s = strs(uu.string);
      if (s.length === 1 && s[0].includes("|")) return s[0].split("|");
      return s;
    };
    switch (style) {
      case "slider": {
        const inp = document.createElement("input");
        inp.type = "range";
        inp.step = "any";
        el.appendChild(inp);
        const down = () => this.dragging.add(id);
        const up = () => this.dragging.delete(id);
        inp.addEventListener("pointerdown", down);
        inp.addEventListener("pointerup", up);
        inp.addEventListener("pointercancel", up);
        inp.addEventListener("input", () => {
          if (this.model.get("live_slider")) send("value", +inp.value);
        });
        inp.addEventListener("change", () => {
          up();
          send("value", +inp.value);
        });
        c.update = (uu, R) => {
          inp.min = num(uu.min, 0);
          inp.max = num(uu.max, 1);
          const ss = nums(uu.sliderstep);
          const span = num(uu.max, 1) - num(uu.min, 0);
          inp.step = ss.length && fin(ss[0]) && ss[0] > 0 && span > 0 ? String(ss[0] * span) : "any";
          inp.classList.toggle("vertical", R.h > R.w);
          if (!this.dragging.has(id) && document.activeElement !== inp) inp.value = num(uu.value, 0);
        };
        c.disable = (d) => (inp.disabled = d);
        break;
      }
      case "pushbutton":
      case "togglebutton": {
        const b = document.createElement("button");
        b.type = "button";
        el.appendChild(b);
        b.addEventListener("click", () => {
          if (style === "pushbutton") send("press", null);
          else {
            const on = num(c.u.value, 0) === num(c.u.max, 1);
            const nv = on ? num(c.u.min, 0) : num(c.u.max, 1);
            c.u.value = nv;
            b.classList.toggle("pressed", !on);
            send("value", nv);
          }
        });
        c.update = (uu) => {
          b.textContent = strings(uu).join(" ");
          b.style.color = css(uu.fg) || "";
          b.style.backgroundColor = css(uu.bg) || "";
          b.style.fontSize = "inherit";
          b.classList.toggle("pressed", style === "togglebutton" && num(uu.value, 0) === num(uu.max, 1));
        };
        c.disable = (d) => (b.disabled = d);
        break;
      }
      case "checkbox":
      case "radiobutton": {
        const lab = document.createElement("label");
        const inp = document.createElement("input");
        inp.type = style === "checkbox" ? "checkbox" : "radio";
        const span = document.createElement("span");
        lab.appendChild(inp);
        lab.appendChild(span);
        el.appendChild(lab);
        inp.addEventListener("click", (e) => {
          const uu = c.u;
          if (style === "radiobutton" && c.group) {
            // 버튼 그룹: 즉시 하나만 선택된 것으로 보여주고 서버에 알림
            c.group.selected = uu.id;
            for (const other of this.controls.values())
              if (other.group && other.group.id === c.group.id && other.style === "radiobutton")
                other.el.querySelector("input").checked = other.u.id === uu.id;
            send("select", null);
            return;
          }
          if (style === "radiobutton") {
            // 단독 라디오 버튼은 토글
            const on = num(uu.value, 0) === num(uu.max, 1);
            inp.checked = !on;
            e.preventDefault();
            setTimeout(() => (inp.checked = !on), 0);
            send("value", on ? num(uu.min, 0) : num(uu.max, 1));
            return;
          }
          send("value", inp.checked ? num(uu.max, 1) : num(uu.min, 0));
        });
        c.update = (uu) => {
          span.textContent = strings(uu).join(" ");
          inp.checked = c.group && c.group.selected ? c.group.selected === uu.id : num(uu.value, 0) === num(uu.max, 1);
        };
        c.disable = (d) => (inp.disabled = d);
        break;
      }
      case "edit": {
        const multi = key.endsWith("m");
        const inp = document.createElement(multi ? "textarea" : "input");
        if (!multi) inp.type = "text";
        el.appendChild(inp);
        inp.addEventListener("change", () => send("string", inp.value));
        if (!multi)
          inp.addEventListener("keydown", (e) => {
            if (e.key === "Enter") inp.blur();
          });
        c.update = (uu) => {
          if (document.activeElement !== inp) inp.value = strings(uu).join("\n");
          inp.style.textAlign = uu.halign || "center";
          inp.style.backgroundColor = css(uu.bg) || "#fff";
          inp.style.color = css(uu.fg) || "#000";
        };
        c.disable = (d) => (inp.disabled = d);
        break;
      }
      case "popupmenu": {
        const sel = document.createElement("select");
        el.appendChild(sel);
        sel.addEventListener("change", () => send("value", sel.selectedIndex + 1));
        c.update = (uu) => {
          const s = strings(uu);
          if (sel.options.length !== s.length || [...sel.options].some((op, i) => op.text !== s[i])) {
            sel.innerHTML = "";
            for (const t of s) {
              const op = document.createElement("option");
              op.text = t;
              sel.add(op);
            }
          }
          if (document.activeElement !== sel) sel.selectedIndex = clamp(num(uu.value, 1) - 1, 0, s.length - 1);
        };
        c.disable = (d) => (sel.disabled = d);
        break;
      }
      case "listbox": {
        const sel = document.createElement("select");
        sel.size = 4;
        sel.multiple = key.endsWith("m");
        el.appendChild(sel);
        sel.addEventListener("change", () => {
          const v = [...sel.options].map((op, i) => (op.selected ? i + 1 : 0)).filter(Boolean);
          send("value", sel.multiple ? v : v[0] || 1);
        });
        c.update = (uu) => {
          const s = strings(uu);
          if (sel.options.length !== s.length || [...sel.options].some((op, i) => op.text !== s[i])) {
            sel.innerHTML = "";
            for (const t of s) {
              const op = document.createElement("option");
              op.text = t;
              sel.add(op);
            }
          }
          const v = nums(uu.value);
          [...sel.options].forEach((op, i) => (op.selected = v.includes(i + 1)));
        };
        c.disable = (d) => (sel.disabled = d);
        break;
      }
      case "frame":
        break;
      default: {
        // text 등
        c.update = (uu) => {
          el.textContent = strings(uu).join("\n");
          el.style.textAlign = uu.halign || "center";
        };
      }
    }
    return c;
  }

  // -------------------------------------------------------------- 커널 통신
  queue(ev) {
    if (this.closed) return;
    const key = ev.obj;
    if (ev.kind === "value" && this.lastSent.get(key) === JSON.stringify(ev.value) && !this.pending.has(key) && !this.inflight) {
      return; // 같은 값 반복 (드래그 끝 change 이벤트 등)
    }
    this.pending.delete(key);
    this.pending.set(key, ev);
    this.pump();
  }

  pump() {
    if (this.inflight || this.closed) return;
    const it = this.pending.values().next();
    if (it.done) return;
    const ev = it.value;
    this.pending.delete(ev.obj);
    this.seq += 1;
    this.inflight = this.seq;
    this.lastSent.set(ev.obj, JSON.stringify(ev.value));
    this.setBusy(true);
    this.model.send({ type: "event", obj: ev.obj, kind: ev.kind, value: ev.value, seq: this.seq });
    clearTimeout(this.ackTimer);
    this.ackTimer = setTimeout(() => {
      // 응답이 없으면 막히지 않게 풀어준다
      this.inflight = 0;
      this.setBusy(false);
      this.pump();
    }, 20000);
  }

  message(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "ack") {
      if (!msg.seq || msg.seq === this.inflight) {
        this.inflight = 0;
        clearTimeout(this.ackTimer);
      }
      this.setBusy(!!this.inflight);
      if (msg.out) this.log(msg.out, !!msg.error);
      this.pump();
    } else if (msg.type === "log") {
      this.log(msg.text, !!msg.error);
    }
  }

  // -------------------------------------------------------------- 마우스
  figPoint(e) {
    const r = this.canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / this.scale, (e.clientY - r.top) / this.scale];
  }

  hitAxes(fx, fy) {
    for (let i = this.layouts.length - 1; i >= 0; i--) {
      const L = this.layouts[i];
      if (L.a.tag === "legend" || L.a.tag === "colorbar") continue;
      const R = L.is3d ? L.R : L.b;
      if (fx >= R.x && fx <= R.x + R.w && fy >= R.y && fy <= R.y + R.h) return L;
    }
    return null;
  }

  pointerDown(e) {
    const [fx, fy] = this.figPoint(e);
    const L = this.hitAxes(fx, fy);
    if (!L) return;
    e.preventDefault();
    this.hideTip();
    let action;
    if (e.button === 2 || e.ctrlKey) action = L.is3d ? "pan3" : "pan";
    else if (this.mode === "rotate") action = "rotate";
    else if (this.mode === "pan") action = L.is3d ? "pan3" : e.shiftKey ? "box" : "pan";
    else action = L.is3d ? "rotate" : e.shiftKey ? "box" : "pan";
    const st = this.stateFor(L);
    this.drag = {
      L,
      id: L.a.id,
      action,
      x0: fx,
      y0: fy,
      st0: JSON.parse(JSON.stringify(st)),
      b0: L.b ? { ...L.b } : null,
      T0: L.T ? { ...L.T } : null,
    };
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.style.cursor = action === "rotate" ? "grabbing" : action === "box" ? "crosshair" : "move";
  }

  pointerMove(e) {
    const [fx, fy] = this.figPoint(e);
    const d = this.drag;
    if (!d) {
      this.hover(fx, fy);
      return;
    }
    const st = this.vstate.get(d.id);
    if (!st) return;
    const dx = fx - d.x0;
    const dy = fy - d.y0;
    if (d.action === "rotate") {
      st.view = [d.st0.view[0] - dx * 0.5, clamp(d.st0.view[1] + dy * 0.5, -90, 90)];
      if (Math.abs(st.view[1] - 90) < 1e-6 && Math.abs(st.view[0] % 360) < 1e-6) st.view[1] = 89.999;
      this.readout.textContent = `az ${fmtNum(+(((st.view[0] % 360) + 540) % 360 - 180).toFixed(1))}°, el ${st.view[1].toFixed(1)}°`;
    } else if (d.action === "pan3") {
      st.pan = [d.st0.pan[0] + dx, d.st0.pan[1] + dy];
    } else if (d.action === "pan" && d.T0) {
      const T = d.T0;
      const b = d.b0;
      const sx = ((T.xrev ? 1 : -1) * dx * (T.X1 - T.X0)) / b.w;
      const sy = ((T.yrev ? -1 : 1) * dy * (T.Y1 - T.Y0)) / b.h;
      const back = (v, lg) => (lg ? Math.pow(10, v) : v);
      st.xlim = [back(T.X0 + sx, T.lx), back(T.X1 + sx, T.lx)];
      st.ylim = [back(T.Y0 + sy, T.ly), back(T.Y1 + sy, T.ly)];
    } else if (d.action === "box" && d.b0) {
      const s = this.scale;
      const x = Math.min(fx, d.x0);
      const y = Math.min(fy, d.y0);
      Object.assign(this.band.style, {
        display: "block",
        left: x * s + "px",
        top: y * s + "px",
        width: Math.abs(dx) * s + "px",
        height: Math.abs(dy) * s + "px",
      });
      return;
    }
    this.requestDraw();
  }

  pointerUp(e) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.canvas.style.cursor = "";
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch (_) {
      /* 무시 */
    }
    if (d.action === "box") {
      this.band.style.display = "none";
      const [fx, fy] = this.figPoint(e);
      if (Math.abs(fx - d.x0) > 4 && Math.abs(fy - d.y0) > 4) {
        const L = this.layouts.find((l) => l.a.id === d.id);
        const st = this.vstate.get(d.id);
        if (L && L.inv && st) {
          const p = L.inv(d.x0, d.y0);
          const q = L.inv(fx, fy);
          st.xlim = [Math.min(p[0], q[0]), Math.max(p[0], q[0])];
          st.ylim = [Math.min(p[1], q[1]), Math.max(p[1], q[1])];
          this.draw();
        }
      }
    }
  }

  wheel(e) {
    const [fx, fy] = this.figPoint(e);
    const L = this.hitAxes(fx, fy);
    if (!L) return;
    e.preventDefault();
    const st = this.stateFor(L);
    const f = Math.exp(clamp(e.deltaY, -300, 300) * 0.0015);
    if (L.is3d) {
      st.zoom = clamp(st.zoom / f, 0.1, 50);
    } else if (L.T) {
      const T = L.T;
      const b = L.b;
      let tx = (fx - b.x) / b.w;
      if (T.xrev) tx = 1 - tx;
      let ty = 1 - (fy - b.y) / b.h;
      if (T.yrev) ty = 1 - ty;
      const cxv = T.X0 + tx * (T.X1 - T.X0);
      const cyv = T.Y0 + ty * (T.Y1 - T.Y0);
      const back = (v, lg) => (lg ? Math.pow(10, v) : v);
      if (!e.altKey) st.xlim = [back(cxv - (cxv - T.X0) * f, T.lx), back(cxv + (T.X1 - cxv) * f, T.lx)];
      if (!e.shiftKey) st.ylim = [back(cyv - (cyv - T.Y0) * f, T.ly), back(cyv + (T.Y1 - cyv) * f, T.ly)];
    }
    this.requestDraw();
  }

  dblclick(e) {
    const [fx, fy] = this.figPoint(e);
    const L = this.hitAxes(fx, fy);
    if (!L) return;
    this.vstate.delete(L.a.id);
    this.draw();
  }

  hover(fx, fy) {
    const L = this.hitAxes(fx, fy);
    if (!L) {
      this.hideTip();
      this.readout.textContent = "";
      return;
    }
    if (!L.is3d && L.inv) {
      const [x, y] = L.inv(fx, fy);
      this.readout.textContent = `x ${fmtNum(x)}, y ${fmtNum(y)}`;
    } else {
      const [az, el] = L.v.view;
      this.readout.textContent = `az ${fmtNum(az)}°, el ${fmtNum(el)}°`;
    }
    const r2 = Math.pow(8 / this.scale, 2);
    let best = null;
    let bd = r2;
    for (const p of L.pts) {
      const dd = (p[0] - fx) ** 2 + (p[1] - fy) ** 2;
      if (dd < bd) {
        bd = dd;
        best = p;
      }
    }
    if (!best) {
      this.hideTip();
      return;
    }
    let txt = `x: ${fmtNum(best[2])}\ny: ${fmtNum(best[3])}`;
    if (best[4] !== undefined && L.is3d) txt += `\nz: ${fmtNum(best[4])}`;
    this.tip.textContent = txt;
    const s = this.scale;
    this.tip.style.display = "block";
    this.tip.style.left = best[0] * s + 10 + "px";
    this.tip.style.top = best[1] * s - 10 + "px";
    this.tipDot = best;
  }

  hideTip() {
    this.tip.style.display = "none";
  }

  savePNG() {
    const name = (this.titleEl.textContent || "figure").replace(/[^\w\-가-힣 ]+/g, "_") + ".png";
    this.canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
  }
}

function render({ model, el }) {
  const view = new FigView(model, el);
  return () => view.destroy();
}

export default { render };
export { render, tex, linTicks, fmtTicks };
