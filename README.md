# UCF HIP Course Designation Checker — GitHub Pages Edition

> Independent proof of concept; not an official UCF service. The public search is the observation source, not the institutional approval system. Intended for use **only with UCF's authorization**.

A zero-backend-for-users browser interface for comparing publicly visible UCF class-section HIP attributes (RI, IE, SL, GL) with a HIP Master `.xlsx` workbook **in memory on the user's computer**. The site is static JavaScript hosted by GitHub Pages. A separate GitHub Actions workflow can, *when explicitly approved*, run Python + Playwright on GitHub's server every Monday to collect updated **public** UCF class information. UCF computers never install Python or run a scraper.

**Current status:** Site conversion is implemented and locally tested. The Monday full-catalog collector is experimental and **disabled by default**. The public Subject lookup, unrestricted subject searches, runtime, and institutional authorization have **not** been verified for the full catalog. Do not describe this as a completed unattended full-catalog audit until a real end-to-end run succeeds and its coverage has been independently checked.

## Publish on **your** GitHub account

1. On your **personal Mac**, extract the ZIP containing this README, `.github/`, `site/`, `scraper/`, `scripts/`, and `tests/`. Keep the hidden `.github` folder! In Finder press **Command+Shift+.** to display hidden folders.
2. Create a **public** GitHub repository named `ucf-hip-course-checker` at https://github.com/new. (Do not add a starter README if you're going to use the Terminal method below.)
3. In Terminal, run these commands **inside the extracted `UCF_HIP_Monday_Automation` directory**:

   ```bash
   cd /path/to/UCF_HIP_Monday_Automation
   git init -b main
   git add .
   git commit -m "Initial HIP checker site and automation prototype"
   git remote add origin https://github.com/YOUR-USERNAME/ucf-hip-course-checker.git
   git push -u origin main
   ```

   Or use **GitHub Desktop**: File → Add Local Repository → Create a repository here → Commit → Publish repository. Make it **public**. If GitHub asks you to sign in, use normal GitHub authentication; don't put tokens in source files.
4. On the repo page choose **Settings → Pages → Build and deployment → Source: GitHub Actions**. The supplied `.github/workflows/deploy.yml` deploys the `site/` folder. From **Actions**, run `Deploy HIP Checker website` manually once if the deployment did not start automatically.
5. Your eventual project URL is `https://YOUR-USERNAME.github.io/ucf-hip-course-checker/`. Actual publication can take several minutes. The **Actions** tab shows deployment status.
6. To feature the project on GitHub, visit your profile → **Customize your pins** → select `ucf-hip-course-checker`. In the repository's **About** panel set its website URL to the Pages URL and add a short description such as *Public course designation auditing prototype with Playwright, JavaScript, local Excel comparison, and GitHub Actions.*

### About the free plan

GitHub Pages for public repositories and standard GitHub-hosted Actions runners for public repositories are generally available at no usage cost, subject to GitHub's terms, limits, and policies. If the full-catalog scrape is too large for one GitHub Actions job or UCF limits requests, the weekly job will fail rather than publishing incomplete data. Do not assume unrestricted scraping or a guaranteed $0 operational cost for third-party services.

## How the Monday job works

Workflow: `.github/workflows/monday.yml`. Schedule: **6:17 a.m. every Monday in America/New_York** (timezone-aware, including daylight saving changes). The workflow can also be started manually. The automation currently **does not run** until this repository variable is set:

- Repository **Settings → Secrets and variables → Actions → Variables → New repository variable**
- **Name:** `UCF_PUBLIC_SCRAPE_APPROVED`
- **Value:** `true`

**Set this only after UCF has confirmed that the intended recurring automated requests to its public PeopleSoft site and publication of the resulting public records are allowed.** An IT-approved internal reporting export or API may be a better institutional integration.

The collector attempts to:

