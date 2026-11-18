"""Offline regression tests: python -m unittest -v test_ucf_scraper.py"""
import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scraper'))
from ucf_scraper import parse_results, hip_codes, attributes, lookup_subjects_on_page
from bs4 import BeautifulSoup

FIXTURE = '''<span id="SSR_CLSRCH_MTG1$0">COP 3502C - Computer Science I</span>
<table><tr><td><a id="MTG_CLASS_NBR$0">12345</a></td>
<td><a id="MTG_CLASSNAME$0">0001-LEC</a></td>
<td><span id="MTG_DAYTIME$0">Mo 10:00AM</span><span id="MTG_DAYTIME$1">We 10:00AM</span></td>
<td><span id="MTG_ROOM$0">CB1 101</span></td>
<td><span id="MTG_INSTR$0">Instructor A</span></td><td><img alt="Open"></td></tr></table>
<span id="SSR_CLSRCH_MTG1$1">ENC 1101 - Composition I</span>
<table><tr><td><a id="MTG_CLASS_NBR$2">23456</a></td>
<td><a id="MTG_CLASSNAME$2">0002-LEC</a></td><td><span id="MTG_INSTR$2">Instructor B</span></td></tr></table>'''

class ParserTests(unittest.TestCase):
    def test_subject_lookup_extraction(self):
        sample = '<table><tr><th>Subject</th><th>Description</th></tr><tr><td>COP</td><td>Computer Science</td></tr><tr><td>ENC</td><td>English</td></tr></table>'
        self.assertEqual(lookup_subjects_on_page(sample), ['COP', 'ENC'])

    def test_courses_do_not_bleed(self):
        a,b = parse_results(FIXTURE)
        self.assertEqual(a['course_code'], 'COP 3502C')
        self.assertEqual(b['course_code'], 'ENC 1101')
        self.assertEqual(b['instructor'], 'Instructor B')
        self.assertEqual(a['days_times'], 'Mo 10:00AM | We 10:00AM')
        self.assertEqual(a['status'], 'Open')
        self.assertEqual(a['hip_observation'], 'unknown_not_inspected')
    def test_live_wrapper_ids_and_search_input(self):
        html = FIXTURE.replace('id="SSR_CLSRCH_MTG1$0"', 'id="win0divSSR_CLSRSLT_WRK_GROUPBOX2GP$0"')
        html = html.replace('<a id="MTG_CLASS_NBR$0">12345</a>', '<span id="MTG_CLASS_NBR$span$0"><a id="MTG_CLASS_NBR$0">12345</a></span>')
        html += '<input id="SSR_CLSRCH_WRK_CLASS_NBR$14" value="">'
        self.assertEqual(len(parse_results(html)), 2)

    def test_missing_heading_fails(self):
        with self.assertRaises(ValueError):
            parse_results(FIXTURE.replace('SSR_CLSRCH_MTG1', 'unknown'))
    def test_missing_section_fails(self):
        with self.assertRaises(ValueError):
            parse_results(FIXTURE.replace('MTG_CLASSNAME', 'unknown'))
    def test_duplicate_number_fails(self):
        with self.assertRaises(ValueError):
            parse_results(FIXTURE.replace('23456','12345'))
    def test_hip_exact_codes_and_names(self):
        self.assertEqual(hip_codes('Research-Intensive; Integrative-Learning Experience; Service Learning; Global Learning'), ['GL','IE','RI','SL'])
        self.assertEqual(hip_codes('FRIDAY SLIDE GLASS FIELD'), [])
    def test_descriptions_not_attributes(self):
        s = BeautifulSoup('<p>Research Intensive Global Learning</p>', 'html.parser')
        self.assertEqual(attributes(s), [])
    def test_labeled_attributes(self):
        s = BeautifulSoup('<table><tr><td>Course Attributes:</td><td>HIP - RI</td></tr></table>', 'html.parser')
        self.assertEqual(hip_codes(' '.join(attributes(s))), ['RI'])

if __name__ == '__main__':
    unittest.main()
