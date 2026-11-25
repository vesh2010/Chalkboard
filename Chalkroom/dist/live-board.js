// Each row has an ordered set of ink strokes. Their measured lengths drive
// both the moving pen and the reveal, including on wrapped lines.
window.liveInk = (() => {
  const ns = 'http://www.w3.org/2000/svg';
  let frame, finish, context, noiseGain, enabled = true, pointerCleanup;
  const rows = new WeakMap();
  const glyphLengths = new Map();
  const fallbackWidths = new Map();
  const maxGlyphCache = 512;
  const lowPower = (navigator.hardwareConcurrency || 4) <= 4;
  function remember(cache, key, value) {
    if (cache.size >= maxGlyphCache) cache.delete(cache.keys().next().value);
    cache.set(key, value);
    return value;
  }

  const colorPalette = {
    teal: '#81e1cb',
    mint: '#81e1cb',
    orange: '#ffbb77',
    amber: '#ffb347',
    gold: '#ffd166',
    yellow: '#ffe66d',
    coral: '#ff8fa3',
    pink: '#ff758f',
    cyan: '#70d6ff',
    blue: '#72b01d',
    green: '#70e000',
    purple: '#c77dff',
    white: '#f4edcf',
    chalk: '#f4edcf'
  };

  function resolveColor(c) {
    if (!c) return '#81e1cb';
    return colorPalette[c] || (typeof c === 'string' ? c : '#81e1cb');
  }

  function element(type, attrs) {
    const el = document.createElementNS(ns, type);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    return el;
  }

  function sound(on) {
    if (noiseGain) noiseGain.gain.setTargetAtTime(on && enabled ? .042 : 0, context.currentTime, .018);
  }

  function unlock() {
    try {
      if (!context) {
        context = new AudioContext();
        const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (.6 + .4 * Math.sin(i / context.sampleRate * 47));
        const noise = context.createBufferSource();
        noise.buffer = buffer; noise.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass'; filter.frequency.value = 2500; filter.Q.value = .8;
        noiseGain = context.createGain(); noiseGain.gain.value = 0;
        noise.connect(filter).connect(noiseGain).connect(context.destination);
        noise.start();
      }
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch { /* The visual board also works on devices without Web Audio. */ }
  }

  function stop() {
    cancelAnimationFrame(frame);
    if (finish) finish();
    finish = null;
    pointerCleanup?.();
    pointerCleanup = null;
    sound(false);
  }

  // Smooth spline curve for chalk sketches
  function smoothPath(pts, closed = false) {
    if (pts.length < 3) {
      return pts.map(([a, b], i) => (i ? 'L' : 'M') + a.toFixed(1) + ',' + b.toFixed(1)).join(' ');
    }
    const n = pts.length;
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    const count = closed ? n : n - 1;
    for (let i = 0; i < count; i++) {
      const p0 = closed ? pts[(i - 1 + n) % n] : (i === 0 ? pts[0] : pts[i - 1]);
      const p1 = pts[i % n];
      const p2 = pts[(i + 1) % n];
      const p3 = closed ? pts[(i + 2) % n] : (i + 2 >= n ? p2 : pts[i + 2]);

      const cp1x = p1[0] + (p2[0] - p0[0]) / 5.5;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 5.5;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 5.5;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 5.5;

      d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    if (closed) d += ' Z';
    return d;
  }

  function render(row, text, drawing) {
    const width = Math.max(290, Math.min(760, row.clientWidth || 550));
    const svg = element('svg', {class: 'ink-sheet', width: '100%', role: 'img', 'aria-label': text});
    row.replaceChildren(svg);

    // Subtle soft chalk glow
    const defs = element('defs', {});
    const filter = element('filter', {id: 'chalk-soft', x: '-12%', y: '-12%', width: '124%', height: '124%'});
    const blur = element('feGaussianBlur', {stdDeviation: '0.42', result: 'blur'});
    const merge = element('feMerge', {});
    const m1 = element('feMergeNode', {in: 'blur'});
    const m2 = element('feMergeNode', {in: 'SourceGraphic'});
    merge.append(m1, m2);
    filter.append(blur, merge);
    defs.append(filter);
    svg.append(defs);

    const strokes = [];
    let x = 5, y = 4;

    function path(d, dx, dy, color, thickness = 1.8, fill = 'none') {
      const p = element('path', {
        d,
        transform: 'translate(' + dx + ' ' + dy + ')',
        fill: fill || 'none',
        stroke: color,
        'stroke-width': thickness,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      });
      svg.append(p);
      const length = glyphLengths.has(d) ? glyphLengths.get(d) :
        remember(glyphLengths, d, p.getTotalLength());
      strokes.push({p, dx, dy, length});
      return p;
    }

    function write(char) {
      const glyph = window.penFont?.[char.codePointAt(0) - 33];
      if (glyph?.d) {
        path(glyph.d, x, y, '#f4edcf', 1.8);
        x += glyph.o * 2 + 1;
      } else {
        const label = element('text', {x, y: y + 22, 'font-size': 22, fill: '#f4edcf', 'font-family': 'Inter, "Segoe UI", sans-serif'});
        label.textContent = char; svg.append(label);
        strokes.push({label, length: 16, dx: x, dy: y + 18});
        const measured = fallbackWidths.has(char) ? fallbackWidths.get(char) :
          remember(fallbackWidths, char, label.getComputedTextLength() || 16);
        x += measured;
      }
    }

    const advance = char => (window.penFont?.[char.codePointAt(0) - 33]?.o || 8) * 2 + 1;
    for (const word of text.trim().split(/\s+/u)) {
      if (x > 5 && x + [...word].reduce((n, c) => n + advance(c), 0) > width - 6) { x = 5; y += 32; }
      for (const c of word) {
        if (x > 5 && x + advance(c) > width - 6) { x = 5; y += 32; }
        write(c);
      }
      x += 9;
    }

    let height = text ? y + 34 : 0;

    if (Array.isArray(drawing)) {
      const unit = (width - 24) / 100;
      const sketchTop = height + 4;
      let bottom = 0;

      for (const mark of drawing.slice(0, 60)) {
        if (!mark) continue;
        const color = resolveColor(mark.color);
        const thickness = mark.thickness || 2.4;
        const fill = mark.fill || 'none';

        // 1. Direct SVG path command (d) support
        if (typeof mark.d === 'string') {
          const dx = 8 + (mark.dx != null ? mark.dx * unit : 0);
          const dy = sketchTop + (mark.dy != null ? mark.dy * unit : 0);
          path(mark.d, dx, dy, color, thickness, fill);
          if (mark.height != null) bottom = Math.max(bottom, mark.height * unit);
        }

        // 2. Shape primitives: circle, rect
        if (mark.circle) {
          const cx = 8 + mark.circle.cx * unit;
          const cy = sketchTop + mark.circle.cy * unit;
          const r = mark.circle.r * unit;
          const cPath = `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy}`;
          path(cPath, 0, 0, color, thickness, fill);
          bottom = Math.max(bottom, mark.circle.cy * unit + r);
        }

        if (mark.rect) {
          const rx = 8 + mark.rect.x * unit;
          const ry = sketchTop + mark.rect.y * unit;
          const rw = mark.rect.w * unit;
          const rh = mark.rect.h * unit;
          const rad = (mark.rect.rx || 3) * unit;
          const rPath = `M ${rx + rad} ${ry} H ${rx + rw - rad} A ${rad} ${rad} 0 0 1 ${rx + rw} ${ry + rad} V ${ry + rh - rad} A ${rad} ${rad} 0 0 1 ${rx + rw - rad} ${ry + rh} H ${rx + rad} A ${rad} ${rad} 0 0 1 ${rx} ${ry + rh - rad} V ${ry + rad} A ${rad} ${rad} 0 0 1 ${rx + rad} ${ry} Z`;
          path(rPath, 0, 0, color, thickness, fill);
          bottom = Math.max(bottom, (mark.rect.y + mark.rect.h) * unit);
        }

        // 3. Points array with smooth curve support
        const pts = mark.points;
        if (Array.isArray(pts) && pts.length >= 1 && pts.every(pt => Array.isArray(pt) && pt.length === 2 && pt.every(Number.isFinite))) {
          const isClosed = pts.length > 2 && pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1];
          const scaled = pts.map(([a, b]) => [a * unit, b * unit]);

          if (pts.length > 1) {
            const d = mark.smooth === false ? scaled.map(([a, b], i) => (i ? 'L' : 'M') + a.toFixed(1) + ',' + b.toFixed(1)).join(' ') : smoothPath(scaled, isClosed);
            path(d, 8, sketchTop, color, thickness, fill);
          }
          bottom = Math.max(bottom, ...scaled.map(pt => pt[1]));

          if (typeof mark.label === 'string' && mark.label.trim()) {
            const [a, b] = pts.at(-1);
            const labelX = Math.max(4, Math.min(8 + a * unit, width - 110));
            const labelY = sketchTop + b * unit + 18;
            const label = element('text', {
              x: labelX,
              y: labelY,
              'font-size': 13.5,
              'font-weight': '600',
              'font-family': 'Inter, "Segoe UI", sans-serif',
              fill: color,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))'
            });
            label.textContent = mark.label.slice(0, 50);
            svg.append(label);
            strokes.push({label, length: 20, dx: labelX, dy: labelY});
            bottom = Math.max(bottom, b * unit + 24);
          }
        }
      }
      if (bottom) height = sketchTop + bottom + 10;
    }

    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.style.aspectRatio = width + ' / ' + height;

    // Glowing chalk stylus tip
    const tip = element('g', {class: 'chalk-tip', visibility: 'hidden'});
    const halo = element('circle', {r: 5.5, fill: '#ffd166', opacity: '0.45'});
    const core = element('circle', {r: 2.8, fill: '#ffffff'});
    tip.append(halo, core);
    svg.append(tip);

    rows.set(row, {strokes, tip, svg, text: text.trim(), width});
  }

  function removeNode(node) {
    if (node?.remove) node.remove();
    else if (node?.parentNode?.removeChild) node.parentNode.removeChild(node);
    else {
      for (const ink of [node?._ink].filter(Boolean)) ink.svg.children = ink.svg.children.filter(child => child !== node);
    }
  }

  function textUnderline(ink, phrase) {
    const source = ink.text.toLowerCase();
    const needle = String(phrase || '').trim().toLowerCase();
    const start = source.indexOf(needle);
    if (start < 0) return;
    let x = 5, y = 4, startX = 5, startY = 4, endX = 5;
    const advance = char => (window.penFont?.[char.codePointAt(0) - 33]?.o || 5.5) * 2 + 1;
    for (let i = 0; i < ink.text.length; i++) {
      const char = ink.text[i];
      const amount = /\s/u.test(char) ? 9 : advance(char);
      if (x > 5 && x + amount > ink.width - 6) { x = 5; y += 32; }
      if (i === start) { startX = x; startY = y; }
      x += amount;
      if (i < start + needle.length) endX = x;
    }
    return {d:`M${Math.round(startX)} ${Math.round(startY + 28)} H${Math.round(endX)}`};
  }

  function inferredPhrase(text, narration) {
    const words = String(narration).toLowerCase().match(/[a-z0-9]+/g) || [];
    const board = String(text).toLowerCase();
    let best = '';
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j <= words.length; j++) {
        const candidate = words.slice(i,j).join(' ');
        if (candidate.length > best.length && board.includes(candidate)) best = candidate;
      }
    }
    return best.length > 3 ? best : '';
  }

  function pointer(row, picture, narration, target = {}) {
    pointerCleanup?.();
    let marker, ink;
    const labelNeedle = String(target.label || '').toLowerCase();
    const pictureInk = picture && rows.get(picture);
    const labelStroke = labelNeedle && pictureInk?.strokes.find(item => String(item.label?.textContent || '').toLowerCase() === labelNeedle);
    if (labelStroke) {
      ink = pictureInk;
      marker = element('path',{class:'chalk-pointer',d:`M${Math.round(labelStroke.dx)} ${Math.round(labelStroke.dy + 4)} h72`,stroke:'#ffd166','stroke-width':3,fill:'none'});
    } else {
      ink = rows.get(row);
      const phrase = target.phrase || inferredPhrase(ink?.text,narration);
      const line = ink && textUnderline(ink,phrase);
      if (line) marker = element('path',{class:'chalk-pointer',d:line.d,stroke:'#ffd166','stroke-width':3,fill:'none'});
    }
    if (marker) marker._ink = ink;
    const spoken = String(target.spoken || target.label || target.phrase || inferredPhrase(ink?.text,narration)).toLowerCase();
    const start = String(narration).toLowerCase().indexOf(spoken);
    const end = start < 0 ? -1 : start + spoken.length;
    let visible = false;
    const clear = () => { if (visible) removeNode(marker); visible = false; };
    pointerCleanup = clear;
    return position => {
      const active = marker && start >= 0 && position >= start && position < end;
      if (active && !visible) { ink.svg.append(marker); visible = true; }
      else if (!active) clear();
    };
  }

  function play(row, onComplete) {
    stop();
    const ink = rows.get(row);
    if (!ink || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const {strokes, tip} = ink;
    const total = strokes.reduce((sum, s) => sum + s.length, 0);
    if (!total) return;

    for (const s of strokes) {
      if (s.p) {
        s.p.style.strokeDasharray = s.length + ' ' + (s.length + 1);
        s.p.style.strokeDashoffset = s.length + 1;
      } else {
        s.label.style.opacity = 0;
      }
    }

    finish = () => {
      for (const s of strokes) {
        if (s.p) {
          s.p.style.strokeDasharray = '';
          s.p.style.strokeDashoffset = '';
        } else {
          s.label.style.opacity = 1;
        }
      }
      tip.setAttribute('visibility', 'hidden');
    };

    let index = 0, done = 0;
    const start = performance.now();
    const duration = Math.min(7500, Math.max(550, total * 1.3));

    let previousTipFrame = 0;
    function tick(now) {
      const distance = total * Math.min(1, (now - start) / duration);
      while (index < strokes.length && done + strokes[index].length <= distance) {
        const s = strokes[index++];
        if (s.p) s.p.style.strokeDashoffset = 0;
        else s.label.style.opacity = 1;
        done += s.length;
      }
      if (index === strokes.length) {
        stop();
        onComplete?.();
        return;
      }
      const s = strokes[index];
      sound(Boolean(s.p));
      if (s.p) {
        const offset = Math.max(0, distance - done);
        s.p.style.strokeDashoffset = s.length - offset;
        if (!lowPower || now - previousTipFrame >= 32) {
          const point = s.p.getPointAtLength(offset);
          tip.setAttribute('transform', 'translate(' + (point.x + s.dx) + ' ' + (point.y + s.dy) + ')');
          previousTipFrame = now;
        }
        tip.setAttribute('visibility', 'visible');
      } else {
        s.label.style.opacity = 1;
        tip.setAttribute('visibility', 'hidden');
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
  }

  function playSequence(elements) {
    const queue = [...elements];
    const next = () => {
      const row = queue.shift();
      if (row) play(row, next);
    };
    next();
  }

  return {
    render,
    play,
    playSequence,
    pointer,
    stop,
    unlock,
    setSound(value) {
      enabled = value;
      if (!value) sound(false);
    }
  };
})();
