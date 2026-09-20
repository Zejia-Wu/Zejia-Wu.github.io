/**
 * Google Apps Script endpoint for the static /user_study/ page.
 *
 * Create a private Google Sheet, open Extensions > Apps Script, paste this
 * file, and deploy it as a Web app. See README.md for the exact settings.
 */
const RESPONSE_SHEET_NAME = "Responses";

const HEADERS = [
  "submitted_at",
  "nickname",
  "study_version",
  "set_id",
  "completion_mode",
  "position_1_source",
  "position_1_file",
  "position_1_physical_plausibility",
  "position_1_camera_controllability",
  "position_1_content_alignment",
  "position_1_aesthetics",
  "position_2_source",
  "position_2_file",
  "position_2_physical_plausibility",
  "position_2_camera_controllability",
  "position_2_content_alignment",
  "position_2_aesthetics",
  "position_3_source",
  "position_3_file",
  "position_3_physical_plausibility",
  "position_3_camera_controllability",
  "position_3_content_alignment",
  "position_3_aesthetics"
];

function doGet() {
  try {
    const sheet = getResponseSheet_();
    return json_({
      ok: true,
      sheet: sheet.getName(),
      data_rows: Math.max(0, sheet.getLastRow() - 1)
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
    sheet.appendRow(HEADERS);
  }
}

function buildRow_(payload) {
  const videos = Array.isArray(payload.videos) ? payload.videos : [];
  const byPosition = {};
  videos.forEach(function (video) {
    byPosition[String(video.position)] = video;
  });

  const row = [
    safeCell_(payload.submitted_at),
    safeCell_(payload.nickname),
    safeCell_(payload.study_version),
    Number(payload.set_id) || "",
    safeCell_(payload.completion_mode)
  ];

  [1, 2, 3].forEach(function (position) {
    const video = byPosition[String(position)] || {};
    const scores = video.scores || {};
    row.push(safeCell_(video.source));
    row.push(safeCell_(video.file));
    row.push(numberOrBlank_(scores.physical_plausibility));
    row.push(numberOrBlank_(scores.camera_controllability));
    row.push(numberOrBlank_(scores.content_alignment));
    row.push(numberOrBlank_(scores.aesthetics));
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
