/* Browser-only XLSX reader. Requires locally bundled JSZip. Never uploads data. */
(function (root) {
  'use strict';
  const MAX_FILE = 10 * 1024 * 1024;
  const MAX_EXPANDED = 50 * 1024 * 1024;
  const MAX_ROWS = 10000;
  const MAX_COLUMNS = 200;
  const NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  function elements(node, localName) {
    return Array.from(node.getElementsByTagNameNS('*', localName));
  }
  function first(node, localName) { return elements(node, localName)[0] || null; }
  function text(node) { return node ? (node.textContent || '') : ''; }
  function xml(raw, name) {
    if (raw.includes('<!DOCTYPE') || raw.includes('<!ENTITY')) throw Error('Unsupported XML declarations in ' + name);
    const doc = new DOMParser().parseFromString(raw, 'application/xml');
    if (doc.querySelector('parsererror')) throw Error('Malformed Excel XML in ' + name);
    return doc;
  }
  function colNum(address) {
    const m = /^([A-Z]+)\d+$/i.exec(address || '');
    if (!m) throw Error('Unexpected Excel cell address: ' + address);
    let out = 0;
    for (const c of m[1].toUpperCase()) out = out * 26 + c.charCodeAt(0) - 64;
    if (out < 1 || out > MAX_COLUMNS) throw Error('Workbook has more than 200 columns.');
    return out;
  }
  function safeTarget(target) {
    if (!target || /^[a-z]+:/i.test(target)) throw Error('Unsupported external worksheet reference.');
    let path = target.startsWith('/') ? target.replace(/^\/+/, '') : 'xl/' + target;
    const parts = [];
    for (const p of path.split('/')) {
      if (!p || p === '.') continue;
      if (p === '..') { if (!parts.length) throw Error('Unsafe workbook path.'); parts.pop(); }
      else parts.push(p);
    }
    path = parts.join('/');
    if (!path.startsWith('xl/')) throw Error('Invalid worksheet path.');
    return path;
  }
  async function readXlsx(file) {
    if (!root.JSZip) throw Error('The bundled JSZip library was not loaded.');
    if (!/\.xlsx$/i.test(file.name || '')) throw Error('Choose an .xlsx file.');
    if (file.size > MAX_FILE) throw Error('The workbook exceeds the 10 MB limit.');
    const zip = await root.JSZip.loadAsync(await file.arrayBuffer(), {checkCRC32: false});
    const parts = Object.values(zip.files).filter(f => !f.dir);
    if (parts.length > 2000) throw Error('Too many workbook ZIP parts.');
    const expanded = parts.reduce((n, f) => n + (f._data?.uncompressedSize ?? 0), 0);
    if (expanded > MAX_EXPANDED) throw Error('Workbook expands beyond the 50 MB safety limit.');
    async function getDoc(path) {
      const part = zip.file(path);
      if (!part) throw Error('Missing workbook part: ' + path);
      return xml(await part.async('string'), path);
    }
    const book = await getDoc('xl/workbook.xml');
    const rels = await getDoc('xl/_rels/workbook.xml.rels');
    const relationships = new Map(elements(rels, 'Relationship')
      .filter(el => el.getAttribute('TargetMode') !== 'External')
      .map(el => [el.getAttribute('Id'), el.getAttribute('Target')]));
    const shared = [];
    if (zip.file('xl/sharedStrings.xml')) {
      const strings = await getDoc('xl/sharedStrings.xml');
      for (const si of elements(strings, 'si')) {
        shared.push(elements(si, 't').map(text).join(''));
        if (shared.length > 150000) throw Error('Too many Excel shared strings.');
      }
    }
    let seenRows = 0;
    const sheets = [];
    for (const sh of elements(book, 'sheet')) {
      const relId = sh.getAttributeNS(NS, 'id') || sh.getAttribute('r:id');
      const target = relationships.get(relId);
      if (!target) continue;
      const sheetDoc = await getDoc(safeTarget(target));
      const sheetData = first(sheetDoc, 'sheetData');
      const rows = [];
      let formulaCount = 0;
      if (sheetData) {
        for (const row of Array.from(sheetData.children).filter(el => el.localName === 'row')) {
          seenRows++;
          if (seenRows > MAX_ROWS) throw Error('Workbook exceeds the 10,000-row limit.');
          const number = Number(row.getAttribute('r') || rows.length + 1);
          if (!Number.isInteger(number) || number < 1 || number > 1048576) throw Error('Invalid Excel row number.');
          const vals = [];
          for (const cell of Array.from(row.children).filter(el => el.localName === 'c')) {
            const ix = colNum(cell.getAttribute('r')) - 1;
            const type = cell.getAttribute('t') || '';
            let value = text(first(cell, 'v'));
            if (type === 's') {
              const number = Number(value);
              value = Number.isInteger(number) && number >= 0 && number < shared.length ? shared[number] : '';
            } else if (type === 'inlineStr') {
              const node = first(cell, 'is');
              value = node ? elements(node, 't').map(text).join('') : '';
            }
            if (first(cell, 'f')) formulaCount++;
            vals[ix] = String(value ?? '');
          }
          if (vals.some(v => v && String(v).trim())) {
            for (let i = 0; i < vals.length; i++) vals[i] ??= '';
            rows.push({number, values: vals});
          }
        }
      }
      sheets.push({name: sh.getAttribute('name') || 'Sheet ' + (sheets.length + 1), rows, formulas: formulaCount});
    }
    if (!sheets.length) throw Error('No readable worksheets were found.');
    return {sheets};
  }
  root.HIPXlsx = {readXlsx};
})(typeof window === 'undefined' ? globalThis : window);
