# Salesforce Bulk Field Creation Metadata Generator

**Version:** v1.3  
**Type:** Static, fully client-side web application  
**Hosted at:** https://vinnellazaro.github.io/salesforce_bulk_field_creation_metadata_generator/  
**Author:** Vinnel Lazaro

---

## Overview

A free, browser-based tool that converts a CSV of Salesforce field definitions into deployable Salesforce CustomField metadata XML files (`.field-meta.xml`). Instead of manually creating fields one-by-one in Salesforce Setup, admins and developers can define dozens or hundreds of fields in a spreadsheet and generate all XML files in a single click.

No data ever leaves the user's machine — all CSV parsing, XML generation, and ZIP packaging happen entirely in the browser.

---

## Key Features

- **100% client-side** — no backend, no server, no data upload
- **Bulk generation** — one CSV row per field, unlimited rows
- **Multi-object support** — fields across different Salesforce objects can coexist in a single CSV
- **Deployment-ready output** — ZIP organized in Salesforce DX folder structure, compatible with `sf project deploy start` and the VS Code Salesforce Extension
- **Multiple field types** — Text, LongTextArea, Number, Currency, Percent, Checkbox, Date, Time, Picklist, and Lookup
- **Dark / Light theme** — persisted in `localStorage`
- **Zero dependencies to install** — runs in any modern browser; no Node.js, Python, or CLI required

---

## Architecture

```
Browser
  └── index.html               (single-page UI, ~730 lines)
        ├── assets/css/styles.css    (theming + layout)
        └── assets/js/scripts.js    (all application logic)

CDN (jsDelivr / Google)
  ├── JSZip 3.10.1             (client-side ZIP creation)
  ├── Bootstrap 5.3.8          (UI components + accordion)
  ├── Bootstrap Icons 1.13.1   (iconography)
  └── Google Fonts             (Google Sans, Open Sans)
```

There is no backend, no build system, no package manager, and no server-side processing. The site is deployed as a static GitHub Pages site.

---

## Data Flow

```
User fills CSV template
        ↓
Upload CSV via file input
        ↓
File read in-browser (csvFile.text())
        ↓
UTF-8 BOM stripped (stripBom)
        ↓
Custom CSV parser (parseCsv)
  - Character-by-character state machine
  - Handles quoted fields, escaped quotes (""), embedded commas/newlines, CRLF
  - Returns array of row objects keyed by header name
        ↓
Per-row XML generation (generateXml)
  - Requires: ObjectName, FieldName
  - Maps Type column → CustomField XML structure
  - All text values XML-escaped (&, <, >, ", ')
  - Skips/logs rows missing ObjectName or FieldName
        ↓
ZIP packaging via JSZip
  - Path per file: <outputBaseDir>/<ObjectName>/fields/<FieldName>.field-meta.xml
  - Activity log updated for each file added
        ↓
Browser download triggered
  - Filename: <outputBaseDir>.zip
  - Default outputBaseDir: salesforce_metadata
```

---

## CSV Format

Download the template from the tool. Columns:

| Column | Required | Description |
|---|---|---|
| `FieldLabel` | Yes | Display label for the field |
| `FieldName` | Yes | API name (no `__c` suffix needed) |
| `Type` | Yes | Field type (see supported types below) |
| `ObjectName` | Yes | Salesforce object API name (e.g., `Account`, `My_Object__c`) |
| `Length` | Conditional | Required for Text and LongTextArea |
| `Precision` | Conditional | Required for Number, Currency, Percent (default: 18) |
| `Scale` | Conditional | Required for Number, Currency, Percent (default: 2) |
| `PicklistValues` | Conditional | Comma-separated values for Picklist fields |
| `ReferenceTo` | Conditional | Target object API name for Lookup fields |
| `ChildRelationshipName` | Conditional | Relationship name for Lookup fields |
| `Description` | Optional | Field description (written into XML) |

> Note: `VisibleLines`, `RelationshipLabel`, and `DeleteConstraint` are also read by the code but are absent from the downloadable template header. These can be added manually to the CSV if needed.

