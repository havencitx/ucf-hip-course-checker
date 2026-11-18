/* HIP Workspace — static, browser-only edition. Nothing is uploaded. */
'use strict';
const $ = id => document.getElementById(id);
const {readXlsx} = HIPXlsx;
const M = HIPMatcher;
const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let workbook = null, publicRows = [], runs = [], comparison = [], activeTerm = '', mode = 'public', currentPage = 1;
let imported = [], conflictCount = 0;
const PAGE_SIZE = 15;
function notify(message) { $('notice').textContent = message || ''; $('notice').hidden = !message; }
function log(message) { $('log').textContent = `${new Date().toLocaleTimeString()} · ${message}\n` + $('log').textContent.slice(0, 2400); }
function fileLabel() {
  $('publicFileName').textContent = imported.length ? `${imported.length} public file(s) selected` : 'Select public class results';
}
function publicForTerm() { return publicRows.filter(r => !activeTerm || String(r.term ?? '') === activeTerm); }
function displayStatus(r) {
  if (r.hip_observation === 'observed') return `<span class="tag good">${escapeHTML(M.observedCodes(r).join(' · ') || 'HIP observed')}</span>`;
  if (r.hip_observation === 'no_recognized_hip_in_visible_attributes') return '<span class="tag">No HIP observed</span>';
  return '<span class="tag warn">Unknown</span>';
}
function updateStats() {
  const visible = publicForTerm();
  const observed = visible.filter(r => r.hip_observation === 'observed').length;
  const none = visible.filter(r => r.hip_observation === 'no_recognized_hip_in_visible_attributes').length;
  $('total').textContent = visible.length;
  $('hipCount').textContent = observed;
  $('noneCount').textContent = none;
  $('unknownCount').textContent = visible.length - observed - none;
  $('source').textContent = imported.length ? `${visible.length} sections · ${imported.length} file(s) · ${activeTerm || 'all terms'} · ${runs.filter(r => ['completed_visible_results','no_results'].includes(r.status)).length} completed course-run records` : 'No public results loaded.';
  $('activityTitle').textContent = comparison.length ? `${comparison.length} master rows compared` : (publicRows.length ? 'Public results loaded' : 'Ready when you are');
  $('activityText').textContent = comparison.length ? `Review difference: ${comparison.filter(r => r.outcome === 'Review difference').length} · Match: ${comparison.filter(r => r.outcome === 'Match').length} · Provisional: ${comparison.filter(r => r.outcome === 'Provisional match').length} · Unknown/not returned: ${comparison.filter(r => ['Unknown','Not returned','Not checked'].includes(r.outcome)).length}` : `${publicRows.length} public sections are loaded. Add the HIP Master Excel file, verify column mappings, then compare.`;
  $('state').textContent = 'No server · No AI';
}
function filtered() {
  const data = mode === 'public' ? publicForTerm() : comparison;
  const search = $('filter').value.trim().toLowerCase();
  return search ? data.filter(r => JSON.stringify(r).toLowerCase().includes(search)) : data;
}
function render() {
  updateStats();
  $('publicTab').classList.toggle('selected', mode === 'public');
  $('comparisonTab').classList.toggle('selected', mode === 'comparison');
  $('comparisonNote').hidden = mode !== 'comparison';
  $('resultsTitle').textContent = mode === 'public' ? 'Public search results' : 'Master workbook comparison';
  $('comparisonCount').textContent = comparison.length ? `(${comparison.length})` : '';
  const data = filtered();
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  currentPage = Math.max(1, Math.min(currentPage, totalPages));
  const items = data.slice((currentPage-1)*PAGE_SIZE, currentPage*PAGE_SIZE);
  const heads = mode === 'public' ? ['Course / section', 'Instructor', 'HIP observation', 'Attribute evidence'] : ['Workbook row / course', 'Expected', 'Public result', 'Review'];
  $('thead').innerHTML = '<tr>' + heads.map(x=>`<th>${x}</th>`).join('') + '</tr>';
  $('tbody').innerHTML = items.length ? items.map(r => {
    if (mode === 'public') {
      const evidence = Array.isArray(r.attribute_evidence) ? r.attribute_evidence.join(' | ') : String(r.attribute_evidence ?? '');
      return `<tr><td><b>${escapeHTML(r.course_code)}</b><small>Class ${escapeHTML(r.class_number)} · ${escapeHTML(r.section || '—')} · ${escapeHTML(r.term || '?')}</small></td><td>${escapeHTML(r.instructor || 'Not listed')}</td><td>${displayStatus(r)}<small>${escapeHTML(r.hip_observation || 'unknown')}</small></td><td>${escapeHTML(evidence || 'No attributes captured')}<small>${escapeHTML(r.source_url || '')}</small></td></tr>`;
    }
    const type = r.outcome === 'Match' ? 'good' : r.outcome === 'Review difference' ? 'bad' : 'warn';
    return `<tr><td><b>${escapeHTML(r.course_code)}</b><small>Excel row ${escapeHTML(r.workbook_row)} · ${escapeHTML(r.designation_level)}</small><small>${escapeHTML(r.instructor)}</small></td><td>${escapeHTML(r.expected_text || 'Unspecified')}</td><td>${escapeHTML(r.public_hip || 'No matching public observation')}<small>${escapeHTML(r.matched_sections)} matched section(s) · ${escapeHTML(r.class_numbers)}</small></td><td><span class="tag ${type}">${escapeHTML(r.outcome)}</span><small>${escapeHTML(r.note)}</small><small>${escapeHTML(r.coverage)}</small></td></tr>`;
  }).join('') : `<tr><td class="empty" colspan="4">${mode === 'public' ? 'Import public class data to begin.' : 'Load a master workbook and click Compare.'}</td></tr>`;
  $('rowCount').textContent = `${data.length} ${mode === 'public' ? 'sections' : 'master rows'}`;
  $('pageNumber').textContent = `Page ${currentPage} of ${totalPages}`;
  $('prev').disabled = currentPage === 1;
  $('next').disabled = currentPage >= totalPages;
}
function inferObservation(row) {
  if (['observed','no_recognized_hip_in_visible_attributes','unknown_attributes_not_found','unknown_not_inspected'].includes(row.hip_observation)) return row.hip_observation;
  return 'unknown_not_inspected'; // Never infer a negative HIP observation from an empty list.
}
function importRows(data) {
  let added = 0;
  for (const item of data) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const code = M.courseCode(item.course_code);
    const num = String(item.class_number ?? '').trim();
    if (!code || !/^\d{4,6}$/.test(num)) continue;
    publicRows.push({...item, course_code:code, class_number:num,
      term:String(item.term ?? ''), hip_observation: inferObservation(item)});
    added++;
  }
  return added;
}
function mergePublic() {
  // The same term/class may occur across multiple imported exports. Keep the newest one.
  const index = new Map(); conflictCount = 0;
  for (const row of publicRows) {
    const key = `${row.term}|${row.class_number}`;
    if (index.has(key)) {
      conflictCount++;
      const old = index.get(key);
      if (String(row.fetched_utc || '') >= String(old.fetched_utc || '')) index.set(key, row);
    } else index.set(key, row);
  }
  publicRows = [...index.values()];
}
function chooseTerm() {
  const previous = activeTerm;
  const terms = [...new Set(publicRows.map(r => r.term).filter(Boolean))].sort();
  $('termFilter').innerHTML = '<option value="">All imported terms</option>' + terms.map(t=>`<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join('');
  activeTerm = terms.includes(previous) ? previous : (terms.length === 1 ? terms[0] : '');
  $('termFilter').value = activeTerm;
  if (terms.length > 1 && !activeTerm) notify('Results contain multiple semesters. Choose one semester before comparing the workbook.');
}
function parseCsv(raw) {
  const s = raw.replace(/^\uFEFF/, '');
  const matrix = []; let row = [], value = '', quoted = false;
  for (let i=0; i<s.length; i++) {
    const c = s[i];
    if (quoted && c === '"' && s[i+1] === '"') {value += '"'; i++;}
    else if (c === '"') quoted = !quoted;
    else if (!quoted && c === ',') {row.push(value); value = '';}
    else if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && s[i+1] === '\n') i++;
      row.push(value); matrix.push(row); row = []; value = '';
    } else value += c;
  }
  if (quoted) throw Error('CSV contains an unterminated quotation mark.');
  if (value || row.length) {row.push(value); matrix.push(row);}
  const header = matrix.shift()?.map(h => h.trim()) || [];
  if (!header.includes('course_code') || !header.includes('class_number')) throw Error('Expected course_code and class_number columns.');
  return matrix.map(r => Object.fromEntries(header.map((h,i) => [h, r[i] ?? ''])));
}
async function loadPublic(files) {
  if (!files?.length) return;
  try {
    notify(''); let added = 0;
    for (const file of files) {
      if (file.size > 12*1024*1024) throw Error(`${file.name} is too large (12 MB max).`);
      const raw = await file.text();
      let payload;
      if (/\.json$/i.test(file.name)) payload = JSON.parse(raw);
      else if (/\.csv$/i.test(file.name)) payload = parseCsv(raw);
      else throw Error('Choose JSON or CSV class-result files.');
      const sourceRows = Array.isArray(payload) ? payload : (Array.isArray(payload.rows) ? payload.rows : []);
      added += importRows(sourceRows);
      const newRuns = Array.isArray(payload.runs) ? payload.runs : [];
      if (payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)) newRuns.push(payload.metadata);
      if (!Array.isArray(payload) && payload.status && payload.subject && payload.course) newRuns.push(payload);
      for (const r of newRuns) if (r && typeof r === 'object') runs.push(r);
      imported.push(file.name);
      log(`Imported ${file.name}`);
    }
    mergePublic(); chooseTerm(); comparison = []; mode='public'; currentPage=1;
    fileLabel(); render();
    if (!added && !runs.length) notify('No recognized class sections were found. Choose a classes.json/classes.csv file from the scraper.');
    else if (conflictCount) notify(`${conflictCount} repeated class/term record(s) deduplicated; newest timestamps retained. Verify overlapping exports.`);
    $('courseProgress').textContent = `Loaded ${publicRows.length} unique public sections. ${runs.length} run metadata record(s). No data left this browser.`;
  } catch (e) { notify('Import problem: '+e.message); log('ERROR '+e.message); }
  finally {$('publicFiles').value='';}
}
function currentSheet() {return workbook?.sheets[Number($('sheet').value)] || null;}
function headerIndex() {return Number($('headerRow').value || 0);}
function headers() {return currentSheet()?.rows[headerIndex()]?.values || [];}
function dataRows() {return currentSheet()?.rows.slice(headerIndex()+1) || [];}
const hints = [
  ['mapCourse',/^course prefix$|course.*(?:code|prefix)|^course$/i],
  ['mapNumber',/^catalog nbr$|catalog.*(?:nbr|number)|^course number$/i],
  ['mapHip',/^designation \(ri|hip|^designation/i],
  ['mapLevel',/instructor or course level|designation level|^level$/i],
  ['mapInstructor',/^instructor first$|instructor.*(?:first|full)|^instructor$|^faculty$/i],
  ['mapLast',/^instructor last$|instructor.*last/i],
  ['mapClass',/class.*(?:number|nbr)|^class$/i]
];
function resetCompare() {comparison=[]; if (mode === 'comparison') render();}
function populateMaps() {
  const hs = headers();
  for (const [id, pattern] of hints) {
    const select = $(id);
    select.innerHTML = '<option value="">Not mapped</option>' + hs.map((h, i)=>`<option value="${i}">${escapeHTML(h || 'Column '+(i+1))} [${i+1}]</option>`).join('');
    const guessed = hs.findIndex(h => pattern.test(String(h).trim()));
    select.value = guessed < 0 ? '' : String(guessed);
  }
  $('workbookInfo').textContent = `${dataRows().length} rows in this sheet. ${currentSheet()?.formulas || 0} formulas use their last saved values; check Excel recalculation before using.`;
  resetCompare();
}
function sheetChanged() {
  const sh=currentSheet();
  $('headerRow').innerHTML = (sh?.rows || []).slice(0, 25).map((r,i)=>`<option value="${i}">Row ${r.number}</option>`).join('');
  $('headerRow').value='0';
  populateMaps();
}
async function loadWorkbook(file) {
  if (!file) return;
  try {
    notify(''); $('fileName').textContent = 'Reading workbook…';
    workbook = await readXlsx(file);
    $('fileName').textContent = file.name;
    $('mapping').hidden = false;
    $('sheet').innerHTML = workbook.sheets.map((s,i)=>`<option value="${i}">${escapeHTML(s.name)}</option>`).join('');
    const preferred = workbook.sheets.findIndex(s => /^1\.\s*courses with designation/i.test(s.name));
    $('sheet').value = String(Math.max(0, preferred));
    sheetChanged();
    log(`Read ${file.name} (${workbook.sheets.length} sheets) locally`);
    render();
  } catch (e) {workbook=null; $('mapping').hidden=true; $('fileName').textContent='Choose an Excel workbook'; notify('Workbook problem: '+e.message); log('ERROR '+e.message);}
  finally {$('file').value='';}
}
function mapped(id) {return $(id).value === '' ? null : Number($(id).value);}
function currentMapping() {return {course:mapped('mapCourse'),number:mapped('mapNumber'),hip:mapped('mapHip'),level:mapped('mapLevel'),instructor:mapped('mapInstructor'),last:mapped('mapLast'),classNumber:mapped('mapClass')};}
function compareNow() {
  try {
    notify('');
    if (!workbook) throw Error('Import a HIP master workbook first.');
    if (!publicRows.length) throw Error('Import public UCF class results first.');
    if (new Set(publicRows.map(r=>r.term).filter(Boolean)).size>1 && !activeTerm) throw Error('Choose one semester before comparing.');
    const mapping = currentMapping();
    if (mapping.course == null || mapping.hip == null || mapping.level == null) throw Error('Map the course prefix/code, expected HIP, and designation level columns first.');
    const started=performance.now();
    comparison = M.compare({dataRows:dataRows(),mapping,publicRows,runs,term:activeTerm});
    mode='comparison'; currentPage=1;render();
    const elapsed=Math.round(performance.now()-started);
    log(`Compared ${comparison.length} master rows with ${publicRows.length} imported sections in ${elapsed} ms`);
    $('courseProgress').textContent = `Comparison completed in ${elapsed} ms (local matching only; not network collection).`;
  } catch(e) {notify(e.message);}
}
function download() {
  const data=filtered(), format=$('format').value;
  let payload, mime;
  if (format==='json') {payload=JSON.stringify({term:activeTerm,view:mode,records:data,generated_utc:new Date().toISOString(),coverage_note:'Public observed attributes, not institutional approval.'},null,2);mime='application/json';}
  else {
    const keys=mode==='comparison' ? ['workbook_row','course_code','instructor','designation_level','expected_text','expected_hip','public_hip','matched_sections','class_numbers','term','coverage','outcome','note','attribute_evidence','source_url'] : ['term','course_code','course_title','section','class_number','instructor','hip_designations','hip_observation','attribute_evidence','source_url','fetched_utc'];
    const csvValue=value=>{
      let v=Array.isArray(value)?value.join(' | '):String(value ?? '');
      if (/^[\s]*[=+@-]/.test(v)) v="'"+v;
      return '"'+v.replace(/"/g,'""')+'"';
    };
    payload='\ufeff'+[keys.map(csvValue).join(','),...data.map(row=>keys.map(key=>csvValue(row[key])).join(','))].join('\r\n');mime='text/csv;charset=utf-8';
  }
  const url=URL.createObjectURL(new Blob([payload],{type:mime}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=`hip-${mode}-${activeTerm||'all'}-${new Date().toISOString().slice(0,10)}.${format}`;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

// Scheduled public snapshots contain only UCF public class data. Never send the uploaded
// master workbook to GitHub or an API. Static JSON availability is deployment-dependent.
async function loadScheduled() {
  const statusEl=$('autoStatus');
  statusEl.textContent='Checking published public snapshot…';
  try {
    const statusResponse=await fetch('public-data/status.json', {cache:'no-store'});
    if (!statusResponse.ok) throw Error('Public data status could not be loaded.');
    const status=await statusResponse.json();
    if (status.status !== 'completed_public_subject_searches') {
      statusEl.textContent='No completed Monday snapshot yet. Use the public JSON/CSV importer for now.';
      return;
    }
    const response=await fetch('public-data/latest.json',{cache:'no-store'});
    if (!response.ok) throw Error('Published snapshot JSON is missing.');
    const payload=await response.json();
    if (payload.status !== status.status || !Array.isArray(payload.rows) || !Array.isArray(payload.runs) || payload.rows.length !== payload.records_count || payload.records_count !== status.records_count) {
      throw Error('Snapshot metadata disagrees with the public records; refusing it.');
    }
    if (!payload.rows.length || !payload.runs.length) throw Error('Scheduled snapshot has no verified rows or runs.');
    publicRows=[]; runs=[]; imported=[]; comparison=[]; activeTerm='';
    const count=importRows(payload.rows);
    if (count !== payload.rows.length) throw Error('Snapshot has invalid class identities; refusing it.');
    runs=payload.runs.map(x=>({...x}));
    imported.push('GitHub public snapshot · '+payload.generated_utc);
    mergePublic();chooseTerm();mode='public';currentPage=1;fileLabel();render();
    const date=new Date(payload.generated_utc);
    const age=Date.now()-date.getTime();
    const stale=Number.isFinite(age)&&age>8*86400000;
    statusEl.textContent=`Last successful public collection: ${date.toLocaleString()} · ${count} sections across ${payload.subjects?.length||'?'} subjects.${stale?' Older than 8 days; verify before use.':''}`;
    if (stale) notify('The most recent published public snapshot is over 8 days old. Do not treat it as current.');
    $('courseProgress').textContent='Public data loaded from verified scheduled snapshot. Internal HIP workbook stays on this device.';
    log(`Loaded published snapshot with ${count} public sections.`);
  } catch(e) {
    statusEl.textContent='Automated snapshot unavailable: '+e.message+' Import public JSON/CSV manually.';
    log('Scheduled public snapshot: '+e.message);
  }
}
$('loadScheduled').onclick=loadScheduled;

$('publicFiles').onchange = e=>loadPublic([...e.target.files]);
$('publicDrop').ondragover=e=>e.preventDefault();
$('publicDrop').ondrop=e=>{e.preventDefault();loadPublic([...e.dataTransfer.files]);};
$('file').onchange=e=>loadWorkbook(e.target.files[0]);
$('drop').ondragover=e=>e.preventDefault();
$('drop').ondrop=e=>{e.preventDefault();loadWorkbook(e.dataTransfer.files[0]);};
$('termFilter').onchange=e=>{activeTerm=e.target.value;comparison=[];mode='public';currentPage=1;render();};
$('clearResults').onclick=()=>{publicRows=[];runs=[];imported=[];comparison=[];activeTerm='';fileLabel();chooseTerm();render();log('Cleared public results');};
$('sample').onclick=()=>{
  importRows([{course_code:'COP 3502C',course_title:'Computer Science I',class_number:'10917',section:'0001',instructor:'Tanvir Ahmed',term:'1890',hip_designations:[],hip_observation:'no_recognized_hip_in_visible_attributes',attribute_evidence:['Class Attributes','Interdisciplinary-Computational Science'],source_url:'https://csprod-ss.net.ucf.edu/psc/CSPROD/EMPLOYEE/SA/c/COMMUNITY_ACCESS.CLASS_SEARCH.GBL',fetched_utc:'2026-11-12T15:41:37Z'}]);
  imported.push('built-in public sample · COP 3502C');mergePublic();chooseTerm();comparison=[];mode='public';currentPage=1;fileLabel();render();log('Loaded dated sample from uploaded public scraper output');
};
$('sheet').onchange=sheetChanged;
$('headerRow').onchange=populateMaps;
for(const [id] of hints) $(id).onchange=resetCompare;
$('clearWorkbook').onclick=()=>{workbook=null;comparison=[];$('mapping').hidden=true;$('fileName').textContent='Choose an Excel workbook';render();log('Cleared workbook');};
$('preview').onclick=()=>{
  const hs=headers();
  $('previewTable').innerHTML='<table><thead><tr><th>Row</th>'+hs.map(h=>`<th>${escapeHTML(h)}</th>`).join('')+'</tr></thead><tbody>'+dataRows().slice(0,20).map(r=>`<tr><td>${r.number}</td>${hs.map((_,i)=>`<td>${escapeHTML(r.values[i]||'')}</td>`).join('')}</tr>`).join('')+'</tbody></table>';
  $('previewDialog').showModal();
};
$('closePreview').onclick=()=>$('previewDialog').close();
$('compare').onclick=compareNow;
$('download').onclick=download;
$('publicTab').onclick=()=>{mode='public';currentPage=1;render();};
$('comparisonTab').onclick=()=>{mode='comparison';currentPage=1;render();};
$('filter').oninput=()=>{currentPage=1;render();};
$('prev').onclick=()=>{currentPage--;render();};
$('next').onclick=()=>{currentPage++;render();};
render();
loadScheduled();
