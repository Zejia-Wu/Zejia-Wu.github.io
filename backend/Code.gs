/**
 * Google Apps Script endpoint for the static /user_study/ page.
 *
 * Create a private Google Sheet, open Extensions > Apps Script, paste this
 * file, and deploy it as a Web app. See README.md for the exact settings.
 */
const RESPONSE_SHEET_NAME = "Responses";
const MODERN_RESPONSE_SHEET_NAME = "Responses_6_methods";
const LEGACY_MODERN_RESPONSE_SHEET_NAME = "Responses_5_methods";
const TARGET_GROUP_COUNT = 8;

const SOURCE_ORDER = ["ours", "c2w", "viga", "direct", "mcp", "swe"];

const METRIC_GROUPS = [
  { key: "physical_plausibility", label: "物理真实性" },
  { key: "camera_controllability", label: "相机可控" },
  { key: "content_alignment", label: "内容对齐" },
  { key: "aesthetics", label: "美学质量" }
];

const BASE_HEADERS = [
  "submitted_at",
  "nickname",
  "study_version",
  "set_id",
  "completion_mode",
  "display_order"
];

const SCORE_HEADERS = METRIC_GROUPS.reduce(function (headers, metric) {
  return headers.concat(SOURCE_ORDER);
}, []);

const HEADERS = BASE_HEADERS.concat(SCORE_HEADERS);

function doGet(event) {
  try {
    const parameters = (event && event.parameter) || {};
    if (parameters.action === "history") {
      const history = {
        ok: true,
        completed_set_ids: getCompletedSetIds_(parameters.nickname || ""),
        target_group_count: TARGET_GROUP_COUNT
      };
      return parameters.callback
        ? jsonp_(parameters.callback, history)
        : json_(history);
    }

    const sheet = getResponseSheet_();
    return json_({
      ok: true,
      sheet: sheet.getName(),
      data_rows: countDataRows_(sheet),
      source_order: SOURCE_ORDER
    });
  } catch (error) {
    Logger.log(error && error.stack ? error.stack : error);
    return json_({ ok: false, error: String(error) });
  }
}

function doPost(event) {
  try {
    const payload = readPayload_(event);
    const sheet = getResponseSheet_();
    ensureHeaders_(sheet);
    sheet.appendRow(buildRow_(payload));
    return json_({ ok: true });
  } catch (error) {
    Logger.log(error && error.stack ? error.stack : error);
    return json_({ ok: false, error: String(error) });
  }
}

function readPayload_(event) {
  const rawBody = (event.postData && event.postData.contents) || "";

  if (rawBody) {
    try {
      return JSON.parse(rawBody);
    } catch (rawError) {
      // The browser fallback sends JSON in a regular form field instead.
    }
  }

  const formPayload = event.parameter && event.parameter.payload;
  if (formPayload) {
    return JSON.parse(formPayload);
  }

  throw new Error("No JSON payload was received.");
}

function getResponseSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error("This script must be bound to a Google Sheet.");
  }

  const primary = spreadsheet.getSheetByName(RESPONSE_SHEET_NAME);
  if (!primary) {
    return spreadsheet.insertSheet(RESPONSE_SHEET_NAME);
  }

  if (isCurrentSchema_(primary) || !hasSurveyData_(primary)) {
    return primary;
  }

  return spreadsheet.getSheetByName(MODERN_RESPONSE_SHEET_NAME) ||
    spreadsheet.insertSheet(MODERN_RESPONSE_SHEET_NAME);
}

function ensureHeaders_(sheet) {
  if (!isCurrentSchema_(sheet)) {
    if (hasSurveyData_(sheet)) {
      throw new Error("The selected response sheet has an incompatible schema.");
    }
    sheet.clear();
    initializeHeaders_(sheet);
  }
}