---

## Supported Field Types

| Type value (case-insensitive) | Salesforce XML Type | Notes |
|---|---|---|
| `text` | `Text` | Requires `Length` |
| `textarea` / `longtextarea` | `LongTextArea` | `Length` defaults to 32768; `VisibleLines` defaults to 3 |
| `number` | `Number` | `Precision` default 18, `Scale` default 2 |
| `currency` | `Currency` | `Precision` default 18, `Scale` default 2 |
| `percent` | `Percent` | `Precision` default 18, `Scale` default 2 |
| `checkbox` | `Checkbox` | `defaultValue` set to `false` |
| `picklist` | `Picklist` | `PicklistValues` split on commas; `sorted` = false |
| `date` | `Date` | — |
| `time` | `Time` | — |
| `lookup` | `Lookup` | Requires `ReferenceTo`; `DeleteConstraint` defaults to `SetNull` |

> **Known gap:** The marketing copy mentions Master-Detail support, but `generateXml` does not implement a `masterdetail` case — only Lookup is handled among relationship types.

---

## Output Structure

The downloaded ZIP follows the Salesforce DX source format:

```
salesforce_metadata.zip
└── salesforce_metadata/
    ├── Account/
    │   └── fields/
    │       ├── My_Field__c.field-meta.xml
    │       └── Another_Field__c.field-meta.xml
    └── My_Object__c/
        └── fields/
            └── Custom_Field__c.field-meta.xml
```

This can be dropped into an SFDX project or deployed directly with:

```bash
sf project deploy start --source-dir salesforce_metadata
```

---

## File Structure

```
salesforce_bulk_field_creation_metadata_generator/
├── index.html                          # Entire UI + inline theme scripts
├── README.md                           # Short project description
├── CLOUD.md                            # This file
├── robots.txt                          # SEO crawl directives
├── sitemap.xml / sitemap.html          # XML + HTML sitemaps
├── ror.xml                             # ROR sitemap
├── google9c9b6661d70a6bb5.html         # Google Search Console verification
├── assets/                             # Active assets (referenced by index.html)
│   ├── js/scripts.js                   # Core app logic (CSV → XML → ZIP)
│   ├── css/styles.css                  # Theming and layout (229 lines)
│   ├── file/FieldGeneratorTemplate.csv # Downloadable CSV template
│   └── img/cloud-solid-full.svg        # Favicon / Open Graph image
├── js/scripts.js                       # Legacy root-level duplicate
├── file/FieldGeneratorTemplate.csv     # Legacy root-level duplicate
├── css/styles.css                      # Legacy 7-line stub (not used)
└── img/cloud-solid-full.svg            # Legacy root-level duplicate
```

> The `assets/` directory contains the live files referenced by `index.html`. The root-level `js/`, `file/`, `css/`, and `img/` entries are older duplicates and are not used by the current site.

---

## Deployment

The site is hosted on GitHub Pages at:

```
https://vinnellazaro.github.io/salesforce_bulk_field_creation_metadata_generator/
```

Because GitHub Pages serves the site from a subpath (not the domain root), `index.html` uses absolute paths beginning with `/salesforce_bulk_field_creation_metadata_generator/assets/...`. No build or publish step is required — pushing to `main` updates the live site.

---

## Privacy & Security

- No data is transmitted. The CSV is read, parsed, and processed entirely in the user's browser memory.
- No analytics, tracking scripts, or third-party data collection are present beyond CDN asset loads (Bootstrap, Google Fonts, JSZip).
- `localStorage` is used only to persist the selected theme (`light` or `dark`).

---

## SEO Configuration

The site is optimized for discoverability:

- Three JSON-LD structured-data blocks: `SoftwareApplication`, `HowTo`, `FAQPage`
- Open Graph and Twitter Card meta tags
- Canonical URL, `robots.txt`, `sitemap.xml`, `sitemap.html`, and `ror.xml`
- Google Search Console verification via `google9c9b6661d70a6bb5.html`
