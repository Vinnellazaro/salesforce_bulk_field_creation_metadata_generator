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

    // --- XML generator (converted from your Python generate_xml) ---
    function generateXml(field) {
      const fieldType = toLowerTrim(field["Type"]);
      const parts = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">',
        `  <fullName>${escapeXml(field["FieldName"])}</fullName>`,
        `  <label>${escapeXml(field["FieldLabel"])}</label>`,
      ];

      // description if available
      if (field["Description"] && String(field["Description"]).trim() !== "") {
        parts.push(`  <description>${escapeXml(field["Description"])}</description>`);
      }

      // TEXT
      if (fieldType === "text") {
        parts.push("  <type>Text</type>");
        parts.push(`  <length>${escapeXml(field["Length"])}</length>`);

      // TEXT AREA (LONG)
      } else if (fieldType === "textarea(long)") {
        parts.push("  <type>LongTextArea</type>");
        const length = field["Length"] && String(field["Length"]).trim() !== "" ? field["Length"] : 32768;
        const visibleLines = field["VisibleLines"] && String(field["VisibleLines"]).trim() !== "" ? field["VisibleLines"] : 3;
        parts.push(`  <length>${escapeXml(length)}</length>`);
        parts.push(`  <visibleLines>${escapeXml(visibleLines)}</visibleLines>`);

      // NUMBER
      } else if (fieldType === "number") {
        parts.push("  <type>Number</type>");
        const precision = field["Precision"] && String(field["Precision"]).trim() !== "" ? field["Precision"] : 18;
        const scale = field["Scale"] && String(field["Scale"]).trim() !== "" ? field["Scale"] : 2;
        parts.push(`  <precision>${escapeXml(precision)}</precision>`);
        parts.push(`  <scale>${escapeXml(scale)}</scale>`);

      // CURRENCY
      } else if (fieldType === "currency") {
        parts.push("  <type>Currency</type>");
        const precision = field["Precision"] && String(field["Precision"]).trim() !== "" ? field["Precision"] : 18;
        const scale = field["Scale"] && String(field["Scale"]).trim() !== "" ? field["Scale"] : 2;
        parts.push(`  <precision>${escapeXml(precision)}</precision>`);
        parts.push(`  <scale>${escapeXml(scale)}</scale>`);

      // PERCENT
      } else if (fieldType === "percent") {
        parts.push("  <type>Percent</type>");
        const precision = field["Precision"] && String(field["Precision"]).trim() !== "" ? field["Precision"] : 18;
        const scale = field["Scale"] && String(field["Scale"]).trim() !== "" ? field["Scale"] : 2;
        parts.push(`  <precision>${escapeXml(precision)}</precision>`);
        parts.push(`  <scale>${escapeXml(scale)}</scale>`);

      // CHECKBOX
      } else if (fieldType === "checkbox") {
        parts.push("  <type>Checkbox</type>");
        parts.push("  <defaultValue>false</defaultValue>");

      // PICKLIST
      } else if (fieldType === "picklist") {
        parts.push("  <type>Picklist</type>");
        parts.push("  <valueSet>");
        parts.push("    <valueSetDefinition>");
        parts.push("      <sorted>false</sorted>");

        const values = String(field["PicklistValues"] ?? "")
          .split(",")
          .map(v => v.trim())
          .filter(Boolean);

        for (const val of values) {
          parts.push("      <value>");
          parts.push(`        <fullName>${escapeXml(val)}</fullName>`);
          parts.push("        <default>false</default>");
          parts.push(`        <label>${escapeXml(val)}</label>`);
          parts.push("      </value>");
        }

        parts.push("    </valueSetDefinition>");
        parts.push("  </valueSet>");

      // DATE
      } else if (fieldType === "date") {
        parts.push("  <type>Date</type>");

      // TIME
      } else if (fieldType === "time") {
        parts.push("  <type>Time</type>");

      // LOOKUP
      } else if (fieldType === "lookup") {
        parts.push("  <type>Lookup</type>");
        parts.push(`  <referenceTo>${escapeXml(field["ReferenceTo"])}</referenceTo>`);
        const relationshipLabel = field["RelationshipLabel"] && String(field["RelationshipLabel"]).trim() !== ""
          ? field["RelationshipLabel"]
          : field["FieldLabel"];
        const relationshipName = field["ChildRelationshipName"] && String(field["ChildRelationshipName"]).trim() !== ""
          ? field["ChildRelationshipName"]
          : field["FieldName"];
        const deleteConstraint = field["DeleteConstraint"] && String(field["DeleteConstraint"]).trim() !== ""
          ? field["DeleteConstraint"]
          : "SetNull";

        parts.push(`  <relationshipLabel>${escapeXml(relationshipLabel)}</relationshipLabel>`);
        parts.push(`  <relationshipName>${escapeXml(relationshipName)}</relationshipName>`);
        parts.push(`  <deleteConstraint>${escapeXml(deleteConstraint)}</deleteConstraint>`);

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

    // --- UI handler ---
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