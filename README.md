# UCF HIP Course Designation Checker

A web-based tool designed to help identify missing or inconsistent High-Impact Practice (HIP) course designations at the University of Central Florida.

The application compares UCF's publicly available class information against an authorized HIP Master Excel workbook, helping streamline course designation reviews.

## Features

- **HIP Designation Checking:** Supports Research-Intensive (RI), Integrative-Learning Experience (IE), Service-Learning (SL), and Global Learning (GL).
- **Excel Comparison:** Processes HIP Master workbooks directly in the browser.
- **Course-Level and Instructor-Level Matching:** Accounts for different HIP approval rules.
- **Discrepancy Detection:** Identifies possible missing designations and mismatched records.
- **Report Export:** Generates downloadable CSV and JSON results.
- **Weekly Automation Prototype:** Includes a GitHub Actions workflow for scheduled public course data collection, pending authorization and validation.

## How It Works

1. Public UCF class information is collected using Playwright.
2. The JavaScript application loads the collected class records.
3. Users upload an authorized HIP Master Excel file.
4. The application compares course and instructor designations.
5. Potential discrepancies are presented for review and export.

## Technologies

- JavaScript, HTML, CSS
- Python and Playwright (server-side public data collection)
- GitHub Pages
- GitHub Actions
- Excel, CSV, and JSON

## Project Status

The browser-based comparison application has been implemented and locally tested.

Full-catalog automated collection is experimental and is not yet verified or enabled. Weekly scraping requires appropriate university authorization.

## Privacy and Security

HIP Master workbooks are processed locally in the browser rather than uploaded to the public GitHub repository. Internal university records are not included in the published project.

## Purpose

This project explores how browser-based tools and automated data collection can reduce manual course designation checks, improve data consistency, and support university reporting workflows.

*Independent prototype developed for exploring HIP course designation auditing. Not an official UCF service.*
