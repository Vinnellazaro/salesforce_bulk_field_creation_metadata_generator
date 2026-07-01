   // --- Utilities ---
    const logEl = document.getElementById('log');
    function log(msg) {
      logEl.value += msg + "\n";
      logEl.scrollTop = logEl.scrollHeight;
    }

    function stripBom(text) {
      // Handles UTF-8 BOM similar to Python encoding='utf-8-sig'
      return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
    }

    function csvError(){
      const errorDiv = document.getElementById("csvError");
      // 1. Add the 'error-visible' class (shows the div) and remove 'error-hidden'
      errorDiv.classList.remove("d-none");
      errorDiv.classList.add("d-block");

      // 2. Set a timeout to remove the class after 3 seconds (3000 milliseconds)
      setTimeout(function() {
          // Re-add 'error-hidden' and remove 'error-visible' to hide the div
          errorDiv.classList.remove("d-block");
          errorDiv.classList.add("d-none");
      }, 3000); // 3000ms delay
    }

    function escapeXml(s) {
      // Minimal XML escaping for text nodes
      return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    }

    function toLowerTrim(s) {
      return String(s ?? "").trim().toLowerCase();
    }

    // --- CSV Parser (simple but robust for quoted fields) ---
    function parseCsv(csvText) {
      // Returns array of objects (DictReader-style)
      // Supports commas, quotes, and newlines in quoted fields.
      const rows = [];
      let i = 0, field = "", row = [];
      let inQuotes = false;

      function pushField() {
        row.push(field);
        field = "";
      }
      function pushRow() {
        // Avoid pushing trailing empty row
        if (row.length > 1 || (row.length === 1 && row[0] !== "")) rows.push(row);
        row = [];
      }

      while (i < csvText.length) {
        const c = csvText[i];

        if (inQuotes) {
          if (c === '"') {
            if (csvText[i + 1] === '"') { // escaped quote
              field += '"';
              i += 2;
              continue;
            } else {
              inQuotes = false;
              i++;
              continue;
            }
          } else {
            field += c;
            i++;
            continue;
          }
        } else {
          if (c === '"') {
            inQuotes = true;
            i++;
            continue;
          }
          if (c === ",") {
            pushField();
            i++;
            continue;
          }
          if (c === "\n") {
            pushField();
            pushRow();
            i++;
            continue;
          }
          if (c === "\r") { // handle CRLF
            i++;
            continue;
          }
          field += c;
          i++;
        }
      }
      // last field/row
      pushField();
      pushRow();

      if (rows.length === 0) return [];

      const headers = rows[0].map(h => String(h).trim());
      const data = rows.slice(1).map(cols => {
        const obj = {};
        headers.forEach((h, idx) => obj[h] = cols[idx] ?? "");
        return obj;
      });

      return data;
    }

    // --- XML generator ---
    function generateXml(field) {
      const fieldType = toLowerTrim(field["Type"]);

      function optStr(col, fallback = "") {
        const v = String(field[col] ?? "").trim();
        return v !== "" ? v : fallback;
      }
      function boolCol(col, fallback = false) {
        const v = toLowerTrim(field[col] ?? "");
        if (v === "true" || v === "yes" || v === "1") return true;
        if (v === "false" || v === "no" || v === "0") return false;
        return fallback;
      }

      const required = boolCol("Required");
      const unique = boolCol("Unique");
      const externalId = boolCol("ExternalId");

      const parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">',
        `  <fullName>${escapeXml(field["FieldName"])}</fullName>`,
        `  <label>${escapeXml(field["FieldLabel"])}</label>`,
      ];

      if (field["Description"] && String(field["Description"]).trim() !== "") {
        parts.push(`  <description>${escapeXml(field["Description"])}</description>`);
      }

      // --- TEXT ---
      if (fieldType === "text") {
        parts.push("  <type>Text</type>");
        parts.push(`  <length>${escapeXml(optStr("Length", "255"))}</length>`);
        if (unique) parts.push(`  <caseSensitive>${boolCol("CaseSensitive")}</caseSensitive>`);
        parts.push(`  <required>${required}</required>`);
        parts.push(`  <unique>${unique}</unique>`);
        parts.push(`  <externalId>${externalId}</externalId>`);

      // --- TEXT AREA (plain, ≤255) ---
      } else if (fieldType === "textarea") {
        parts.push("  <type>TextArea</type>");
        if (required) parts.push("  <required>true</required>");

      // --- LONG TEXT AREA ---
      } else if (fieldType === "longtextarea" || fieldType === "textarea(long)") {
        parts.push("  <type>LongTextArea</type>");
        parts.push(`  <length>${escapeXml(optStr("Length", "32768"))}</length>`);
        parts.push(`  <visibleLines>${escapeXml(optStr("VisibleLines", "3"))}</visibleLines>`);

      // --- RICH TEXT AREA ---
      } else if (fieldType === "richtextarea" || fieldType === "html" || fieldType === "richtext") {
        parts.push("  <type>Html</type>");
        parts.push(`  <length>${escapeXml(optStr("Length", "32768"))}</length>`);
        parts.push(`  <visibleLines>${escapeXml(optStr("VisibleLines", "10"))}</visibleLines>`);

      // --- NUMBER ---
      } else if (fieldType === "number") {
        parts.push("  <type>Number</type>");
        parts.push(`  <precision>${escapeXml(optStr("Precision", "18"))}</precision>`);
        parts.push(`  <scale>${escapeXml(optStr("Scale", "0"))}</scale>`);
        parts.push(`  <required>${required}</required>`);
        parts.push(`  <unique>${unique}</unique>`);
        parts.push(`  <externalId>${externalId}</externalId>`);

      // --- CURRENCY ---
      } else if (fieldType === "currency") {
        parts.push("  <type>Currency</type>");
        parts.push(`  <precision>${escapeXml(optStr("Precision", "18"))}</precision>`);
        parts.push(`  <scale>${escapeXml(optStr("Scale", "2"))}</scale>`);
        parts.push(`  <required>${required}</required>`);

      // --- PERCENT ---
      } else if (fieldType === "percent") {
        parts.push("  <type>Percent</type>");
        parts.push(`  <precision>${escapeXml(optStr("Precision", "18"))}</precision>`);
        parts.push(`  <scale>${escapeXml(optStr("Scale", "2"))}</scale>`);
        parts.push(`  <required>${required}</required>`);

      // --- CHECKBOX ---
      } else if (fieldType === "checkbox") {
        parts.push("  <type>Checkbox</type>");
        const rawDefault = toLowerTrim(field["DefaultValue"] ?? "");
        const checkDefault = (rawDefault === "true" || rawDefault === "yes" || rawDefault === "1") ? "true" : "false";
        parts.push(`  <defaultValue>${checkDefault}</defaultValue>`);

      // --- DATE ---
      } else if (fieldType === "date") {
        parts.push("  <type>Date</type>");
        if (required) parts.push("  <required>true</required>");

      // --- DATETIME ---
      } else if (fieldType === "datetime") {
        parts.push("  <type>DateTime</type>");
        if (required) parts.push("  <required>true</required>");

      // --- TIME ---
      } else if (fieldType === "time") {
        parts.push("  <type>Time</type>");
        if (required) parts.push("  <required>true</required>");

      // --- EMAIL ---
      } else if (fieldType === "email") {
        parts.push("  <type>Email</type>");
        parts.push(`  <required>${required}</required>`);
        parts.push(`  <unique>${unique}</unique>`);
        parts.push(`  <externalId>${externalId}</externalId>`);

      // --- PHONE ---
      } else if (fieldType === "phone") {
        parts.push("  <type>Phone</type>");
        if (required) parts.push("  <required>true</required>");

      // --- URL ---
      } else if (fieldType === "url") {
        parts.push("  <type>Url</type>");
        if (required) parts.push("  <required>true</required>");

      // --- PICKLIST ---
      } else if (fieldType === "picklist") {
        parts.push("  <type>Picklist</type>");
        parts.push("  <valueSet>");
        parts.push("    <valueSetDefinition>");
        parts.push("      <sorted>false</sorted>");
        const values = String(field["PicklistValues"] ?? "").split(",").map(v => v.trim()).filter(Boolean);
        for (const val of values) {
          parts.push("      <value>");
          parts.push(`        <fullName>${escapeXml(val)}</fullName>`);
          parts.push("        <default>false</default>");
          parts.push(`        <label>${escapeXml(val)}</label>`);
          parts.push("      </value>");
        }
        parts.push("    </valueSetDefinition>");
        parts.push("  </valueSet>");
        if (required) parts.push("  <required>true</required>");

      // --- MULTI-SELECT PICKLIST ---
      } else if (fieldType === "multipicklist" || fieldType === "multiselectpicklist" || fieldType === "multiselect") {
        parts.push("  <type>MultiselectPicklist</type>");
        parts.push(`  <visibleLines>${escapeXml(optStr("VisibleLines", "4"))}</visibleLines>`);
        parts.push("  <valueSet>");
        parts.push("    <valueSetDefinition>");
        parts.push("      <sorted>false</sorted>");
        const values = String(field["PicklistValues"] ?? "").split(",").map(v => v.trim()).filter(Boolean);
        for (const val of values) {
          parts.push("      <value>");
          parts.push(`        <fullName>${escapeXml(val)}</fullName>`);
          parts.push("        <default>false</default>");
          parts.push(`        <label>${escapeXml(val)}</label>`);
          parts.push("      </value>");
        }
        parts.push("    </valueSetDefinition>");
        parts.push("  </valueSet>");
        if (required) parts.push("  <required>true</required>");

      // --- LOOKUP ---
      } else if (fieldType === "lookup") {
        parts.push("  <type>Lookup</type>");
        parts.push(`  <referenceTo>${escapeXml(field["ReferenceTo"])}</referenceTo>`);
        parts.push(`  <relationshipLabel>${escapeXml(optStr("RelationshipLabel", optStr("FieldLabel")))}</relationshipLabel>`);
        parts.push(`  <relationshipName>${escapeXml(optStr("ChildRelationshipName", optStr("FieldName")))}</relationshipName>`);
        parts.push(`  <deleteConstraint>${escapeXml(optStr("DeleteConstraint", "SetNull"))}</deleteConstraint>`);
        if (required) parts.push("  <required>true</required>");

      // --- MASTER-DETAIL ---
      } else if (fieldType === "masterdetail" || fieldType === "master-detail" || fieldType === "master_detail") {
        parts.push("  <type>MasterDetail</type>");
        parts.push(`  <referenceTo>${escapeXml(field["ReferenceTo"])}</referenceTo>`);
        parts.push(`  <relationshipLabel>${escapeXml(optStr("RelationshipLabel", optStr("FieldLabel")))}</relationshipLabel>`);
        parts.push(`  <relationshipName>${escapeXml(optStr("ChildRelationshipName", optStr("FieldName")))}</relationshipName>`);
        parts.push("  <relationshipOrder>0</relationshipOrder>");
        parts.push("  <reparentableMasterDetail>false</reparentableMasterDetail>");
        parts.push("  <writeRequiresMasterRead>false</writeRequiresMasterRead>");

      // --- AUTO NUMBER ---
      } else if (fieldType === "autonumber" || fieldType === "auto number" || fieldType === "auto_number") {
        parts.push("  <type>AutoNumber</type>");
        parts.push(`  <displayFormat>${escapeXml(optStr("DisplayFormat", "AN-{00000}"))}</displayFormat>`);
        parts.push(`  <startingNumber>${escapeXml(optStr("StartingNumber", "1"))}</startingNumber>`);
        parts.push(`  <externalId>${externalId}</externalId>`);

      // --- FORMULA ---
      } else if (fieldType === "formula") {
        const returnTypeMap = {
          "text": "Text", "number": "Number", "currency": "Currency",
          "percent": "Percent", "date": "Date", "datetime": "DateTime",
          "checkbox": "Checkbox", "time": "Time",
        };
        const xmlReturnType = returnTypeMap[toLowerTrim(field["FormulaReturnType"] ?? "")] || "Text";
        parts.push(`  <type>${xmlReturnType}</type>`);
        parts.push(`  <formula>${escapeXml(String(field["Formula"] ?? "").trim())}</formula>`);
        parts.push(`  <formulaTreatBlanksAs>${escapeXml(optStr("FormulaTreatBlanksAs", "BlankAsBlank"))}</formulaTreatBlanksAs>`);
        if (xmlReturnType === "Text") {
          parts.push(`  <length>${escapeXml(optStr("Length", "1300"))}</length>`);
        } else if (["Number", "Currency", "Percent"].includes(xmlReturnType)) {
          parts.push(`  <precision>${escapeXml(optStr("Precision", "18"))}</precision>`);
          parts.push(`  <scale>${escapeXml(optStr("Scale", "2"))}</scale>`);
        }

      // --- ROLLUP SUMMARY ---
      } else if (fieldType === "rollup" || fieldType === "rollupsummary" || fieldType === "rollup summary" || fieldType === "summary") {
        parts.push("  <type>Summary</type>");
        const summaryOp = optStr("SummaryOperation", "COUNT").toUpperCase();
        parts.push(`  <summaryForeignKey>${escapeXml(optStr("SummaryForeignKey"))}</summaryForeignKey>`);
        parts.push(`  <summaryOperation>${escapeXml(summaryOp)}</summaryOperation>`);
        if (summaryOp !== "COUNT") {
          parts.push(`  <summarizedField>${escapeXml(optStr("SummarizedField"))}</summarizedField>`);
        }

      // --- GEOLOCATION ---
      } else if (fieldType === "geolocation" || fieldType === "location") {
        parts.push("  <type>Location</type>");
        parts.push(`  <displayLocationInDecimal>${boolCol("DisplayLocationInDecimal", true)}</displayLocationInDecimal>`);
        parts.push(`  <scale>${escapeXml(optStr("Scale", "7"))}</scale>`);
        if (required) parts.push("  <required>true</required>");

      // --- ENCRYPTED TEXT ---
      } else if (fieldType === "encryptedtext" || fieldType === "encrypted" || fieldType === "encrypted text") {
        parts.push("  <type>EncryptedText</type>");
        parts.push(`  <length>${escapeXml(optStr("Length", "175"))}</length>`);
        parts.push(`  <maskType>${escapeXml(optStr("MaskType", "all"))}</maskType>`);
        parts.push(`  <maskChar>${escapeXml(optStr("MaskChar", "asterisk"))}</maskChar>`);
        if (required) parts.push("  <required>true</required>");

      } else {
        throw new Error(`Unsupported field type: ${field["Type"]}`);
      }

      parts.push("</CustomField>");
      return parts.join("\n");
    }

    // --- ZIP generation + download ---
    async function downloadZip(zip, fileName) {
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(a.href);
      a.remove();
    }

    // --- CSV upload handler ---
    document.getElementById('generateBtn').addEventListener('click', async () => {
      logEl.value = "";
      const fileInput = document.getElementById('csvFile');
      const outputBaseDir = document.getElementById('outputBaseDir').value.trim() || "salesforce_metadata";

      if (!fileInput.files || fileInput.files.length === 0) {
        csvError();
        log("Please choose a CSV file first.");
        return;
      }

      const csvFile = fileInput.files[0];
      log(`Reading: ${csvFile.name}`);

      const text = await csvFile.text();
      const csvText = stripBom(text);
      const rows = parseCsv(csvText);

      if (rows.length === 0) {
        log("No rows found. Check the CSV format.");
        return;
      }

      log(`Parsed ${rows.length} data rows.`);
      const zip = new JSZip();

      let created = 0;
      for (const row of rows) {
        const objectName = String(row["ObjectName"] ?? "").trim();
        const fieldName = String(row["FieldName"] ?? "").trim();

        if (!objectName || !fieldName) {
          log("Skipping a row due to missing ObjectName or FieldName.");
          continue;
        }

        try {
          const xml = generateXml(row);
          const folderPath = `${outputBaseDir}/${objectName}/fields/`;
          const filePath = `${folderPath}${fieldName}.field-meta.xml`;
          zip.file(filePath, xml);
          created++;
          log(`Added: ${filePath}`);
        } catch (e) {
          log(`ERROR on FieldName=${row["FieldName"]}: ${e.message}`);
        }
      }

      if (created === 0) {
        log("No files were generated (all rows skipped or errored).");
        return;
      }

      const zipName = `${outputBaseDir}.zip`;
      log(`\nGenerating ZIP (${created} files)...`);
      await downloadZip(zip, zipName);
      log(`Done. Downloaded: ${zipName}`);
    });

    // ================================================================
    // Form Builder
    // ================================================================

    const TYPE_FIELDS = {
      text:          ['fg-length', 'fg-required', 'fg-unique-ext'],
      textarea:      ['fg-required'],
      longtextarea:  ['fg-length', 'fg-visiblelines'],
      richtextarea:  ['fg-length', 'fg-visiblelines'],
      number:        ['fg-precision', 'fg-scale', 'fg-required', 'fg-unique-ext'],
      currency:      ['fg-precision', 'fg-scale', 'fg-required'],
      percent:       ['fg-precision', 'fg-scale', 'fg-required'],
      checkbox:      ['fg-defaultvalue'],
      date:          ['fg-required'],
      datetime:      ['fg-required'],
      time:          ['fg-required'],
      email:         ['fg-required', 'fg-unique-ext'],
      phone:         ['fg-required'],
      url:           ['fg-required'],
      picklist:      ['fg-picklist', 'fg-required'],
      multipicklist: ['fg-picklist', 'fg-visiblelines', 'fg-required'],
      lookup:        ['fg-referenceto', 'fg-relname', 'fg-deleteconst', 'fg-required'],
      masterdetail:  ['fg-referenceto', 'fg-relname'],
      autonumber:    ['fg-autonumber'],
      formula:       ['fg-formula'],
      rollup:        ['fg-rollup'],
      geolocation:   ['fg-geolocation', 'fg-scale', 'fg-required'],
      encryptedtext: ['fg-length', 'fg-encrypted', 'fg-required'],
    };

    const TYPE_DESCRIPTIONS = {
      text:          'Plain text, up to the specified length (max 255).',
      textarea:      'Plain text area up to 255 characters — no length setting needed.',
      longtextarea:  'Long text area, up to 131,072 characters.',
      richtextarea:  'Rich text area with a formatting toolbar (stored as HTML).',
      number:        'Numeric field with configurable precision and decimal places.',
      currency:      'Currency field tied to the org\'s currency settings.',
      percent:       'Percentage value with configurable decimal places.',
      checkbox:      'True / False boolean field.',
      date:          'Date only — no time component.',
      datetime:      'Date and time combined.',
      time:          'Time of day only.',
      email:         'Email address with format validation.',
      phone:         'Phone number field.',
      url:           'URL / web address field.',
      picklist:      'Single-select dropdown list.',
      multipicklist: 'Multi-select picklist (checkbox list).',
      lookup:        'Lookup relationship — links records to another Salesforce object.',
      masterdetail:  'Master-detail relationship — child record is owned by the parent.',
      autonumber:    'Auto-incrementing read-only number with a custom display format.',
      formula:       'Calculated field — value derived from a formula expression.',
      rollup:        'Roll-Up Summary — aggregates child record values on a master object.',
      geolocation:   'Latitude / longitude location field.',
      encryptedtext: 'Encrypted text (requires Shield Platform Encryption).',
    };

    const ALL_FIELD_GROUPS = [
      'fg-length', 'fg-precision', 'fg-scale', 'fg-visiblelines',
      'fg-defaultvalue', 'fg-required', 'fg-unique-ext',
      'fg-picklist', 'fg-referenceto', 'fg-relname', 'fg-deleteconst',
      'fg-autonumber', 'fg-formula', 'fg-rollup', 'fg-geolocation', 'fg-encrypted',
    ];

    let fieldQueue = [];

    function updateFormFields(type) {
      ALL_FIELD_GROUPS.forEach(cls => {
        const el = document.querySelector('.' + cls);
        if (el) el.classList.add('d-none');
      });

      (TYPE_FIELDS[type] || []).forEach(cls => {
        const el = document.querySelector('.' + cls);
        if (el) el.classList.remove('d-none');
      });

      if (type === 'formula') {
        const retType = document.getElementById('formFormulaReturnType').value;
        const isNumeric = ['number', 'currency', 'percent'].includes(retType);
        document.querySelector('.fg-length').classList.toggle('d-none', isNumeric);
        document.querySelector('.fg-precision').classList.toggle('d-none', !isNumeric);
        document.querySelector('.fg-scale').classList.toggle('d-none', !isNumeric);
      }

      const descEl = document.getElementById('typeDesc');
      if (descEl) descEl.textContent = TYPE_DESCRIPTIONS[type] || '';
    }

    function clearValidation() {
      document.querySelectorAll('#formPanel .is-invalid').forEach(el => el.classList.remove('is-invalid'));
    }

    function markInvalid(id) {
      const el = document.getElementById(id);
      if (el) el.classList.add('is-invalid');
    }

    function getFormValues() {
      clearValidation();
      const type = document.getElementById('formType').value;
      const isAutoNumber = type === 'autonumber';

      const row = {
        FieldLabel:            document.getElementById('formFieldLabel').value.trim(),
        FieldName:             document.getElementById('formFieldName').value.trim(),
        ObjectName:            document.getElementById('formObjectName').value.trim(),
        Type:                  type,
        Description:           document.getElementById('formDescription').value.trim(),
        Length:                document.getElementById('formLength').value.trim(),
        Precision:             document.getElementById('formPrecision').value.trim(),
        Scale:                 document.getElementById('formScale').value.trim(),
        VisibleLines:          document.getElementById('formVisibleLines').value.trim(),
        DefaultValue:          document.getElementById('formDefaultValue').value,
        Required:              document.getElementById('formRequired').checked ? 'true' : 'false',
        Unique:                document.getElementById('formUnique').checked ? 'true' : 'false',
        ExternalId:            isAutoNumber
                                 ? (document.getElementById('formExternalIdAuto').checked ? 'true' : 'false')
                                 : (document.getElementById('formExternalId').checked ? 'true' : 'false'),
        CaseSensitive:         'false',
        PicklistValues:        document.getElementById('formPicklistValues').value.trim(),
        ReferenceTo:           document.getElementById('formReferenceTo').value.trim(),
        RelationshipLabel:     document.getElementById('formRelationshipLabel').value.trim(),
        ChildRelationshipName: document.getElementById('formChildRelName').value.trim(),
        DeleteConstraint:      document.getElementById('formDeleteConstraint').value,
        DisplayFormat:         document.getElementById('formDisplayFormat').value.trim(),
        StartingNumber:        document.getElementById('formStartingNumber').value.trim(),
        Formula:               document.getElementById('formFormula').value.trim(),
        FormulaReturnType:     document.getElementById('formFormulaReturnType').value,
        FormulaTreatBlanksAs:  document.getElementById('formTreatBlanks').value,
        SummaryOperation:      document.getElementById('formSummaryOp').value,
        SummaryForeignKey:     document.getElementById('formSummaryForeignKey').value.trim(),
        SummarizedField:       document.getElementById('formSummarizedField').value.trim(),
        DisplayLocationInDecimal: document.getElementById('formDisplayDecimal').checked ? 'true' : 'false',
        MaskType:              document.getElementById('formMaskType').value,
        MaskChar:              document.getElementById('formMaskChar').value,
      };

      let valid = true;
      if (!row.FieldLabel) { markInvalid('formFieldLabel'); valid = false; }
      if (!row.FieldName)  { markInvalid('formFieldName');  valid = false; }
      if (!row.ObjectName) { markInvalid('formObjectName'); valid = false; }
      if ((type === 'picklist' || type === 'multipicklist') && !row.PicklistValues) {
        markInvalid('formPicklistValues'); valid = false;
      }
      if ((type === 'lookup' || type === 'masterdetail') && !row.ReferenceTo) {
        markInvalid('formReferenceTo'); valid = false;
      }
      if (type === 'formula' && !row.Formula) {
        markInvalid('formFormula'); valid = false;
      }
      if (type === 'rollup' && !row.SummaryForeignKey) {
        markInvalid('formSummaryForeignKey'); valid = false;
      }

      return valid ? row : null;
    }

    function renderQueue() {
      const container = document.getElementById('fieldQueue');
      const count = fieldQueue.length;
      const plural = count === 1 ? '' : 's';

      document.getElementById('queueCount').textContent = count;
      document.getElementById('queuePlural').textContent = plural;
      document.getElementById('queueCountBadge').textContent = count + ' field' + plural;
      document.getElementById('generateFormBtn').disabled = count === 0;

      if (count === 0) {
        container.innerHTML = '<div class="queue-empty text-secondary">No fields added yet.</div>';
        return;
      }

      container.innerHTML = fieldQueue.map((row, i) => {
        const typeKey = String(row.Type || '').trim().toLowerCase();
        return `<div class="queue-item">
          <div class="d-flex align-items-center gap-2 overflow-hidden flex-grow-1">
            <span class="badge tb-${escapeXml(typeKey)}" style="font-size:0.67rem;padding:0.3em 0.55em;">${escapeXml(typeKey)}</span>
            <span class="text-truncate" style="font-size:0.8rem;">${escapeXml(row.FieldLabel)}</span>
            <small class="text-secondary flex-shrink-0">&middot; ${escapeXml(row.ObjectName)}</small>
          </div>
          <button class="btn btn-sm btn-outline-danger remove-btn ms-2" onclick="removeFromQueue(${i})" aria-label="Remove field">&#xd7;</button>
        </div>`;
      }).join('');
    }

    function removeFromQueue(index) {
      fieldQueue.splice(index, 1);
      renderQueue();
    }

    function resetForm() {
      const keepObjectName = document.getElementById('formObjectName').value;
      const keepType = document.getElementById('formType').value;

      ['formFieldLabel','formFieldName','formDescription','formLength','formPrecision',
       'formScale','formVisibleLines','formPicklistValues','formReferenceTo',
       'formRelationshipLabel','formChildRelName','formDisplayFormat','formStartingNumber',
       'formFormula','formSummaryForeignKey','formSummarizedField'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });

      document.getElementById('formDefaultValue').value = 'false';
      document.getElementById('formDeleteConstraint').value = 'SetNull';
      document.getElementById('formFormulaReturnType').value = 'text';
      document.getElementById('formTreatBlanks').value = 'BlankAsBlank';
      document.getElementById('formSummaryOp').value = 'COUNT';
      document.getElementById('formMaskType').value = 'all';
      document.getElementById('formMaskChar').value = 'asterisk';

      ['formRequired','formUnique','formExternalId','formExternalIdAuto'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
      });
      document.getElementById('formDisplayDecimal').checked = true;

      document.getElementById('formObjectName').value = keepObjectName;
      document.getElementById('formType').value = keepType;
      clearValidation();
    }

    function addFieldToQueue() {
      try {
        const row = getFormValues();
        if (!row) {
          const first = document.querySelector('#formPanel .is-invalid');
          if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
          log('[Builder] Please fill in all required fields (marked with *).');
          return;
        }
        fieldQueue.push(row);
        renderQueue();
        log(`[Builder] Added: ${row.FieldLabel} (${row.Type}) → ${row.ObjectName}`);
        resetForm();
        const lbl = document.getElementById('formFieldLabel');
        if (lbl) lbl.focus();
      } catch (e) {
        log('ERROR (Add to Queue): ' + e.message);
        console.error(e);
      }
    }

    document.getElementById('formType').addEventListener('change', function () {
      updateFormFields(this.value);
    });

    document.getElementById('formFormulaReturnType').addEventListener('change', function () {
      updateFormFields('formula');
    });

    document.getElementById('addFieldBtn').addEventListener('click', addFieldToQueue);

    document.getElementById('generateFormBtn').addEventListener('click', async () => {
      logEl.value = '';
      const outputBaseDir = document.getElementById('outputBaseDir').value.trim() || 'salesforce_metadata';
      const zip = new JSZip();
      let created = 0;
      for (const row of fieldQueue) {
        try {
          const xml = generateXml(row);
          const filePath = `${outputBaseDir}/${row.ObjectName}/fields/${row.FieldName}.field-meta.xml`;
          zip.file(filePath, xml);
          created++;
          log(`Added: ${filePath}`);
        } catch (e) {
          log(`ERROR on ${row.FieldName}: ${e.message}`);
        }
      }
      if (created === 0) { log('No files generated.'); return; }
      log(`\nGenerating ZIP (${created} fields)...`);
      await downloadZip(zip, `${outputBaseDir}.zip`);
      log(`Done. Downloaded: ${outputBaseDir}.zip`);
    });

    updateFormFields('text');
    renderQueue();