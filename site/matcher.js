/* Deterministic, indexed HIP designation comparison. No network calls or AI. */
(function (root) {
  'use strict';
  const RECOGNIZED = ['GL', 'IE', 'RI', 'SL'];
  const str = v => String(v ?? '').trim();
  const norm = v => str(v).normalize('NFKC').toLowerCase().replace(/\b(?:dr|prof)\.?\s+/g, '').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  const courseCode = v => {
    const m = str(v).toUpperCase().match(/^([A-Z]{2,4})[\s-]*(\d{4}[A-Z]?)$/);
    return m ? m[1] + ' ' + m[2] : null;
  };
  function expectedCodes(value) {
    const raw = str(value);
    if (!raw) return null;
    if (/^(none|no hip|n\/?a)$/i.test(raw)) return [];
    // 'SL or IE' is deliberately unresolved rather than interpreted as both.
    if (/\b(?:or|and\/or|either)\b/i.test(raw)) return null;
    let s = raw.toUpperCase()
      .replace(/RESEARCH[\s-]+INTENSIVE/g, 'RI')
      .replace(/INTEGRATIVE[\s-]+(?:LEARNING(?:[\s-]+EXPERIENCE)?|EXPERIENCE)/g, 'IE')
      .replace(/SERVICE[\s-]+LEARNING/g, 'SL')
      .replace(/GLOBAL[\s-]+LEARNING/g, 'GL')
      .replace(/\bHIP\b/g, '');
    const tokens = s.split(/[\s,;|/()+-]+/).filter(Boolean);
    if (!tokens.length || !tokens.every(t => RECOGNIZED.includes(t))) return null;
    return [...new Set(tokens)].sort();
  }
  function observedCodes(rec) {
    let raw = rec.hip_designations ?? [];
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { raw = raw.split(/[|,;]/); }
    }
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.map(x => str(x).toUpperCase()).filter(x => RECOGNIZED.includes(x)))].sort();
  }
  function displayCourse(row, map) {
    const prefix = str(row.values[map.course]);
    const combined = courseCode(prefix);
    if (combined) return combined;
    return courseCode(prefix + (map.number != null ? ' ' + str(row.values[map.number]) : ''));
  }
  function val(row, index) { return index == null ? '' : str(row.values[index]); }
  function personMatches(expected, actual) {
    const e = norm(expected);
    if (!e) return false;
    return str(actual).split(/[|;]/).some(p => norm(p) === e);
  }
  function compare({dataRows, mapping, publicRows, runs, term}) {
    const byCourse = new Map();
    for (const publicRow of publicRows) {
      if (term && str(publicRow.term) !== term) continue;
      const code = courseCode(publicRow.course_code);
      if (!code) continue;
      if (!byCourse.has(code)) byCourse.set(code, []);
      byCourse.get(code).push(publicRow);
    }
    // A completed subject-wide search provides coverage evidence for all courses
    // in that term/subject; narrowly filtered single-course searches cover one.
    const byRun = new Map(), bySubjectRun = new Map();
    for (const r of runs) {
      if (term && str(r.term) !== term) continue;
      const subject = str(r.subject).toUpperCase();
      const code = courseCode(subject + ' ' + str(r.course));
      const store = code ? byRun : bySubjectRun;
      const key = code || subject;
      if (!key) continue;
      if (!store.has(key)) store.set(key, []);
      store.get(key).push(r);
    }
    const out = [];
    for (const row of dataRows) {
      const code = displayCourse(row, mapping);
      const expectedText = val(row, mapping.hip);
      const expected = expectedCodes(expectedText);
      const levelText = val(row, mapping.level);
      const courseLevel = /^course\s*[- ]?\s*level$/i.test(levelText);
      const instructorLevel = /^(?:instructor|section)\s*[- ]?\s*level$/i.test(levelText);
      const instructor = [val(row, mapping.instructor), val(row, mapping.last)].filter(Boolean).join(' ');
      const classNumber = val(row, mapping.classNumber);
      const visible = byCourse.get(code) || [];
      const runItems = [...(byRun.get(code) || []), ...(code ? (bySubjectRun.get(code.split(' ')[0]) || []) : [])];
      const complete = runItems.some(r => ['completed_visible_results', 'no_results'].includes(r.status) && !r.class_number && !r.error && r.details_requested !== false);
      const hasPartial = runItems.some(r => !['completed_visible_results', 'no_results'].includes(r.status) || !!r.class_number || !!r.error);
      const matched = visible.filter(r => (!classNumber || str(r.class_number) === classNumber) && (courseLevel || !instructor || personMatches(instructor, r.instructor)));
      const hip = [...new Set(matched.flatMap(observedCodes))].sort();
      let outcome = 'Unknown';
      let note = '';
      if (!code) note = 'Invalid course prefix/catalog number in this master row.';
      else if (mapping.level == null || (!courseLevel && !instructorLevel)) note = 'Designation level is missing or unrecognized; choose a valid level.';
      else if (instructorLevel && !instructor && !classNumber) note = 'Instructor-level record needs an instructor or class number for matching.';
      else if (expected === null) note = 'Expected HIP is blank or ambiguous (for example “SL or IE”).';
      else if (!visible.length) {
        outcome = complete ? 'Not returned' : 'Not checked';
        note = complete ? 'No matching section appeared in this completed public course search; not proof of a HIP tag error.' : 'No completed public search for this course was provided. This is not a HIP discrepancy.';
      } else if (!matched.length) {
        outcome = 'Not returned';
        note = 'Public course sections exist, but none match the mapped instructor/class number. Check identity and coverage.';
      } else if (matched.some(r => !['observed', 'no_recognized_hip_in_visible_attributes'].includes(r.hip_observation))) {
        note = 'One or more matching sections has unknown/uninspected public attributes.';
      } else {
        const different = matched.filter(r => JSON.stringify(observedCodes(r)) !== JSON.stringify(expected));
        if (different.length) {
          outcome = 'Review difference';
          note = `${different.length} of ${matched.length} visible matched section(s) differ from this expected HIP set; review individual attributes.`;
        } else if (complete && !hasPartial) {
          outcome = 'Match';
          note = 'All matched sections in a completed public course search show this HIP set.';
        } else {
          outcome = 'Provisional match';
          note = 'Visible matched sections agree; full course search coverage was not verified.';
        }
      }
      out.push({
        workbook_row: row.number, course_code: code || val(row, mapping.course), instructor,
        designation_level: levelText, expected_text: expectedText,
        expected_hip: expected === null ? '' : expected.join(', ') || 'None',
        public_hip: hip.join(', ') || (matched.length ? 'No HIP observed' : ''),
        matched_sections: matched.length,
        class_numbers: matched.map(r => str(r.class_number)).filter(Boolean).join(' | '),
        term: term || [...new Set(matched.map(r => str(r.term)))].join(', '),
        coverage: complete && !hasPartial ? 'complete public search' : 'not verified / partial',
        outcome, note,
        attribute_evidence: matched.map(r => `${r.class_number}: ${Array.isArray(r.attribute_evidence) ? r.attribute_evidence.join(' | ') : str(r.attribute_evidence)}`).join(' || '),
        source_url: matched[0]?.source_url || ''
      });
    }
    return out;
  }
  const api = {norm, courseCode, expectedCodes, observedCodes, displayCourse, personMatches, compare};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.HIPMatcher = api;
})(typeof window === 'undefined' ? globalThis : window);