function initializeHeaders_(sheet) {
  const groupHeaders = new Array(HEADERS.length).fill("");
  groupHeaders[0] = "提交信息";
  METRIC_GROUPS.forEach(function (metric, index) {
    groupHeaders[BASE_HEADERS.length + index * SOURCE_ORDER.length] = metric.label;
  });

  sheet.getRange(1, 1, 1, HEADERS.length).setValues([groupHeaders]);
  sheet.getRange(2, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setFontWeight("bold")
    .setBackground("#dcefeb");
  sheet.getRange(2, 1, 1, HEADERS.length)
    .setFontWeight("bold")
    .setBackground("#f1f5f4");
  sheet.setFrozenRows(2);

  sheet.getRange(1, 1, 1, BASE_HEADERS.length).merge();
  METRIC_GROUPS.forEach(function (metric, index) {
    sheet.getRange(
      1,
      BASE_HEADERS.length + index * SOURCE_ORDER.length + 1,
      1,
      SOURCE_ORDER.length
    ).merge();
  });
}

function countDataRows_(sheet) {
  const hasMatrixHeaders = String(sheet.getRange(1, 1).getValue()) === "提交信息";
  const headerRows = hasMatrixHeaders ? 2 : 1;
  return Math.max(0, sheet.getLastRow() - headerRows);
}

function isCurrentSchema_(sheet) {
  return sheet.getLastColumn() >= HEADERS.length &&
    String(sheet.getRange(1, 1).getValue()) === "提交信息" &&
    String(sheet.getRange(2, BASE_HEADERS.length + 1).getValue()) === SOURCE_ORDER[0] &&
    String(sheet.getRange(2, BASE_HEADERS.length + SOURCE_ORDER.length).getValue()) === SOURCE_ORDER[SOURCE_ORDER.length - 1];
}

function hasSurveyData_(sheet) {
  const lastRow = sheet.getLastRow();
  const firstCell = String(sheet.getRange(1, 1).getValue());
  const firstDataRow = firstCell === "提交信息" ? 3 : 2;
  if (lastRow < firstDataRow) {
    return false;
  }

  return sheet.getRange(firstDataRow, 1, lastRow - firstDataRow + 1, 1)
    .getValues()
    .some(function (row) { return String(row[0]).trim() !== ""; });
}

function getAllResponseSheets_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    return [];
  }

  return [RESPONSE_SHEET_NAME, MODERN_RESPONSE_SHEET_NAME, LEGACY_MODERN_RESPONSE_SHEET_NAME]
    .map(function (name) { return spreadsheet.getSheetByName(name); })
    .filter(function (sheet) { return sheet !== null; });
}

function normalizeNickname_(nickname) {
  return String(nickname || "").trim().toLocaleLowerCase();
}

function getCompletedSetIds_(nickname) {
  const normalized = normalizeNickname_(nickname);
  const completed = {};

  if (!normalized) {
    return [];
  }

  getAllResponseSheets_().forEach(function (sheet) {
    const values = sheet.getDataRange().getValues();
    const firstCell = values.length && values[0].length ? String(values[0][0]) : "";
    const firstDataIndex = firstCell === "提交信息" ? 2 : 1;

    for (let index = firstDataIndex; index < values.length; index += 1) {
      const row = values[index];
      if (normalizeNickname_(row[1]) !== normalized) {
        continue;
      }

      const setId = Number(row[3]);
      if (Number.isInteger(setId) && setId >= 1 && setId <= 13) {
        completed[setId] = true;
      }
    }
  });

  return Object.keys(completed).map(Number).sort(function (a, b) { return a - b; });
}

function buildRow_(payload) {
  const videos = Array.isArray(payload.videos) ? payload.videos : [];
  const bySource = {};
  videos.forEach(function (video) {
    bySource[String(video.source)] = video;
  });

  const row = [
    safeCell_(payload.submitted_at),
    safeCell_(payload.nickname),
    safeCell_(payload.study_version),
    Number(payload.set_id) || "",
    safeCell_(payload.completion_mode),
    safeCell_(JSON.stringify(payload.display_order || []))
  ];

  METRIC_GROUPS.forEach(function (metric) {
    SOURCE_ORDER.forEach(function (source) {
      const video = bySource[source] || {};
      const scores = video.scores || {};
      row.push(numberOrBlank_(scores[metric.key]));
    });
  });

  return row;
}

function numberOrBlank_(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
}

function safeCell_(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonp_(callback, value) {
  if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return json_({ ok: false, error: "Invalid callback name." });
  }

  return ContentService
    .createTextOutput(callback + "(" + JSON.stringify(value) + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
