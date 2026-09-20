/**
 * Google Apps Script endpoint for the static /user_study/ page.
 *
 * Create a private Google Sheet, open Extensions > Apps Script, paste this
 * file, and deploy it as a Web app. See README.md for the exact settings.
 */
const RESPONSE_SHEET_NAME = "Responses";

const SOURCE_ORDER = ["ours", "c2w", "viga"];

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
  return headers.concat(SOURCE_ORDER.map(function (source) {
    return source + "_" + metric.key;
  }));
}, []);

const HEADERS = BASE_HEADERS.concat(SCORE_HEADERS);

function doGet() {
  try {
    const sheet = getResponseSheet_();
    return json_({
      ok: true,
      sheet: sheet.getName(),
      data_rows: countDataRows_(sheet)
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

  return spreadsheet.getSheetByName(RESPONSE_SHEET_NAME) ||
    spreadsheet.insertSheet(RESPONSE_SHEET_NAME);
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    initializeHeaders_(sheet);
    return;
  }

  // The first version created one technical header row. Replace that header
  // only when it is the sole row and no survey data exists yet.
  if (
    sheet.getLastRow() === 1 &&
    String(sheet.getRange(1, 1).getValue()) === "submitted_at"
  ) {
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
