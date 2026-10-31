(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const TOP_N = 5;

  // DOM helper: all text goes through textContent / text nodes.
  function el(tag, props, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of [].concat(children || [])) if (c) node.append(c);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  const state = {
    meta: null,
    profiles: [],
    input: null,      // last submitted raw input
    rec: null,        // last recommendation
    selected: [],     // crop ids chosen for comparison
    compare: null,    // last comparison
    showAll: false,
    compareToken: 0
  };

  async function api(url, body) {
    const opts = body === undefined
      ? {}
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { data = { error: 'Unexpected server response.' }; }
    return { ok: res.ok, status: res.status, data };
  }

  /* ---------- Form ---------- */

  function fieldWrap(key, labelText, unitText, control) {
    const label = el('label', { for: 'f-' + key }, [labelText]);
    if (unitText) label.append(' ', el('span', { class: 'unit', text: '(' + unitText + ')' }));
    return el('div', { class: 'field', 'data-field': key }, [
      label,
      control,
      el('div', { class: 'error', id: 'err-' + key, role: 'alert' })
    ]);
  }

  function selectControl(id, options, blankLabel) {
    const sel = el('select', { id, name: id.replace('f-', '') });
    sel.append(el('option', { value: '', text: blankLabel }));
    for (const o of options) sel.append(el('option', { value: o.value, text: o.label }));
    return sel;
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function buildForm() {
    const mount = $('form-mount');
    clear(mount);
    const { meta, profiles } = state;

    const form = el('form', { id: 'advisor-form', novalidate: true, autocomplete: 'off' });

    // Example profile
    const profSel = selectControl('f-profile',
      profiles.map((p) => ({ value: p.id, label: p.name })), 'Choose an example…');
    form.append(el('div', { class: 'field' }, [
      el('label', { for: 'f-profile' }, ['Example profile']),
      profSel
    ]));

    form.append(el('div', { class: 'form-error', id: 'form-error', role: 'alert', hidden: true }));

    form.append(fieldWrap('season', 'Season *', '',
      selectControl('f-season', meta.seasons.map((s) => ({ value: s, label: cap(s) })), 'Select season')));
    form.append(fieldWrap('soil', 'Soil type', 'optional',
      selectControl('f-soil', meta.soils.map((s) => ({ value: s, label: cap(s) })), 'Not specified')));

    const grid = el('div', { class: 'grid2' });
    for (const f of meta.fields) {
      const input = el('input', {
        id: 'f-' + f.key, name: f.key, type: 'text', inputmode: 'decimal',
        placeholder: f.min + '–' + f.max, 'aria-describedby': 'err-' + f.key
      });
      grid.append(fieldWrap(f.key, f.label, f.unit || '', input));
    }
    form.append(grid);
    form.append(el('p', { class: 'muted hint' }, ['Leave a field blank if unknown; at least ' + meta.limits.minNumericInputs + ' numeric values are needed. Missing inputs are listed, not guessed.']));

    form.append(el('div', { class: 'form-actions' }, [
      el('button', { type: 'submit', class: 'btn', id: 'btn-submit', text: 'Get recommendation' }),
      el('button', { type: 'button', class: 'btn secondary', id: 'btn-reset', text: 'Reset' })
    ]));

    mount.append(form);

    form.addEventListener('submit', onSubmit);
    $('btn-reset').addEventListener('click', onReset);
    profSel.addEventListener('change', onProfile);
  }

  function readForm() {
    const out = { season: $('f-season').value, soil: $('f-soil').value };
    for (const f of state.meta.fields) out[f.key] = $('f-' + f.key).value;
    return out;
  }

  function clearErrors() {
    for (const node of document.querySelectorAll('.field .error')) node.textContent = '';
    for (const node of document.querySelectorAll('[aria-invalid]')) node.removeAttribute('aria-invalid');
    const fe = $('form-error');
    fe.textContent = '';
    fe.hidden = true;
  }

  function showErrors(fields, fallback) {
    clearErrors();
    let any = false;
    for (const [key, msg] of Object.entries(fields || {})) {
      if (key === '_form') continue;
      const errNode = $('err-' + key);
      if (errNode) {
        errNode.textContent = msg;
        const ctl = $('f-' + key);
        if (ctl) ctl.setAttribute('aria-invalid', 'true');
        any = true;
      }
    }
    const formMsg = fields && fields._form;
    if (formMsg || (!any && fallback)) {
      const fe = $('form-error');
      fe.textContent = formMsg || fallback;
      fe.hidden = false;
    }
  }

  function onProfile(e) {
    const p = state.profiles.find((x) => x.id === e.target.value);
    clearErrors();
    if (!p) return;
    $('f-season').value = p.input.season || '';
    $('f-soil').value = p.input.soil || '';
    for (const f of state.meta.fields) {
      const v = p.input[f.key];
      $('f-' + f.key).value = v === undefined ? '' : String(v);
    }
  }

  function onReset() {
    $('advisor-form').reset();
    clearErrors();
    state.rec = null;
    state.compare = null;
    state.selected = [];
    state.input = null;
    $('btn-print').disabled = true;
    $('btn-json').disabled = true;
    const res = $('results');
    clear(res);
    res.append(el('p', { class: 'muted', text: 'Pick an example profile or enter values, then press “Get recommendation”.' }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    clearErrors();
    const input = readForm();
    const btn = $('btn-submit');
    btn.disabled = true;
    try {
      const r = await api('/api/recommend', input);
      if (!r.ok) {
        showErrors(r.data.fields, r.data.error || 'Request failed.');
        return;
      }
      state.input = input;
      state.rec = r.data;
      state.compare = null;
      state.showAll = false;
      state.selected = r.data.results.slice(0, 2).map((c) => c.id);
      renderResults();
      await runCompare();
      $('btn-print').disabled = false;
      $('btn-json').disabled = false;
    } catch (err) {
      showErrors({}, 'Could not reach the server. Check your connection and try again.');
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- Results ---------- */

  function renderResults() {
    const mount = $('results');
    clear(mount);
    const rec = state.rec;
    if (!rec) return;

    const conf = rec.confidence;
    const confBox = el('div', { class: 'confidence ' + conf.level.toLowerCase(), id: 'confidence' }, [
      el('strong', { text: 'Confidence: ' + conf.level + ' (' + conf.percent + '% of weighted inputs supplied)' })
    ]);
    if (conf.missing.length) {
      confBox.append(el('span', { text: 'Not supplied (not guessed): ' + conf.missing.join(', ') }));
    }
    mount.append(confBox);

    if (rec.warnings.length) {
      const ul = el('ul', { class: 'warnings' });
      for (const w of rec.warnings) ul.append(el('li', { text: w }));
      mount.append(ul);
    }

    const list = el('div', { class: 'crop-list', id: 'crop-list' });
    const shown = state.showAll ? rec.results : rec.results.slice(0, TOP_N);
    for (const c of shown) list.append(cropCard(c));
    mount.append(list);

    if (rec.results.length > TOP_N) {
      const toggle = el('button', {
        type: 'button', class: 'btn secondary show-all', id: 'btn-show-all',
        text: state.showAll ? 'Show top ' + TOP_N : 'Show all ' + rec.results.length + ' crops'
      });
      toggle.addEventListener('click', () => {
        state.showAll = !state.showAll;
        renderResults();
        renderCompare();
      });
      mount.append(toggle);
    }

    mount.append(el('div', { class: 'compare', id: 'compare-mount' }));
    updateCheckboxes();
  }

  function cropCard(c) {
    const cat = c.category.toLowerCase();
    const check = el('input', { type: 'checkbox', 'data-crop': c.id, 'aria-label': 'Compare ' + c.name });
    check.checked = state.selected.includes(c.id);
    check.addEventListener('change', () => onToggle(c.id, check));

    const head = el('div', { class: 'crop-head' }, [
      el('h3', { text: '#' + c.rank + ' ' + c.name }),
      el('span', { class: 'badge ' + cat, text: c.category }),
      el('span', { class: 'score-text', text: c.score + ' / 100' }),
      el('label', { class: 'compare-check' }, [check, 'Compare'])
    ]);

    const fill = el('div', { class: 'fill ' + cat });
    fill.style.width = Math.max(0, Math.min(100, c.score)) + '%';
    const bar = el('div', { class: 'bar', role: 'img', 'aria-label': 'Score ' + c.score + ' out of 100' }, [fill]);

    const chips = el('div', { class: 'chips' });
    for (const f of c.factors) {
      chips.append(el('span', { class: 'chip ' + f.status, text: f.label + ' ' + Math.round(f.score * 100) + '%' }));
    }

    const notes = el('ul');
    for (const f of c.factors) notes.append(el('li', { text: f.note }));
    if (c.capped) {
      notes.append(el('li', { text: 'A factor is outside this crop’s tolerable range, so the category is capped at Low.' }));
    }
    const details = el('details', {}, [el('summary', { text: 'Why this score?' }), notes]);

    return el('article', { class: 'crop-card', 'data-crop-card': c.id }, [head, bar, chips, details]);
  }

  function updateCheckboxes() {
    const boxes = document.querySelectorAll('input[data-crop]');
    for (const b of boxes) {
      b.checked = state.selected.includes(b.getAttribute('data-crop'));
      b.disabled = !b.checked && state.selected.length >= 3;
    }
  }

  async function onToggle(id, box) {
    if (box.checked) {
      if (state.selected.length >= 3) { box.checked = false; return; }
      state.selected.push(id);
    } else {
      state.selected = state.selected.filter((x) => x !== id);
    }
    updateCheckboxes();
    await runCompare();
  }

  /* ---------- Compare ---------- */

  async function runCompare() {
    const token = ++state.compareToken;
    if (state.selected.length < 2) {
      state.compare = null;
      renderCompare('Select 2 or 3 crops to compare.');
      return;
    }
    try {
      const body = Object.assign({}, state.input, { crops: state.selected.slice() });
      const r = await api('/api/compare', body);
      if (token !== state.compareToken) return; // stale response
      if (!r.ok) {
        state.compare = null;
        renderCompare(r.data.error || 'Comparison failed.');
        return;
      }
      state.compare = r.data;
      renderCompare();
    } catch (err) {
      if (token !== state.compareToken) return;
      state.compare = null;
      renderCompare('Could not load the comparison.');
    }
  }

  function renderCompare(message) {
    const mount = $('compare-mount');
    if (!mount) return;
    clear(mount);
    mount.append(el('h3', { text: 'Compare crops' }));
    const cmp = state.compare;
    if (!cmp) {
      mount.append(el('p', { class: 'muted', id: 'compare-msg', text: message || 'Select 2 or 3 crops to compare.' }));
      return;
    }

    const headRow = el('tr', {}, [el('th', { scope: 'col', text: 'Factor' })]);
    for (const c of cmp.crops) headRow.append(el('th', { scope: 'col', text: c.name }));

    const tbody = el('tbody');
    for (const row of cmp.rows) {
      const tr = el('tr', {}, [el('th', { scope: 'row', text: row.label })]);
      for (const cell of row.cells) {
        tr.append(el('td', { class: row.best === cell.id ? 'best' : '' }, [
          el('span', { class: 'pct', text: Math.round(cell.score * 100) + '%' }),
          el('span', { class: 'note', text: cell.note })
        ]));
      }
      tbody.append(tr);
    }
    const overall = el('tr', { class: 'overall' }, [el('th', { scope: 'row', text: 'Overall' })]);
    for (const c of cmp.crops) {
      overall.append(el('td', { class: c.id === cmp.best.id && !cmp.best.tie ? 'best' : '' }, [
        el('span', { class: 'pct', text: c.score + ' (' + c.category + ')' })
      ]));
    }
    tbody.append(overall);

    const table = el('table', { id: 'compare-table' }, [
      el('thead', {}, [headRow]),
      tbody
    ]);
    mount.append(el('div', { class: 'table-scroll' }, [table]));
    mount.append(el('p', {
      class: 'best-line', id: 'compare-best',
      text: cmp.best.tie
        ? 'Tie: the selected crops score equally on these inputs.'
        : 'Best match among selected: ' + cmp.best.name + ' (' + cmp.best.score + ')'
    }));
  }

  /* ---------- Actions ---------- */

  function downloadJson() {
    if (!state.rec) return;
    const payload = {
      generatedAt: new Date().toISOString(),
      disclaimer: state.meta.disclaimer,
      dataLabel: state.meta.dataLabel,
      input: state.input,
      recommendation: state.rec,
      comparison: state.compare
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: 'crop-advisor-result.json' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.addEventListener('beforeprint', () => {
    for (const d of document.querySelectorAll('#results details')) d.open = true;
  });

  /* ---------- Init ---------- */

  async function init() {
    try {
      const [meta, profiles] = await Promise.all([api('/api/meta'), fetch('/profiles.json').then((r) => r.json())]);
      if (!meta.ok) throw new Error('meta');
      state.meta = meta.data;
      state.profiles = profiles.profiles || [];
      buildForm();
      $('btn-print').addEventListener('click', () => window.print());
      $('btn-json').addEventListener('click', downloadJson);
    } catch (err) {
      const mount = $('form-mount');
      clear(mount);
      mount.append(el('p', { class: 'form-error', role: 'alert', text: 'Could not load the app data. Refresh the page.' }));
    }
  }

  init();
})();
