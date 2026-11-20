import { yearToLabel } from '../core/TimeScale.js';
import { buildBeaconLayout } from './beaconLayout.js';
import { buildAxisLabelLayout } from './axisLabelLayout.js';

/** Screen-sized controls anchored to the 3D archive; only the controls intercept input. */
export class HologramBeacons {
  constructor(container, onSelect, colors, onWheel) {
    this.onSelect = onSelect;
    this.colors = colors;
    this.nodes = new Map();
    this.axisNodes = new Map();
    this.layer = document.createElement('div');
    this.layer.className = 'holo-beacons';
    this.layer.setAttribute('aria-label', '年表の出来事');
    this.layer.hidden = true;
    container.append(this.layer);
    this.axisLayer = document.createElement('div');
    this.axisLayer.className = 'holo-axis-labels';
    this.axisLayer.setAttribute('aria-label', '年代目盛り');
    this.layer.append(this.axisLayer);
    this.picker = document.createElement('section');
    this.picker.className = 'holo-beacon-picker';
    this.picker.setAttribute('aria-label', 'まとまった出来事');
    this.picker.hidden = true;
    this.layer.append(this.picker);
    this.layer.addEventListener('wheel', event => {
      if (!this.picker.contains(event.target)) onWheel(event);
    }, { passive: false });
    this.onOutside = (event) => { if (!this.layer.contains(event.target)) this.closePicker(); };
    this.onKey = (event) => {
      if (event.key === 'Escape' && this.openKey) {
        const origin = this.nodes.get(this.openKey)?.button;
        this.closePicker();
        origin?.focus();
      }
    };
    document.addEventListener('pointerdown', this.onOutside);
    document.addEventListener('keydown', this.onKey);
  }

  setVisible(visible) {
    this.layer.hidden = !visible;
    if (!visible) this.closePicker();
  }

  updateAxis(points, viewport) {
    const active = new Set();
    for (const point of buildAxisLabelLayout(points, viewport)) {
      active.add(point.key);
      let label = this.axisNodes.get(point.key);
      if (!label) {
        label = document.createElement('span');
        label.className = 'holo-axis-label';
        this.axisLayer.append(label);
        this.axisNodes.set(point.key, label);
      }
      if (label.textContent !== point.label) label.textContent = point.label;
      label.style.left = `${point.x}px`;
      label.style.top = `${point.y + 10}px`;
    }
    for (const [key, label] of this.axisNodes) {
      if (!active.has(key)) { label.remove(); this.axisNodes.delete(key); }
    }
  }

  update(points, viewport) {
    const groups = buildBeaconLayout(points, viewport);
    const active = new Set();
    for (const group of groups) {
      const key = JSON.stringify(group.events.map(event => event.id));
      active.add(key);
      let node = this.nodes.get(key);
      if (!node) {
        const element = document.createElement('div');
        element.className = 'holo-beacon';
        const stem = document.createElement('span');
        stem.className = 'holo-beacon-stem';
        stem.setAttribute('aria-hidden', 'true');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'holo-beacon-button';
        const title = document.createElement('span');
        title.className = 'holo-beacon-title';
        const date = document.createElement('span');
        date.className = 'holo-beacon-date';
        const diamond = document.createElement('span');
        diamond.className = 'holo-beacon-diamond';
        diamond.setAttribute('aria-hidden', 'true');
        button.append(title, date, diamond);
        element.append(stem, button);
        this.layer.append(element);
        node = { element, stem, button, title, date, diamond };
        button.addEventListener('click', () => {
          if (node.group.events.length > 1) {
            if (this.openKey === key) this.closePicker();
            else this.openPicker(key, node.group, node.viewport);
          } else {
            this.closePicker();
            this.onSelect(node.group.event);
          }
        });
        this.nodes.set(key, node);
      }
      node.group = group;
      node.viewport = viewport;
      const { element, stem, button, title, date, diamond } = node;
      const color = this.colors[group.event.category] ?? 0x8cf5ff;
      element.style.setProperty('--beacon-color', `#${color.toString(16).padStart(6, '0')}`);
      element.classList.toggle('is-selected', group.isSelected);
      stem.style.left = `${group.x}px`;
      stem.style.top = `${group.headY}px`;
      stem.style.height = `${group.anchorY - group.headY}px`;
      button.style.transform = `translate(${group.labelX}px, ${group.headY - 50}px)`;
      button.style.width = `${group.labelWidth}px`;
      diamond.style.left = `${group.x - group.labelX}px`;
      if (title.textContent !== group.event.title) title.textContent = group.event.title;
      const dateLabel = group.events.length > 1 ? `＋${group.events.length - 1}件` : yearToLabel(group.event.year);
      if (date.textContent !== dateLabel) date.textContent = dateLabel;
      button.setAttribute('aria-label', group.events.length > 1
        ? `${group.event.title} ほか、${group.events.length}件の出来事を開く`
        : `${group.event.title}、${yearToLabel(group.event.year)}`);
      if (group.events.length > 1) {
        button.setAttribute('aria-expanded', String(this.openKey === key));
        button.removeAttribute('aria-pressed');
      } else {
        button.setAttribute('aria-pressed', String(group.isSelected));
        button.removeAttribute('aria-expanded');
      }
      if (this.openKey === key) this.positionPicker(group, viewport);
    }
    for (const [key, node] of this.nodes) {
      if (!active.has(key)) { node.element.remove(); this.nodes.delete(key); }
    }
    if (this.openKey && !active.has(this.openKey)) this.closePicker();
  }

  positionPicker(group, { width, height }) {
    const pickerWidth = Math.min(300, width - 24);
    const top = Math.max(120, Math.min(height - 330, group.headY + 20));
    this.picker.style.width = `${pickerWidth}px`;
    this.picker.style.left = `${Math.max(12, Math.min(width - pickerWidth - 12, group.x - pickerWidth / 2))}px`;
    this.picker.style.top = `${top}px`;
    this.picker.style.maxHeight = `${Math.min(300, height - top - 24)}px`;
  }

  openPicker(key, group, viewport) {
    this.closePicker();
    this.openKey = key;
    const header = document.createElement('div');
    header.className = 'holo-beacon-picker-header';
    const heading = document.createElement('span');
    heading.textContent = `${group.events.length}件の出来事`;
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '閉じる';
    close.addEventListener('click', () => {
      this.closePicker();
      this.nodes.get(key)?.button.focus();
    });
    header.append(heading, close);
    this.picker.replaceChildren(header);
    for (const event of group.events) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'holo-beacon-event';
      const name = document.createElement('span');
      name.textContent = event.title;
      const date = document.createElement('span');
      date.textContent = yearToLabel(event.year);
      button.append(name, date);
      button.addEventListener('click', () => { this.closePicker(); this.onSelect(event); });
      this.picker.append(button);
    }
    this.positionPicker(group, viewport);
    this.picker.hidden = false;
    this.nodes.get(key)?.button.setAttribute('aria-expanded', 'true');
  }

  closePicker() {
    this.nodes.get(this.openKey)?.button.setAttribute('aria-expanded', 'false');
    this.openKey = null;
    this.picker.hidden = true;
  }

  dispose() {
    document.removeEventListener('pointerdown', this.onOutside);
    document.removeEventListener('keydown', this.onKey);
    this.layer.remove();
  }
}
