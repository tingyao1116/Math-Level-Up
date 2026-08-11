
    const familyButtons = document.getElementById('familyButtons');
    const coreBaseEq = document.getElementById('coreBaseEq');
    const coreMapInfo = document.getElementById('coreMapInfo');
    const coreAfterExpr = document.getElementById('coreAfterExpr');
    const coreFocusInfo = document.getElementById('coreFocusInfo');
    const coreAfterTitle = document.getElementById('coreAfterTitle');
    const coreBeforeCanvas = document.getElementById('coreBeforeCanvas');
    const coreAfterCanvas = document.getElementById('coreAfterCanvas');
    const coreParamInputs = document.getElementById('coreParamInputs');

    const absModeButtons = document.getElementById('absModeButtons');
    const absFamilyButtons = document.getElementById('absFamilyButtons');
    const absModeInfo = document.getElementById('absModeInfo');
    const absBase = document.getElementById('absBase');
    const absAfter = document.getElementById('absAfter');
    const absExplain = document.getElementById('absExplain');
    const absFocusInfo = document.getElementById('absFocusInfo');
    const afterTitle = document.getElementById('afterTitle');
    const beforeCanvas = document.getElementById('beforeCanvas');
    const afterCanvas = document.getElementById('afterCanvas');

    function normalize(v) {
      const n = parseFloat(v);
      return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
    }

    function isZero(v) { return Math.abs(normalize(v)) < 1e-9; }

    function formatNum(v) {
      const n = normalize(v);
      const abs = Math.abs(n);
      if (abs >= 1000) return n.toFixed(0);
      if (abs >= 10) return n.toFixed(2);
      if (abs >= 1) return n.toFixed(2);
      return n.toFixed(3);
    }

    function formatSigned(v) {
      const n = normalize(v);
      if (isZero(n)) return '';
      return `${n > 0 ? ' + ' : ' - '}${formatNum(Math.abs(n))}`;
    }

    function formatScale(a, expr) {
      const n = normalize(a);
      if (isZero(n)) return '0';
      if (Math.abs(n - 1) < 1e-9) return expr;
      if (Math.abs(n + 1) < 1e-9) return `-${expr}`;
      return `${formatNum(n)}${expr}`;
    }

    function shiftExpr(v, base) {
      const n = normalize(v);
      if (isZero(n)) return base;
      return n > 0 ? `${base} - (${formatNum(n)})` : `${base} + (${formatNum(-n)})`;
    }

    function valueText(v) {
      const n = normalize(v);
      if (isZero(n)) return '0';
      return String(n);
    }

    function sampleExplicit(fn, xMin, xMax, steps) {
      const pts = [];
      const step = (xMax - xMin) / steps;
      for (let i = 0; i <= steps; i++) {
        const x = xMin + i * step;
        const y = fn(x);
        if (Number.isFinite(y)) pts.push({ x, y });
      }
      return pts;
    }

    function sampleCircle(cx, cy, r, steps = 720) {
      const pts = [];
      const step = (Math.PI * 2) / steps;
      for (let i = 0; i <= steps; i++) {
        const t = i * step;
        pts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
      }
      return pts;
    }

    function sampleEllipse(cx, cy, a, b, steps = 720) {
      const pts = [];
      const step = (Math.PI * 2) / steps;
      for (let i = 0; i <= steps; i++) {
        const t = i * step;
        pts.push({ x: cx + a * Math.cos(t), y: cy + b * Math.sin(t) });
      }
      return pts;
    }

    function pointInWindow(p, w) {
      return !w || (p.x >= w.xMin - 1e-9 && p.x <= w.xMax + 1e-9 && p.y >= w.yMin - 1e-9 && p.y <= w.yMax + 1e-9);
    }

    function collectBounds(points, w) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of points) {
        if (!pointInWindow(p, w)) continue;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      if (!Number.isFinite(minX)) {
        for (const p of points) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
      }
      if (minX === maxX) { minX -= 1; maxX += 1; }
      if (minY === maxY) { minY -= 1; maxY += 1; }
      const padX = (maxX - minX) * 0.14 + 0.8;
      const padY = (maxY - minY) * 0.14 + 0.8;
      return { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
    }

    function mergeBounds(a, b) {
      return {
        minX: Math.min(a.minX, b.minX),
        maxX: Math.max(a.maxX, b.maxX),
        minY: Math.min(a.minY, b.minY),
        maxY: Math.max(a.maxY, b.maxY)
      };
    }

    function clipPoints(points, w) {
      if (!w) return points;
      const clipped = points.filter((p) => pointInWindow(p, w));
      return clipped.length > 1 ? clipped : points;
    }

    function makeCanvasContext(canvas) {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(280, rect.width);
      const height = Math.max(280, rect.height);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx, width, height };
    }

    function drawCurve(ctxInfo, points, bounds, color, lineWidth = 2.4) {
      const { ctx, width, height } = ctxInfo;
      const margin = 34;
      const spanX = bounds.maxX - bounds.minX;
      const spanY = bounds.maxY - bounds.minY;
      const plotW = width - margin * 2;
      const plotH = height - margin * 2;
      const scale = Math.min(plotW / spanX, plotH / spanY);
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;
      const xMid = margin + plotW / 2;
      const yMid = margin + plotH / 2;
      const toX = (x) => xMid + (x - centerX) * scale;
      const toY = (y) => yMid - (y - centerY) * scale;

      ctx.clearRect(0, 0, width, height);

      // grid
      ctx.strokeStyle = '#edf1f7';
      ctx.lineWidth = 1;
      const gridCount = 6;
      for (let i = 1; i < gridCount; i++) {
        const gx = margin + (plotW / gridCount) * i;
        const gy = margin + (plotH / gridCount) * i;
        ctx.beginPath();
        ctx.moveTo(gx, margin);
        ctx.lineTo(gx, height - margin);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(margin, gy);
        ctx.lineTo(width - margin, gy);
        ctx.stroke();
      }

      // axis
      const xAxis = toY(0);
      const yAxis = toX(0);
      ctx.strokeStyle = '#b7c7dd';
      ctx.beginPath();
      if (yAxis >= margin && yAxis <= width - margin) {
        ctx.moveTo(margin, yAxis);
        ctx.lineTo(width - margin, yAxis);
      }
      if (xAxis >= margin && xAxis <= height - margin) {
        ctx.moveTo(xAxis, margin);
        ctx.lineTo(xAxis, height - margin);
      }
      ctx.stroke();

      if (!points.length) return;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      const first = points[0];
      ctx.moveTo(toX(first.x), toY(first.y));
      for (let i = 1; i < points.length; i++) {
        const p = points[i];
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        ctx.lineTo(toX(p.x), toY(p.y));
      }
      ctx.stroke();
    }

    const coreFamilies = {
      quadratic: {
        label: '鈭活?賣',
        baseEq: '\\(y=x^2\\)',
        focus: { xMin: -6, xMax: 6, yMin: -2, yMax: 22 },
        paramDefs: [
          { key: 'a', label: 'a嚗?銝葬?橘?', min: -4, max: 4, step: 0.1, default: 1 },
          { key: 'h', label: 'h嚗椰?喃?蝘鳴?', min: -3, max: 3, step: 0.1, default: 0 },
          { key: 'k', label: 'k嚗?銝?蝘鳴?', min: -4, max: 4, step: 0.1, default: 0 }
        ],
        basePoints: () => sampleExplicit((x) => x * x, -6, 6, 900),
        afterPoints: ({ a, h, k }) => sampleExplicit((x) => a * Math.pow(x - h, 2) + k, -6, 6, 900),
        afterEq: ({ a, h, k }) => `\\(y=${formatScale(a, `(${shiftExpr(h, 'x')})^2`) }${formatSigned(k)}\\)`,
        mapText: ({ a, h, k }) => `\\((x,y)\\to(x,${formatScale(a, `(${shiftExpr(h, 'x')})^2`) }${formatSigned(k)} )\\)`
      },
      cubic: {
        label: '銝活?賣',
        baseEq: '\\(y=x^3\\)',
        focus: { xMin: -3.5, xMax: 3.5, yMin: -45, yMax: 45 },
        paramDefs: [
          { key: 'a', label: 'a嚗?銝撓蝮殷?', min: -4, max: 4, step: 0.1, default: 1 },
          { key: 'h', label: 'h嚗椰?喳像蝘鳴?', min: -2.2, max: 2.2, step: 0.1, default: 0 },
          { key: 'k', label: 'k嚗?銝像蝘鳴?', min: -4, max: 4, step: 0.1, default: 0 }
        ],
        basePoints: () => sampleExplicit((x) => x * x * x, -3.2, 3.2, 900),
        afterPoints: ({ a, h, k }) => sampleExplicit((x) => a * Math.pow(x - h, 3) + k, -3.8, 3.8, 900),
        afterEq: ({ a, h, k }) => `\\(y=${formatScale(a, `(${shiftExpr(h, 'x')})^3`) }${formatSigned(k)}\\)`,
        mapText: ({ a, h, k }) => `\\((x,y)\\to(x,${formatScale(a, `(${shiftExpr(h, 'x')})^3`) }${formatSigned(k)} )\\)`
      },
      trig: {
        label: '銝??賣',
        baseEq: '\\(y=\\sin x\\)',
        focus: { xMin: -7, xMax: 7, yMin: -3.5, yMax: 3.5 },
        paramDefs: [
          { key: 'a', label: 'a嚗撟?', min: -3, max: 3, step: 0.1, default: 1 },
          { key: 'b', label: 'b嚗 隡貊葬嚗?, min: 0.2, max: 4, step: 0.1, default: 1 },
          { key: 'c', label: 'c嚗椰?喳像蝘鳴?', min: -6.5, max: 6.5, step: 0.1, default: 0 },
          { key: 'd', label: 'd嚗?銝像蝘鳴?', min: -3, max: 3, step: 0.1, default: 0 }
        ],
        basePoints: () => sampleExplicit((x) => Math.sin(x), -Math.PI * 2.2, Math.PI * 2.2, 1400),
        afterPoints: ({ a, b, c, d }) => sampleExplicit((x) => a * Math.sin(b * x + c) + d, -Math.PI * 2.2, Math.PI * 2.2, 1400),
        afterEq: ({ a, b, c, d }) => `\\(y=${formatScale(a, `\\sin(${formatNum(b)}x${formatSigned(c)})`)}${formatSigned(d)}\\)`,
        mapText: ({ a, b, c, d }) => `\\((x,y)\\to(x,${formatScale(a, `\\sin(${formatNum(b)}x${formatSigned(c)})`)}${formatSigned(d)} )\\)`
      },
      exponential: {
        label: '??賣',
        baseEq: '\\(y=e^x\\)',
        focus: { xMin: -3.2, xMax: 3.2, yMin: -2, yMax: 9 },
        paramDefs: [
          { key: 'a', label: 'a嚗?嚗?, min: -3, max: 3, step: 0.1, default: 1 },
          { key: 'b', label: 'b嚗 憯葬嚗?, min: 0.2, max: 4, step: 0.1, default: 1 },
          { key: 'c', label: 'c嚗椰?喳像蝘鳴?', min: -2, max: 2, step: 0.1, default: 0 },
          { key: 'd', label: 'd嚗?銝像蝘鳴?', min: -3, max: 3, step: 0.1, default: 0 }
        ],
        basePoints: () => sampleExplicit((x) => Math.exp(x), -3.2, 3.2, 900),
        afterPoints: ({ a, b, c, d }) => sampleExplicit((x) => a * Math.exp(b * (x - c)) + d, -3.2, 3.2, 900),
        afterEq: ({ a, b, c, d }) => `\\(y=${formatScale(a, `e^{${formatNum(b)}(x-${formatNum(c)})}`)}${formatSigned(d)}\\)`,
        mapText: ({ a, b, c, d }) => `\\((x,y)\\to(x,${formatScale(a, `e^{${formatNum(b)}(x-${formatNum(c)})}`)}${formatSigned(d)} )\\)`
      },
      logarithm: {
        label: '撠?賣',
        baseEq: '\\(y=\\ln x\\)',
        focus: { xMin: 0.1, xMax: 8, yMin: -3, yMax: 3 },
        paramDefs: [
          { key: 'a', label: 'a嚗?嚗?, min: -4, max: 4, step: 0.1, default: 1 },
          { key: 'c', label: 'c嚗椰?喳像蝘鳴?', min: 0.2, max: 4, step: 0.1, default: 1 },
          { key: 'd', label: 'd嚗?銝像蝘鳴?', min: -3, max: 3, step: 0.1, default: 0 }
        ],
        basePoints: () => sampleExplicit((x) => Math.log(x), 0.02, 8, 900),
        afterPoints: ({ a, c, d }) => sampleExplicit((x) => a * Math.log(x - c) + d, c + 0.02, 10, 900),
        afterEq: ({ a, c, d }) => `\\(y=${formatScale(a, `\\ln(x-${formatNum(c)})`)}${formatSigned(d)}\\)`,
        mapText: ({ a, c, d }) => `\\((x,y)\\to(x,${formatScale(a, `\\ln(x-${formatNum(c)})`)}${formatSigned(d)} )\\)`
      },
      circle: {
        label: '?蝔?',
        baseEq: '\\((x-2)^2+y^2=4\\)',
        focus: { xMin: -1.2, xMax: 5.2, yMin: -2.8, yMax: 2.8 },
        paramDefs: [
          { key: 'h', label: 'h嚗?敹?x嚗?, min: -1, max: 5, step: 0.1, default: 2 },
          { key: 'k', label: 'k嚗?敹?y嚗?, min: -3, max: 3, step: 0.1, default: 0 },
          { key: 'r', label: 'r嚗?敺?', min: 0.5, max: 4, step: 0.1, default: 2 }
        ],
        basePoints: () => sampleCircle(2, 0, 2, 720),
        afterPoints: ({ h, k, r }) => sampleCircle(h, k, r, 720),
        afterEq: ({ h, k, r }) => `\\((x-${formatNum(h)})^2+(y-${formatNum(k)})^2=${formatNum(r)}^2\\)`,
        mapText: ({ h, k, r }) => `\\((x,y)\\to(x,y): (x-${formatNum(h)})^2+(y-${formatNum(k)})^2=${formatNum(r)}^2\\)`
      },
      ellipse: {
        label: '璈Ｗ??寧?撘?,
        baseEq: '\\(\\frac{(x-2)^2}{4}+\\frac{(y+1)^2}{2.56}=1\\)',
        focus: { xMin: -1, xMax: 5, yMin: -3.5, yMax: 3 },
        paramDefs: [
          { key: 'h', label: 'h嚗葉敹?x嚗?, min: -1, max: 5, step: 0.1, default: 2 },
          { key: 'k', label: 'k嚗葉敹?y嚗?, min: -3, max: 3, step: 0.1, default: -1 },
          { key: 'a', label: 'a嚗 ??嚗?, min: 0.5, max: 4, step: 0.1, default: 2 },
          { key: 'b', label: 'b嚗 ??嚗?, min: 0.5, max: 3, step: 0.1, default: 1.6 }
        ],
        basePoints: () => sampleEllipse(2, -1, 2, 1.6, 720),
        afterPoints: ({ h, k, a, b }) => sampleEllipse(h, k, a, b, 720),
        afterEq: ({ h, k, a, b }) => `\\(\\frac{(x-${formatNum(h)})^2}{${formatNum(a)}^2}+\\frac{(y-${formatNum(k)})^2}{${formatNum(b)}^2}=1\\)`,
        mapText: ({ h, k, a, b }) => `\\(\\left(\\frac{x-${formatNum(h)} }{${formatNum(a)}}\\right)^2+\\left(\\frac{y-${formatNum(k)} }{${formatNum(b)}}\\right)^2=1\\)`
      }
    };

    const coreFamilyNames = Object.keys(coreFamilies);
    let currentFamily = coreFamilyNames[0];
    let currentAbsFamily = 'quadraticUp';
    let currentAbsMode = 'xAbs';

    const coreParams = {};
    for (const [key, family] of Object.entries(coreFamilies)) {
      coreParams[key] = {};
      for (const p of family.paramDefs) {
        coreParams[key][p.key] = p.default;
      }
    }

    const absModes = {
      xAbs: {
        label: '|x|',
        coord: '\\((x\',y\')=(|x|,y)\\)',
        note: '\\(y=f(|x|)\\)'
      },
      negXAbs: {
        label: '-|x|',
        coord: '\\((x\',y\')=(-|x|,y)\\)',
        note: '\\(y=f(-|x|)\\)'
      },
      yAbs: {
        label: '|y|',
        coord: '\\((x\',y\')=(x,|y|)\\)',
        note: '\\(y=|f(x)|\\)'
      },
      negYAbs: {
        label: '-|y|',
        coord: '\\((x\',y\')=(x,-|y|)\\)',
        note: '\\(y=-|f(x)|\\)'
      }
    };
    const absFamilies = {
      quadraticUp: {
        label: '鈭活嚗???',
        points: () => sampleExplicit((x) => (x - 1) * (x - 1), -6, 6, 900),
        base: '\\(y=(x-1)^2\\)',
        after: {
          xAbs: '\\(y=(|x|-1)^2\\)',
          negXAbs: '\\(y=(-|x|-1)^2\\)',
          yAbs: '\\(y=|(x-1)^2|\\)',
          negYAbs: '\\(y=-|(x-1)^2|\\)'
        },
        windows: {
          base: { xMin: -5, xMax: 7, yMin: 0, yMax: 35 },
          xAbs: { xMin: -0.2, xMax: 5, yMin: 0, yMax: 35 },
          negXAbs: { xMin: -5, xMax: 0.2, yMin: 0, yMax: 35 },
          yAbs: { xMin: -5, xMax: 7, yMin: 0, yMax: 35 },
          negYAbs: { xMin: -5, xMax: 7, yMin: -35, yMax: 0 }
        },
        explain: '撠迂????\(|x|\) 撠??∪??啣椰?氬?
      },
      quadraticDown: {
        label: '鈭活嚗???',
        points: () => sampleExplicit((x) => -(x + 2) * (x + 2), -6, 6, 900),
        base: '\\(y=-(x+2)^2\\)',
        after: {
          xAbs: '\\(y=-(|x|+2)^2\\)',
          negXAbs: '\\(y=(-|x|-2)^2\\)',
          yAbs: '\\(y=|-(x+2)^2|\\)',
          negYAbs: '\\(y=-|-(x+2)^2|\\)'
        },
        windows: {
          base: { xMin: -7, xMax: 4, yMin: -35, yMax: 0 },
          xAbs: { xMin: -0.2, xMax: 4, yMin: -35, yMax: 0 },
          negXAbs: { xMin: -4, xMax: 0.2, yMin: -35, yMax: 0 },
          yAbs: { xMin: -7, xMax: 4, yMin: 0, yMax: 35 },
          negYAbs: { xMin: -7, xMax: 4, yMin: -35, yMax: 0 }
        },
        explain: '鞎???典? \(|y|\) ??擃??唬??嫘?
      },
      cubic: {
        label: '銝活',
        points: () => sampleExplicit((x) => x * x * x, -3.2, 3.2, 900),
        base: '\\(y=x^3\\)',
        after: {
          xAbs: '\\(y=(|x|)^3\\)',
          negXAbs: '\\(y=(-|x|)^3\\)',
          yAbs: '\\(y=|x^3|\\)',
          negYAbs: '\\(y=-|x^3|\\)'
        },
        windows: {
          base: { xMin: -3.2, xMax: 3.2, yMin: -28, yMax: 28 },
          xAbs: { xMin: 0, xMax: 3.2, yMin: -28, yMax: 28 },
          negXAbs: { xMin: -3.2, xMax: 0, yMin: -28, yMax: 28 },
          yAbs: { xMin: -3.2, xMax: 3.2, yMin: 0, yMax: 28 },
          negYAbs: { xMin: -3.2, xMax: 3.2, yMin: -28, yMax: 0 }
        },
        explain: '銝?蝔勗?詨?湔?銝?渲◤銴ˊ??
      },
      exponential: {
        label: '?',
        points: () => sampleExplicit((x) => Math.pow(2, x), -3.2, 3.2, 900),
        base: '\\(y=2^x\\)',
        after: {
          xAbs: '\\(y=2^{|x|}\\)',
          negXAbs: '\\(y=2^{-|x|}\\)',
          yAbs: '\\(y=|2^x|\\)',
          negYAbs: '\\(y=-|2^x|\\)'
        },
        windows: {
          base: { xMin: -3.2, xMax: 3.2, yMin: 0, yMax: 9 },
          xAbs: { xMin: 0, xMax: 3.2, yMin: 0, yMax: 9 },
          negXAbs: { xMin: -3.2, xMax: 0, yMin: 0, yMax: 9 },
          yAbs: { xMin: -3.2, xMax: 3.2, yMin: 0, yMax: 9 },
          negYAbs: { xMin: -3.2, xMax: 3.2, yMin: -9, yMax: 0 }
        },
        explain: '??賣???潘?\(|y|\) ??\(-|y|\) 銝餉?憿舐內銝?蝧颯?
      },
      logarithm: {
        label: '撠',
        points: () => sampleExplicit((x) => Math.log(x + 2), -1.9, 6.2, 900),
        base: '\\(y=\ln(x+2)\\)',
        after: {
          xAbs: '\\(y=\ln(|x|+2)\\)',
          negXAbs: '\\(y=\ln(2-|x|)\\)',
          yAbs: '\\(y=|\ln(x+2)|\\)',
          negYAbs: '\\(y=-|\ln(x+2)|\\)'
        },
        windows: {
          base: { xMin: -1.8, xMax: 6.5, yMin: -2.5, yMax: 2.5 },
          xAbs: { xMin: 0.05, xMax: 6.5, yMin: -2.5, yMax: 2.5 },
          negXAbs: { xMin: -6.5, xMax: 0, yMin: -2.5, yMax: 2.5 },
          yAbs: { xMin: -1.8, xMax: 6.5, yMin: 0, yMax: 2.5 },
          negYAbs: { xMin: -1.8, xMax: 6.5, yMin: -2.5, yMax: 0 }
        },
        explain: '撠??摰儔???脰?蝯??潸?敶Ｕ?
      },
      trig: {
        label: '銝?',
        points: () => sampleExplicit(Math.sin, -Math.PI * 2.2, Math.PI * 2.2, 1400),
        base: '\\(y=\sin x\\)',
        after: {
          xAbs: '\\(y=\sin(|x|)\\)',
          negXAbs: '\\(y=\sin(-|x|)\\)',
          yAbs: '\\(y=|\sin x|\\)',
          negYAbs: '\\(y=-|\sin x|\\)'
        },
        windows: {
          base: { xMin: -7, xMax: 7, yMin: -1.2, yMax: 1.2 },
          xAbs: { xMin: 0, xMax: 7, yMin: -1.2, yMax: 1.2 },
          negXAbs: { xMin: -7, xMax: 0, yMin: -1.2, yMax: 1.2 },
          yAbs: { xMin: -7, xMax: 7, yMin: 0, yMax: 1.2 },
          negYAbs: { xMin: -7, xMax: 7, yMin: -1.2, yMax: 0 }
        },
        explain: '憟?賊???\(|x|\) ????賣??
      },
      circle: {
        label: '??,
        points: () => sampleCircle(2, 0, 2, 720),
        base: '\\((x-2)^2+y^2=4\\)',
        after: {
          xAbs: '\\((|x|-2)^2+y^2=4\\)',
          negXAbs: '\\((-|x|-2)^2+y^2=4\\)',
          yAbs: '\\((x-2)^2+(|y|)^2=4\\)',
          negYAbs: '\\((x-2)^2+(-|y|)^2=4\\)'
        },
        windows: {
          base: { xMin: 0, xMax: 4, yMin: -2.2, yMax: 2.2 },
          xAbs: { xMin: 0, xMax: 4, yMin: -2.2, yMax: 2.2 },
          negXAbs: { xMin: -4, xMax: 0, yMin: -2.2, yMax: 2.2 },
          yAbs: { xMin: 0, xMax: 4, yMin: 0, yMax: 2.2 },
          negYAbs: { xMin: 0, xMax: 4, yMin: -2.2, yMax: 0 }
        },
        explain: '? x 頠豢?撠?湔??拙???????
      },
      ellipse: {
        label: '璈Ｗ?',
        points: () => sampleEllipse(2, -1, 2, 1.6, 720),
        base: '\\(\\frac{(x-2)^2}{4}+\\frac{(y+1)^2}{2.56}=1\\)',
        after: {
          xAbs: '\\(\\frac{(|x|-2)^2}{4}+\\frac{(y+1)^2}{2.56}=1\\)',
          negXAbs: '\\(\\frac{(-|x|-2)^2}{4}+\\frac{(y+1)^2}{2.56}=1\\)',
          yAbs: '\\(\\frac{(x-2)^2}{4}+\\frac{(|y+1|)^2}{2.56}=1\\)',
          negYAbs: '\\(\\frac{(x-2)^2}{4}+\\frac{(-|y+1|)^2}{2.56}=1\\)'
        },
        windows: {
          base: { xMin: 0, xMax: 4, yMin: -3.2, yMax: 1.2 },
          xAbs: { xMin: 0, xMax: 4, yMin: -3.2, yMax: 1.2 },
          negXAbs: { xMin: -4, xMax: 0, yMin: -3.2, yMax: 1.2 },
          yAbs: { xMin: 0, xMax: 4, yMin: 0, yMax: 1.2 },
          negYAbs: { xMin: 0, xMax: 4, yMin: -3.2, yMax: 0 }
        },
        explain: '璈Ｗ?靽??瑁遘?頠豢?嚗?舀?◤?∪???
      }
    };

    function transformByMode(points, mode) {
      switch (mode) {
        case 'xAbs': return points.map((p) => ({ x: Math.abs(p.x), y: p.y }));
        case 'negXAbs': return points.map((p) => ({ x: -Math.abs(p.x), y: p.y }));
        case 'yAbs': return points.map((p) => ({ x: p.x, y: Math.abs(p.y) }));
        case 'negYAbs': return points.map((p) => ({ x: p.x, y: -Math.abs(p.y) }));
        default: return points;
      }
    }

    function setCoreActive() {
      for (const btn of familyButtons.querySelectorAll('button')) {
        btn.classList.toggle('active', btn.dataset.key === currentFamily);
      }
    }

    function setAbsActive() {
      for (const btn of absFamilyButtons.querySelectorAll('button')) {
        btn.classList.toggle('active', btn.dataset.key === currentAbsFamily);
      }
      for (const btn of absModeButtons.querySelectorAll('button')) {
        btn.classList.toggle('active', btn.dataset.key === currentAbsMode);
      }
    }

    function renderCoreParamControls() {
      const family = coreFamilies[currentFamily];
      const params = coreParams[currentFamily];
      coreParamInputs.innerHTML = '';
      for (const def of family.paramDefs) {
        const row = document.createElement('div');
        row.className = 'paramRow';

        const label = document.createElement('label');
        label.textContent = def.label;

        const input = document.createElement('input');
        input.type = 'range';
        input.min = def.min;
        input.max = def.max;
        input.step = def.step;
        input.value = params[def.key];

        const value = document.createElement('span');
        value.className = 'paramValue';
        value.textContent = valueText(params[def.key]);

        input.addEventListener('input', () => {
          params[def.key] = parseFloat(input.value);
          value.textContent = valueText(params[def.key]);
          drawCorePreview();
        });

        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(value);
        coreParamInputs.appendChild(row);
      }
    }

    function drawCorePreview() {
      const family = coreFamilies[currentFamily];
      const params = coreParams[currentFamily];
      const basePoints = family.basePoints(params);
      const afterPoints = family.afterPoints(params);
      const baseWindow = family.focus;
      const afterWindow = family.focus;
      const baseBound = collectBounds(basePoints, baseWindow);
      const afterBound = collectBounds(afterPoints, afterWindow);
      const bounds = mergeBounds(baseBound, afterBound);

      coreBaseEq.innerHTML = `<strong>?箸?撘?</strong>${family.baseEq}`;
      coreAfterExpr.innerHTML = `<strong>${family.afterEq(params)}</strong>`;
      coreMapInfo.innerHTML = `<strong>??撘?</strong>${family.mapText(params)}`;
      coreAfterTitle.textContent = `霈?敺?${family.label}嚗;
      coreFocusInfo.textContent = `閬?嚗 ??[${formatNum(bounds.minX)}, ${formatNum(bounds.maxX)}]嚗 ??[${formatNum(bounds.minY)}, ${formatNum(bounds.maxY)}]`;

      const before = makeCanvasContext(coreBeforeCanvas);
      before.ctx.fillStyle = '#fff';
      before.ctx.fillRect(0, 0, before.width, before.height);
      drawCurve(before, clipPoints(basePoints, baseWindow), baseBound, '#1d4ed8', 2.4);

      const after = makeCanvasContext(coreAfterCanvas);
      after.ctx.fillStyle = '#fff';
      after.ctx.fillRect(0, 0, after.width, after.height);
      drawCurve(after, clipPoints(afterPoints, afterWindow), bounds, '#0f766e', 2.4);

      if (window.MathJax?.typesetPromise) {
        window.MathJax.typesetPromise([coreBaseEq, coreAfterExpr, coreMapInfo, coreFocusInfo, coreAfterTitle]);
      }
    }

    function drawAbsCompare() {
      const mode = absModes[currentAbsMode];
      const family = absFamilies[currentAbsFamily];
      const basePoints = family.points();
      const afterPoints = transformByMode(basePoints, currentAbsMode);

      const baseWindow = family.windows?.base;
      const afterWindow = family.windows?.[currentAbsMode] || family.windows?.base;
      const baseBound = collectBounds(clipPoints(basePoints, baseWindow), baseWindow);
      const afterBound = collectBounds(clipPoints(afterPoints, afterWindow), afterWindow);
      const bounds = mergeBounds(baseBound, afterBound);

      absModeInfo.innerHTML = `<strong>摨扳???嚗?/strong>${mode.coord}嚗?{mode.note}`;
      absBase.innerHTML = `<span class="ok">${family.base}</span>`;
      absAfter.innerHTML = `<span class="warn">${family.after[currentAbsMode]}</span>`;
      absExplain.textContent = family.explain;
      absFocusInfo.textContent = `閬?嚗 ??[${formatNum(afterWindow.xMin)}, ${formatNum(afterWindow.xMax)}]嚗 ??[${formatNum(afterWindow.yMin)}, ${formatNum(afterWindow.yMax)}]`;
      afterTitle.textContent = `霈?敺?${mode.label}嚗;

      const before = makeCanvasContext(beforeCanvas);
      before.ctx.fillStyle = '#fff';
      before.ctx.fillRect(0, 0, before.width, before.height);
      drawCurve(before, clipPoints(basePoints, baseWindow), baseBound, '#1d4ed8', 2.4);

      const after = makeCanvasContext(afterCanvas);
      after.ctx.fillStyle = '#fff';
      after.ctx.fillRect(0, 0, after.width, after.height);
      drawCurve(after, clipPoints(afterPoints, afterWindow), bounds, '#0f766e', 2.4);

      if (window.MathJax?.typesetPromise) {
        window.MathJax.typesetPromise([absModeInfo, absBase, absAfter, absExplain, absFocusInfo, afterTitle]);
      }
    }

    function renderCoreButtons() {
      familyButtons.innerHTML = '';
      for (const key of Object.keys(coreFamilies)) {
        const btn = document.createElement('button');
        btn.textContent = coreFamilies[key].label;
        btn.dataset.key = key;
        btn.className = key === currentFamily ? 'active' : '';
        btn.addEventListener('click', () => {
          currentFamily = key;
          renderCoreParamControls();
          drawCorePreview();
          setCoreActive();
        });
        familyButtons.appendChild(btn);
      }
    }

    function renderAbsButtons() {
      absModeButtons.innerHTML = '';
      for (const [key, item] of Object.entries(absModes)) {
        const btn = document.createElement('button');
        btn.textContent = item.label;
        btn.dataset.key = key;
        btn.className = key === currentAbsMode ? 'active' : '';
        btn.addEventListener('click', () => {
          currentAbsMode = key;
          drawAbsCompare();
          setAbsActive();
        });
        absModeButtons.appendChild(btn);
      }

      absFamilyButtons.innerHTML = '';
      for (const [key, item] of Object.entries(absFamilies)) {
        const btn = document.createElement('button');
        btn.textContent = item.label;
        btn.dataset.key = key;
        btn.className = key === currentAbsFamily ? 'active' : '';
        btn.addEventListener('click', () => {
          currentAbsFamily = key;
          drawAbsCompare();
          setAbsActive();
        });
        absFamilyButtons.appendChild(btn);
      }
    }

    function renderAll() {
      renderCoreButtons();
      renderAbsButtons();
      renderCoreParamControls();
      drawCorePreview();
      drawAbsCompare();
      if (window.MathJax?.typesetPromise) {
        window.MathJax.typesetPromise([document.body]);
      }
    }

    renderAll();
  
