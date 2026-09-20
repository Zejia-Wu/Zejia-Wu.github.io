(function () {
  "use strict";

  var config = window.USER_STUDY_CONFIG || {};
  var submissionEndpoint = typeof config.submissionEndpoint === "string"
    ? config.submissionEndpoint.trim()
    : "";
  var studyVersion = config.studyVersion || "user-study-v1";
  var localStorageKey = "user-study-submissions-v1";

  var metrics = [
    {
      key: "physical_plausibility",
      zh: "物理合理性",
      en: "Physical Plausibility"
    },
    {
      key: "camera_controllability",
      zh: "相机可控",
      en: "Camera Controllability"
    },
    {
      key: "content_alignment",
      zh: "内容对齐",
      en: "Content Alignment"
    },
    {
      key: "aesthetics",
      zh: "美学质量",
      en: "Aesthetics"
    }
  ];

  var sources = ["viga", "c2w", "ours"];
  var state = {
    nickname: "",
    setId: null,
    displayVideos: [],
    completedPositions: new Set(),
    missingPositions: new Set(),
    completionMode: "watched"
  };

  var introScreen = document.getElementById("intro-screen");
  var studyScreen = document.getElementById("study-screen");
  var successScreen = document.getElementById("success-screen");
  var nicknameForm = document.getElementById("nickname-form");
  var nicknameInput = document.getElementById("nickname");
  var introError = document.getElementById("intro-error");
  var videoGrid = document.getElementById("video-grid");
  var progressCount = document.getElementById("progress-count");
  var watchStatus = document.getElementById("watch-status");
  var skipVideosButton = document.getElementById("skip-videos");
  var scoringSection = document.getElementById("scoring-section");
  var scoreGrid = document.getElementById("score-grid");
  var scoringForm = document.getElementById("scoring-form");
  var submitButton = document.getElementById("submit-button");
  var submitMessage = document.getElementById("submit-message");
  var successMessage = document.getElementById("success-message");
  var restartButton = document.getElementById("restart-button");

  function shuffle(items) {
    var copy = items.slice();
    for (var index = copy.length - 1; index > 0; index -= 1) {
      var randomIndex = Math.floor(Math.random() * (index + 1));
      var temporary = copy[index];
      copy[index] = copy[randomIndex];
      copy[randomIndex] = temporary;
    }
    return copy;
  }

  function twoDigit(value) {
    return String(value).padStart(2, "0");
  }

  function createSession() {
    state.setId = Math.floor(Math.random() * 13) + 1;
    state.displayVideos = shuffle(sources).map(function (source, index) {
      var file = twoDigit(state.setId) + ".mp4";
      return {
        position: index + 1,
        source: source,
        file: file,
        src: "../videos/" + source + "/" + file
      };
    });
    state.completedPositions = new Set();
    state.missingPositions = new Set();
    state.completionMode = "watched";
  }

  function setHidden(element, hidden) {
    element.hidden = hidden;
  }

  function renderVideoCards() {
    videoGrid.innerHTML = "";

    state.displayVideos.forEach(function (videoData) {
      var card = document.createElement("article");
      card.className = "video-card";
      card.dataset.position = String(videoData.position);

      var header = document.createElement("div");
      header.className = "video-card-header";

      var title = document.createElement("span");
      title.className = "video-number";
      title.textContent = "视频 " + videoData.position;

      var status = document.createElement("span");
      status.className = "video-state";
      status.textContent = "未完成";
      status.dataset.state = "pending";

      header.appendChild(title);
      header.appendChild(status);

      var frame = document.createElement("div");
      frame.className = "video-frame";

      var video = document.createElement("video");
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.src = videoData.src;
      video.setAttribute("aria-label", "视频 " + videoData.position);
      video.dataset.position = String(videoData.position);

      var placeholder = document.createElement("div");
      placeholder.className = "video-placeholder";
      placeholder.hidden = true;
      placeholder.innerHTML = "<div><strong>视频资源暂未提供</strong><span>可以跳过空视频并继续评分。</span></div>";

      video.addEventListener("ended", function () {
        markComplete(videoData.position, "watched");
      });

      video.addEventListener("error", function () {
        markMissing(videoData.position, card, video, placeholder);
      });

      frame.appendChild(video);
      frame.appendChild(placeholder);

      var footer = document.createElement("div");
      footer.className = "video-card-footer";
      footer.textContent = "播放结束后自动记录完成";

      card.appendChild(header);
      card.appendChild(frame);
      card.appendChild(footer);
      videoGrid.appendChild(card);
    });

    updateProgress();
  }

  function getCard(position) {
    return videoGrid.querySelector('[data-position="' + position + '"]');
  }

  function markMissing(position, card, video, placeholder) {
    if (state.completedPositions.has(position)) {
      return;
    }
    state.missingPositions.add(position);
    video.hidden = true;
    placeholder.hidden = false;
    card.classList.add("is-missing");
    card.querySelector(".video-state").textContent = "暂缺资源";
    card.querySelector(".video-card-footer").textContent = "视频制作完成后可替换此占位资源";
    updateProgress();
  }

  function markComplete(position, mode) {
    state.completedPositions.add(position);
    if (mode === "skipped") {
      state.completionMode = "skipped_missing";
    }

    var card = getCard(position);
    if (card) {
      card.classList.add("is-complete");
      var status = card.querySelector(".video-state");
      status.textContent = mode === "skipped" ? "已跳过" : "已完成";
      status.dataset.state = "complete";
    }

    updateProgress();
  }

  function updateProgress() {
    var completed = state.completedPositions.size;
    progressCount.textContent = completed + " / 3";

    if (completed === 3) {
      watchStatus.textContent = state.completionMode === "skipped_missing"
        ? "空视频已跳过，可以开始评分。"
        : "三个视频已播放完成，可以开始评分。";
      setHidden(skipVideosButton, true);
      revealScoring();
      return;
    }

    if (state.missingPositions.size > 0) {
      watchStatus.textContent = "有 " + state.missingPositions.size + " 个视频资源暂未提供。";
      setHidden(skipVideosButton, false);
    } else {
      watchStatus.textContent = "请完整观看三个视频，当前已完成 " + completed + " 个。";
      setHidden(skipVideosButton, true);
    }
  }

  function revealScoring() {
    if (!scoringSection.hidden) {
      return;
    }
    renderScoreCards();
    setHidden(scoringSection, false);
    window.setTimeout(function () {
      scoringSection.scrollIntoView({ behavior: "smooth", block: "start" });
      var firstInput = scoringSection.querySelector("input");
      if (firstInput) {
        firstInput.focus({ preventScroll: true });
      }
    }, 80);
  }

  function renderScoreCards() {
    scoreGrid.innerHTML = "";

    state.displayVideos.forEach(function (videoData) {
      var card = document.createElement("section");
      card.className = "score-card";

      var heading = document.createElement("div");
      heading.className = "score-card-heading";

      var title = document.createElement("h3");
      title.textContent = "视频 " + videoData.position;
      var subtitle = document.createElement("p");
      subtitle.textContent = "请独立评价这个视频";
      heading.appendChild(title);
      heading.appendChild(subtitle);

      var table = document.createElement("div");
      table.className = "score-table";

      metrics.forEach(function (metric) {
        var row = document.createElement("div");
        row.className = "score-row";

        var label = document.createElement("label");
        var inputId = "score-" + videoData.position + "-" + metric.key;
        label.className = "metric-label";
        label.htmlFor = inputId;
        label.innerHTML = "<span>" + metric.zh + "</span><small>" + metric.en + "</small>";

        var input = document.createElement("input");
        input.id = inputId;
        input.name = inputId;
        input.type = "number";
        input.min = "0.1";
        input.max = "5";
        input.step = "0.1";
        input.inputMode = "decimal";
        input.required = true;
        input.setAttribute("aria-label", "视频 " + videoData.position + " - " + metric.en);

        row.appendChild(label);
        row.appendChild(input);
        table.appendChild(row);
      });

      card.appendChild(heading);
      card.appendChild(table);
      scoreGrid.appendChild(card);
    });
  }

  function collectPayload() {
    return {
      study_version: studyVersion,
      submitted_at: new Date().toISOString(),
      nickname: state.nickname,
      set_id: state.setId,
      completion_mode: state.completionMode,
      display_order: state.displayVideos.map(function (videoData) {
        return videoData.source;
      }),
      videos: state.displayVideos.map(function (videoData) {
        var scores = {};
        metrics.forEach(function (metric) {
          var input = document.getElementById("score-" + videoData.position + "-" + metric.key);
          scores[metric.key] = Number(input.value);
        });
        return {
          position: videoData.position,
          source: videoData.source,
          file: videoData.file,
          scores: scores
        };
      })
    };
  }

  function saveLocally(payload) {
    try {
      var previous = JSON.parse(window.localStorage.getItem(localStorageKey) || "[]");
      if (!Array.isArray(previous)) {
        previous = [];
      }
      previous.push(payload);
      window.localStorage.setItem(localStorageKey, JSON.stringify(previous.slice(-50)));
      return true;
    } catch (error) {
      return false;
    }
  }

  function sendWithHiddenForm(payload) {
    return new Promise(function (resolve, reject) {
      var frameName = "user-study-submit-" + Date.now();
      var iframe = document.createElement("iframe");
      iframe.name = frameName;
      iframe.hidden = true;
      iframe.setAttribute("aria-hidden", "true");

      var form = document.createElement("form");
      form.method = "POST";
      form.action = submissionEndpoint;
      form.target = frameName;
      form.hidden = true;

      var field = document.createElement("input");
      field.type = "hidden";
      field.name = "payload";
      field.value = JSON.stringify(payload);
      form.appendChild(field);

      document.body.appendChild(iframe);
      document.body.appendChild(form);

      try {
        form.submit();
        window.setTimeout(function () {
          form.remove();
          iframe.remove();
        }, 15000);
        resolve({ mode: "online", queued: true });
      } catch (error) {
        form.remove();
        iframe.remove();
        reject(error);
      }
    });
  }

  async function sendPayload(payload) {
    if (!submissionEndpoint) {
      return { mode: "local", stored: saveLocally(payload) };
    }

    try {
      return await sendWithHiddenForm(payload);
    } catch (formError) {
      // Continue with fetch when the browser cannot submit the hidden form.
    }

    var controller = typeof AbortController === "function"
      ? new AbortController()
      : null;
    var timeoutId = controller
      ? window.setTimeout(function () { controller.abort(); }, 12000)
      : null;

    try {
      await window.fetch(submissionEndpoint, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      });
      return { mode: "online", stored: true };
    } catch (error) {
      return { mode: "local", stored: saveLocally(payload) };
    } finally {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  function showIntroError(message) {
    introError.textContent = message;
    setHidden(introError, false);
  }

  nicknameForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var nickname = nicknameInput.value.trim();

    if (!nickname) {
      showIntroError("请输入昵称后再开始。 ");
      nicknameInput.focus();
      return;
    }

    if (nickname.length > 40) {
      showIntroError("昵称不能超过 40 个字符。 ");
      nicknameInput.focus();
      return;
    }

    introError.textContent = "";
    setHidden(introError, true);
    state.nickname = nickname;
    createSession();
    renderVideoCards();
    setHidden(introScreen, true);
    setHidden(studyScreen, false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  skipVideosButton.addEventListener("click", function () {
    state.missingPositions.forEach(function (position) {
      markComplete(position, "skipped");
    });
  });

  scoringForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    submitMessage.className = "form-message";
    submitMessage.textContent = "";

    if (!scoringForm.checkValidity()) {
      submitMessage.className = "form-message error-message";
      submitMessage.textContent = "请为每个视频填写四项评分，范围为 0.1–5.0。";
      scoringForm.reportValidity();
      return;
    }

    var payload = collectPayload();
    submitButton.disabled = true;
    submitButton.textContent = "正在提交…";

    var result = await sendPayload(payload);
    setHidden(studyScreen, true);
    setHidden(successScreen, false);

    if (result.mode === "online") {
      successMessage.textContent = "提交请求已发送到线上数据库，感谢你的帮助。稍后可在 Responses 工作表中查看记录。";
    } else if (!submissionEndpoint) {
      successMessage.textContent = "线上接口尚未配置，评分已暂存在本设备中。完成数据库部署后即可改为线上提交。";
    } else if (result.stored) {
      successMessage.textContent = "线上接口暂时连接失败，评分已暂存在本设备中。请检查 Apps Script 部署权限或稍后重试。";
    } else {
      successMessage.textContent = "线上接口连接失败，且本设备暂存失败。请保留本页信息并联系调查发起人。";
    }
  });

  restartButton.addEventListener("click", function () {
    window.location.reload();
  });
}());
