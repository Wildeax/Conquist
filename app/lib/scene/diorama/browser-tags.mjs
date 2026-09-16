import * as THREE from 'three';

const spanishNames = {
  Timber: 'Madera',
  Clay: 'Arcilla',
  Wool: 'Lana',
  Grain: 'Trigo',
  Stone: 'Piedra',
};
const spanishTradeNames = ['Madera', 'Arcilla', 'Lana', 'Trigo', 'Piedra'];
const colors = ['#91b678', '#d99c76', '#d1dda4', '#e4c56f', '#b2c6d0'];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const overlaps = (a, b, gap = 4) =>
  a.x < b.x + b.w + gap &&
  a.x + a.w + gap > b.x &&
  a.y < b.y + b.h + gap &&
  a.y + a.h + gap > b.y;

// Labels live in screen space: terrain, shadows and reflections cannot obscure
// their text. Short leaders preserve the association when a label moves aside.
export function createBoardTags(layout, ports, host = document.body) {
  const english = host !== document.body,
    names = english
      ? {
          Timber: 'Timber',
          Clay: 'Clay',
          Wool: 'Wool',
          Grain: 'Grain',
          Stone: 'Stone',
        }
      : spanishNames;
  const tradeNames = english
    ? ['Timber', 'Clay', 'Wool', 'Grain', 'Stone']
    : spanishTradeNames;
  const root = document.createElement('div');
  root.className = 'board-tags';
  root.setAttribute(
    'aria-label',
    english ? 'Board information' : 'Información del tablero',
  );
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('tag-leaders');
  root.append(svg);
  host.append(root);
  const entries = [];
  function add(id, type, point, html, label, color) {
    const element = document.createElement('div');
    element.className = 'board-tag ' + type;
    element.dataset.tagId = id;
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', label);
    element.innerHTML = html;
    if (color) element.style.setProperty('--tag-color', color);
    root.append(element);
    const line = document.createElementNS(svg.namespaceURI, 'path');
    line.setAttribute('class', 'tag-leader');
    svg.append(line);
    entries.push({
      id,
      type,
      point: new THREE.Vector3(...point),
      element,
      line,
    });
  }
  for (const hex of layout.hexes) {
    if (!hex.number) continue;
    const pips = 6 - Math.abs(7 - hex.number),
      hot = hex.number === 6 || hex.number === 8;
    add(
      'hex-' + hex.id,
      'number-tag' + (hot ? ' frequent' : ''),
      [hex.x, 0.13, hex.z],
      '<strong>' +
        hex.number +
        '</strong><span class="probability">' +
        '●'.repeat(pips) +
        '</span>',
      names[hex.resource] +
        ': ' +
        hex.number +
        ', ' +
        pips +
        (english ? ' probability pips' : ' puntos de probabilidad'),
    );
  }
  for (const port of ports) {
    const name = tradeNames[port.type] ?? 'General',
      ratio = port.type === -1 ? '3:1' : '2:1';
    add(
      'port-' + port.id,
      'port-tag',
      [port.x + port.dx * 0.84, 0.14, port.z + port.dz * 0.84],
      '<span class="trade-resource">' +
        name +
        '</span><strong>' +
        ratio +
        '</strong>',
      (english ? 'Port: ' : 'Puerto de ') +
        name +
        (english ? ', exchange ' : ', intercambio ') +
        ratio,
      colors[port.type] ?? '#dbc99d',
    );
  }
  let signature = '',
    visible = true,
    last = [];
  const projected = new THREE.Vector3();
  function update(camera) {
    const rect =
      host === document.body
        ? {
            x: 0,
            y: 0,
            width: document.documentElement.clientWidth,
            height: document.documentElement.clientHeight,
          }
        : host.getBoundingClientRect();
    const width = rect.width,
      height = rect.height;
    const blockers = [
      ...document.querySelectorAll(
        host === document.body
          ? 'header,footer,.player-key'
          : '.table-panel,.turn-command,.player-card,.hand-dock',
      ),
    ]
      .filter((el) => el.getClientRects().length)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x - rect.x, y: r.y - rect.y, w: r.width, h: r.height };
      });
    const next = [
      width,
      height,
      visible,
      ...camera.matrixWorld.elements,
      ...camera.projectionMatrix.elements,
      ...blockers.flatMap((r) => [r.x, r.y, r.w, r.h]),
    ].join(',');
    if (next === signature) return;
    signature = next;
    root.hidden = !visible;
    if (!visible) {
      last = [];
      return;
    }
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const candidates = [];
    for (const entry of entries) {
      projected.copy(entry.point).project(camera);
      const shown =
        projected.z >= -1 &&
        projected.z <= 1 &&
        Math.abs(projected.x) <= 1 &&
        Math.abs(projected.y) <= 1;
      entry.element.hidden = !shown;
      entry.line.style.display = shown ? '' : 'none';
      if (!shown) continue;
      const compact = english && width < 600;
      const w = entry.type.startsWith('number')
          ? compact
            ? 30
            : 42
          : compact
            ? 82
            : 110,
        h = entry.type.startsWith('number')
          ? compact
            ? 30
            : 42
          : compact
            ? 26
            : 32;
      candidates.push({
        ...entry,
        w,
        h,
        ax: (projected.x * 0.5 + 0.5) * width,
        ay: (-0.5 * projected.y + 0.5) * height,
      });
    }
    candidates.sort((a, b) => a.ay - b.ay || a.ax - b.ax);
    const placed = [];
    for (const entry of candidates) {
      const wanted = { x: entry.ax - entry.w / 2, y: entry.ay - entry.h - 12 };
      let chosen = null,
        bestPenalty = Infinity;
      // Search nearby free space deterministically; no animation jitter.
      const offsets = [[0, 0]];
      for (let ring = 1; ring <= 7; ring++)
        for (let sector = 0; sector < 12; sector++) {
          const angle = -Math.PI / 2 + (sector * Math.PI) / 6;
          offsets.push([
            Math.cos(angle) * ring * 22,
            Math.sin(angle) * ring * 22,
          ]);
        }
      for (const [dx, dy] of offsets) {
        const box = {
          x: clamp(wanted.x + dx, 8, width - entry.w - 8),
          y: clamp(wanted.y + dy, 8, height - entry.h - 8),
          w: entry.w,
          h: entry.h,
        };
        let penalty = Math.hypot(box.x - wanted.x, box.y - wanted.y);
        for (const other of blockers.concat(placed))
          if (overlaps(box, other)) penalty += 10000;
        if (penalty < bestPenalty) {
          bestPenalty = penalty;
          chosen = box;
        }
        if (penalty === 0) break;
      }
      // A narrow viewport can put an anchor beneath the controls. Use the
      // nearest remaining screen slot instead of leaving its text covered.
      if (bestPenalty >= 10000) {
        for (let y = 8; y <= height - entry.h - 8; y += 12)
          for (let x = 8; x <= width - entry.w - 8; x += 12) {
            const box = { x, y, w: entry.w, h: entry.h };
            if (blockers.concat(placed).some((other) => overlaps(box, other)))
              continue;
            const penalty = Math.hypot(x - wanted.x, y - wanted.y);
            if (penalty < bestPenalty) {
              chosen = box;
              bestPenalty = penalty;
            }
          }
      }
      placed.push({ ...chosen, id: entry.id });
      entry.element.style.transform = `translate(${Math.round(chosen.x)}px,${Math.round(chosen.y)}px)`;
      const tx = clamp(entry.ax, chosen.x + 4, chosen.x + chosen.w - 4),
        ty = clamp(entry.ay, chosen.y + 4, chosen.y + chosen.h - 4);
      entry.line.setAttribute(
        'd',
        `M${entry.ax.toFixed(1)},${entry.ay.toFixed(1)} L${tx.toFixed(1)},${ty.toFixed(1)}`,
      );
    }
    last = placed;
  }
  return {
    root,
    dispose() {
      root.remove();
    },
    update,
    setVisible(value) {
      visible = !!value;
      signature = '';
      root.hidden = !visible;
    },
    inspect() {
      return {
        total: entries.length,
        visible: last.length,
        boxes: last,
        overlaps: last.reduce(
          (n, a, i) =>
            n + last.slice(i + 1).filter((b) => overlaps(a, b, 0)).length,
          0,
        ),
      };
    },
  };
}