1. Load the UCF public Class Search without signing in.
2. Discover all subjects through the public Subject lookup; if a complete subject listing cannot be established, **stop**.
3. For every configured semester and every discovered subject, search all visible sections (open-only filter OFF), navigate pagination, and inspect public section details for HIP attributes.
4. Validate each search was completed, no pages/sections were skipped, and section IDs are not duplicated. **Only after all configured searches succeed** does it create `site/public-data/latest.json` and update `site/public-data/status.json`.
5. Commit **public data only** to the repo, then redeploy the site. If anything fails, the last successful public snapshot remains available (and its age is shown in the website).

**No bypasses:** The existing scraper stops on login requests, CAPTCHAs, HTTP 401/403/429/503, session challenges, ambiguous pagination, unrecognized DOM, maximum-results messages, and time limits. This is an experimental collector. In particular, UCF may reject full-subject queries or cap results, and visiting every section may take longer than GitHub Actions allows. The current project will not quietly turn a partial scrape into a full-catalog report.

The default target is **Spring 2027 (PeopleSoft term `1890`)**. To change terms, edit `scraper/public_targets.json` after confirming the exact current term IDs. Its `scope` is `all_public_subjects`. `subject_codes` is empty by default, enabling automatic lookup; manually entering a list requires independently verifying it is exhaustive and marking `subject_codes_verified_exhaustive: true`. No internal HIP Master data should ever be used to define public repository configuration.

### How you'll use the site

- Open the GitHub Pages URL on a browser. When a successful Monday snapshot has been published, the site automatically loads **public** course sections; otherwise it says there is no completed snapshot yet.
- Upload the *authorized* HIP Master `.xlsx` to the browser. The workbook never leaves browser memory and is not included in the public repo.
- Review the suggested column mappings, semester, and whether matches are course-level or instructor-level. Select Compare. Download the CSV/JSON review report.
- Record-level flags are **candidates for human review**, not evidence of an approved HIP attribute missing in Campus Solutions. Stale and partial data must not be treated as definitive.

## Directory layout

```text
.github/workflows/deploy.yml    Static GitHub Pages deployment
.github/workflows/monday.yml    Disabled-until-approved Monday automation
site/                           JavaScript user interface and browser-only workbook handling
site/public-data/status.json    Visible collection status; not_run at first
scraper/ucf_scraper.py          Public PeopleSoft Playwright collector
scraper/public_targets.json     Selected term(s), discovery and pacing configuration
scripts/build_public_snapshot.py Validates runs and publishes JSON only if all complete
tests/test_ucf_scraper.py       Offline parser tests
.github/workflows/tests.yml     Offline CI tests on pushes
```

## Run checks (on a developer machine)

```bash
python -m pip install -r scraper/requirements.txt
python -m unittest discover -s tests -p 'test_*.py' -v
node site/test-matcher.cjs
# To test the live site locally with approval:
python -m playwright install chromium
python scraper/ucf_scraper.py --list-subjects --headed
```

Web UI syntax checks and offline matching tests have run in our development environment. **No live scheduled scraping from GitHub or full subject discovery has been tested**. The local static page uses bundled JSZip (see `site/JSZIP-LICENSE.md`) and no CDN for workbook parsing.

## Privacy, security, and ownership

- **Do not commit** UCF's internal HIP Master workbook, student records, reports from Pegasus Mine, course approval lists, passwords, tokens, cookies, `.env` files, or saved PeopleSoft HTML sessions.
- Public GitHub Pages content **and public GitHub repositories are accessible to anyone**. GitHub Pages is not a secure storage location for internal files.
- The site is an independently developed prototype; confirm ownership, branding, attribution, hosting, security review, and publication rights with UCF before deploying as a HIP Hub service or presenting it as UCF-endorsed.
- The scheduled workflow is disabled by default. Turning it on is an administrator's policy decision, not evidence that UCF authorized it.
- Be conscious that instructor names and class-section details may be publicly visible but are still subject to institutional policies on automated re-publication.
- For a truly **complete and reliable institutional course designation audit**, an approved structured university export or API is preferable to public page scraping.
