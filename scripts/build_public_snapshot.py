#!/usr/bin/env python3
"""Collect public, section-level UCF records via the existing scraper.

A full snapshot is published ONLY when subject discovery and every configured
term x subject search finish successfully. On any failure, latest.json and
status.json remain untouched (stale, but never mislabeled fresh). No internal
HIP Master files are read or published.
"""
from __future__ import annotations
import argparse
import json
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRAPER = ROOT / 'scraper' / 'ucf_scraper.py'

def read_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))

def invoke(args, timeout=1200):
    proc = subprocess.run([sys.executable, str(SCRAPER), *args],
                          text=True, capture_output=True, timeout=timeout, cwd=ROOT)
    if proc.returncode:
        raise RuntimeError(f"Public scraper stopped: {' '.join(args)}\n" + (proc.stderr or proc.stdout)[-1800:])
    return proc

def run_folder(base: Path):
    children = sorted([p for p in base.iterdir() if p.is_dir()])
    if len(children) != 1:
        raise RuntimeError(f'Expected one scraper run folder under {base}, got {len(children)}')
    return children[0]

def discover_subjects(temp: Path, config: dict) -> list[str]:
    explicit = config.get('subject_codes', [])
    if explicit:
        if not config.get('subject_codes_verified_exhaustive', False):
            raise RuntimeError('Explicit subject list is not certified exhaustive. Verify it against the current public lookup and set subject_codes_verified_exhaustive=true; otherwise use automatic lookup.')
        codes = [x.strip().upper() for x in explicit]
        if len(set(codes)) != len(codes):
            raise RuntimeError('Duplicate subject codes in config')
        return codes
    subject_dir = temp / 'subjects'
    subject_dir.mkdir()
    invoke(['--list-subjects', '--output', str(subject_dir),
            '--max-pages', str(config.get('max_subject_lookup_pages', 30)),
            '--delay', str(config.get('delay_seconds', 3))], timeout=720)
    data = read_json(run_folder(subject_dir) / 'subjects.json')
    if data.get('complete') is not True or not data.get('subjects'):
        raise RuntimeError('Public Subject lookup did not confirm a complete list; refusing incomplete catalog.')
    return data['subjects']

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--config',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    args=p.parse_args()
    cfg=read_json(args.config)
    terms = [str(t) for t in cfg.get('terms', [])]
    if not terms or not all(re.fullmatch(r'\d{4}', t) for t in terms):
        raise RuntimeError('Specify validated term IDs in public_targets.json.')
    if cfg.get('scope') != 'all_public_subjects':
        raise RuntimeError('Only all_public_subjects is enabled for Monday collection.')
    start=time.monotonic()
    max_seconds=int(cfg.get('max_run_seconds', 19200))
    out=args.out
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='ucf-public-') as temporary:
        temp=Path(temporary)
        subjects=discover_subjects(temp,cfg)
        if not subjects:
            raise RuntimeError('No publicly discoverable subjects.')
        print(f'Discovered {len(subjects)} subject codes (scope validation required).',flush=True)
        records=[]; runs=[]; seen=set()
        for term in terms:
            for i,subject in enumerate(subjects,1):
                if not re.fullmatch(r'[A-Z]{2,4}', subject):
                    raise RuntimeError(f'Invalid public subject code {subject!r}')
                if time.monotonic()-start > max_seconds:
                    raise RuntimeError('Run budget exceeded before full subject coverage.')
                dest=temp / f'{term}-{subject}'
                dest.mkdir()
                print(f'[{term} {i}/{len(subjects)}] {subject}',flush=True)
                invoke(['--term', term, '--subject', subject, '--output', str(dest),
                        '--max-pages',str(cfg.get('max_pages_per_search',30)),
                        '--delay',str(cfg.get('delay_seconds',3))], timeout=min(3000,max_seconds))
                run=run_folder(dest)
                meta=read_json(run / 'run.json')
                if (meta.get('status') not in ('completed_visible_results','no_results')
                    or meta.get('subject') != subject
                    or str(meta.get('term')) != term
                    or meta.get('course') or meta.get('class_number') or meta.get('error')):
                    raise RuntimeError(f'{term} {subject} incomplete or narrowly filtered; refusing publication.')
                sections=read_json(run / 'classes.json')
                if len(sections) != meta.get('record_count'):
                    raise RuntimeError(f'{term} {subject} count mismatch.')
                for row in sections:
                    key=(str(row.get('term')),str(row.get('class_number')))
                    if key in seen: raise RuntimeError(f'Duplicate section {key}')
                    seen.add(key)
                    if row.get('hip_observation') not in ('observed','no_recognized_hip_in_visible_attributes','unknown_attributes_not_found'):
                        raise RuntimeError(f'{term} {subject}: section detail not inspected.')
                    records.append(row)
                runs.append({'term':term,'subject':subject,'course':None,
                             'status':meta['status'],'record_count':len(sections),
                             'details_requested':True})
        if not records:
            raise RuntimeError('All searches returned zero sections; do not publish.')
        now=datetime.now(timezone.utc).isoformat()
        scope_note = ('Automated publicly visible subject searches only; does not certify institutional '
                      'catalog completeness or internal HIP approval. Verify UCF search coverage.')
        payload={'status':'completed_public_subject_searches','generated_utc':now,'terms':terms,
                 'subjects':subjects,'records_count':len(records),'runs':runs,'rows':records,
                 'coverage_note':scope_note}
        # Atomic replace only after every configured search validated successfully.
        staging=out / 'latest.json.tmp'
        staging.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),encoding='utf8')
        staging.replace(out/'latest.json')
        status={'status':'completed_public_subject_searches','attempted_utc':now,
                'subjects_attempted':len(subjects),'terms':terms,'records_count':len(records),
                'message':scope_note}
        staging=out/'status.json.tmp'
        staging.write_text(json.dumps(status,indent=2),encoding='utf8')
        staging.replace(out/'status.json')
        print(f'Validated public snapshot: {len(records)} sections / {len(subjects)} subjects / {len(terms)} terms.',flush=True)

if __name__=='__main__':
    try: main()
    except Exception as exc:
        print('FULL SNAPSHOT NOT PUBLISHED:',exc,file=sys.stderr)
        sys.exit(1)
