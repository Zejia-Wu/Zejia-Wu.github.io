(function () {
  "use strict";

  var config = window.USER_STUDY_CONFIG || {};
  var submissionEndpoint = typeof config.submissionEndpoint === "string"
    ? config.submissionEndpoint.trim()
    : "";
  var videoBaseUrl = typeof config.videoBaseUrl === "string" && config.videoBaseUrl.trim()
    ? config.videoBaseUrl.trim().replace(/\/+$/, "")
    : "../videos";
  var studyVersion = config.studyVersion || "user-study-v1";
  var legacyLocalStorageKeys = ["user-study-submissions-v1", "user-study-history-v1"];
  var totalSetCount = 13;
  var targetGroupCount = 8;
  var testMode = new URLSearchParams(window.location.search).get("test") === "1";

  var metrics = [
    {
      key: "physical_plausibility",
      zh: "物理合理性",
      en: "Physical Plausibility"
    },
    {
      key: "camera_controllability",
      zh: "运镜质量",
      en: "Camera Motion Quality"
    },
    {
      key: "content_alignment",
      zh: "语义对齐",
      en: "Content Alignment"
    },
    {
      key: "aesthetics",
      zh: "美学质量",
      en: "Aesthetics"
    }
  ];

  // Prompt text can be filled per set later. It is intentionally blank for now.
  var prompts = window.USER_STUDY_PROMPTS || {};

  var sources = ["viga", "c2w", "ours", "direct", "mcp", "swe"];
  var state = {
    nickname: "",
    setId: null,
    displayVideos: [],
    completedPositions: new Set(),
    missingPositions: new Set(),
    completionMode: "watched",
    completedSetIds: new Set(),
    availableSetIds: [],
    groupsCompleted: 0
  };

  var introScreen = document.getElementById("intro-screen");
  var studyScreen = document.getElementById("study-screen");
  var successScreen = document.getElementById("success-screen");
  var nicknameForm = document.getElementById("nickname-form");
  var nicknameInput = document.getElementById("nickname");
  var introError = document.getElementById("intro-error");
  var videoGrid = document.getElementById("video-grid");
  var progressCount = document.getElementById("progress-count");
  var roundSummary = document.getElementById("round-summary");
  var promptText = document.getElementById("prompt-text");
  var watchStatus = document.getElementById("watch-status");
  var skipVideosButton = document.getElementById("skip-videos");
  var scoringSection = document.getElementById("scoring-section");
  var scoreGrid = document.getElementById("score-grid");
  var scoringForm = document.getElementById("scoring-form");
  var autofillButton = document.getElementById("autofill-button");
  var submitButton = document.getElementById("submit-button");
  var roundMessage = document.getElementById("round-message");
  var submitMessage = document.getElementById("submit-message");
  var successMessage = document.getElementById("success-message");
  var restartButton = document.getElementById("restart-button");
  var videoModal = document.getElementById("video-modal");
  var closeVideoModalButton = document.getElementById("close-video-modal");
  var modalVideoContainer = document.getElementById("modal-video-container");
  var lastFocusedVideoControl = null;

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

  function createSession(setId) {
    state.setId = setId;
    state.displayVideos = shuffle(sources).map(function (source, index) {
      var file = twoDigit(state.setId) + ".mp4";
      return {
        position: index + 1,
        source: source,
        file: file,
        src: videoBaseUrl + "/" + source + "/" + file
      };
    });
    state.completedPositions = new Set();
    state.missingPositions = new Set();
    state.completionMode = "watched";
  }

  function allSetIds() {
    var ids = [];
    for (var id = 1; id <= totalSetCount; id += 1) {
      ids.push(id);
    }
    return ids;
  }

  function validSetIds(values) {
    var seen = new Set();
    (Array.isArray(values) ? values : []).forEach(function (value) {
      var id = Number(value);
      if (Number.isInteger(id) && id >= 1 && id <= totalSetCount) {
        seen.add(id);
      }
    });
    return Array.from(seen).sort(function (a, b) { return a - b; });
  }

  function normalizeNickname(nickname) {
    return String(nickname || "").trim().toLocaleLowerCase();
  }

  function refreshRoundUi() {
    var currentRound = state.groupsCompleted + 1;
    var groupsLeftAfterThis = Math.max(0, targetGroupCount - currentRound);
    roundSummary.textContent = "已记录 " + state.groupsCompleted + " 组；当前第 " +
      currentRound + " / " + targetGroupCount + " 组；本组后还需 " + groupsLeftAfterThis + " 组。";

    if (groupsLeftAfterThis > 0) {
      roundMessage.textContent = "提交本组后将自动进入下一组，还需完成 " + groupsLeftAfterThis + " 组。";
      submitButton.firstChild.textContent = "提交本组并进入下一组 ";
    } else {
      roundMessage.textContent = "这是最后一组，提交后调查结束。";
      submitButton.firstChild.textContent = "提交最后一组 ";
    }
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
      var footerText = document.createElement("span");
      footerText.textContent = "播放结束后自动记录完成";

      var expandButton = document.createElement("button");
      expandButton.className = "video-expand";
      expandButton.type = "button";
      expandButton.textContent = "放大播放 ↗";
      expandButton.setAttribute("aria-label", "放大播放视频 " + videoData.position);
      expandButton.addEventListener("click", function () {
        openVideoModal(videoData, expandButton);
      });

      footer.appendChild(footerText);
      footer.appendChild(expandButton);

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
    card.querySelector(".video-card-footer span").textContent = "视频制作完成后可替换此占位资源";
    card.querySelector(".video-expand").hidden = true;
    updateProgress();
  }

  function openVideoModal(videoData, trigger) {
    lastFocusedVideoControl = trigger;
    modalVideoContainer.innerHTML = "";

    var modalVideo = document.createElement("video");
    modalVideo.controls = true;
    modalVideo.playsInline = true;
    modalVideo.preload = "metadata";
    modalVideo.src = videoData.src;
    modalVideo.setAttribute("aria-label", "放大播放视频 " + videoData.position);
    modalVideo.addEventListener("ended", function () {
      markComplete(videoData.position, "watched");
    });

    modalVideoContainer.appendChild(modalVideo);
    setHidden(videoModal, false);
    document.body.classList.add("modal-open");
    closeVideoModalButton.focus();
  }

  function closeVideoModal() {
    var modalVideo = modalVideoContainer.querySelector("video");
    if (modalVideo) {
      modalVideo.pause();
    }
    modalVideoContainer.innerHTML = "";
    setHidden(videoModal, true);
    document.body.classList.remove("modal-open");
    if (lastFocusedVideoControl) {
      lastFocusedVideoControl.focus();
    }
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
    progressCount.textContent = completed + " / " + sources.length;

    if (completed === sources.length) {
      watchStatus.textContent = state.completionMode === "skipped_missing"
        ? (testMode ? "测试模式已跳过视频，可以开始评分。" : "空视频已跳过，可以开始评分。")
        : "全部视频已播放完成，可以开始评分。";
      setHidden(skipVideosButton, true);
      revealScoring();
      return;
    }

    if (testMode) {
      watchStatus.textContent = "测试模式：可跳过视频并进入评分。";
      setHidden(skipVideosButton, false);
    } else {
      watchStatus.textContent = "请观看完所有视频后继续。";
      setHidden(skipVideosButton, true);
    }
  }

  function revealScoring() {
    if (!scoringSection.hidden) {
      return;
    }
    renderScoreCards();
    setHidden(scoringSection, false);
    setHidden(autofillButton, !testMode);
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
        input.min = "1";
        input.max = "5";
        input.step = "1";
        input.inputMode = "numeric";
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

  function clearLocalStorageFromUrl() {
    var query = new URLSearchParams(window.location.search);
    var clearAll = query.get("clear_local") === "all";
    var resetNickname = query.get("reset_local");
    if (!clearAll && !resetNickname) {
      return;
    }

    try {
      if (clearAll) {
        window.localStorage.clear();
      } else {
        legacyLocalStorageKeys.forEach(function (key) {
          window.localStorage.removeItem(key);
        });
      }
    } catch (error) {
      // The survey does not depend on localStorage.
    }

    query.delete("clear_local");
    query.delete("reset_local");
    var cleanUrl = new URL(window.location.href);
    cleanUrl.search = query.toString();
    window.history.replaceState({}, "", cleanUrl.toString());
  }

  function requestRemoteHistory(nickname) {
    return new Promise(function (resolve, reject) {
      if (!submissionEndpoint) {
        resolve([]);
        return;
      }

      var callbackName = "__userStudyHistory_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
      var script = document.createElement("script");
      var separator = submissionEndpoint.indexOf("?") >= 0 ? "&" : "?";
      var requestUrl = submissionEndpoint + separator + "action=history&nickname=" +
        encodeURIComponent(nickname) + "&callback=" + callbackName;
      var timeoutId = window.setTimeout(function () {
        cleanup();
        reject(new Error("History request timed out"));
      }, 8000);

      function cleanup() {
        window.clearTimeout(timeoutId);
        script.remove();
        try {
          delete window[callbackName];
        } catch (error) {
          window[callbackName] = undefined;
        }
      }

      window[callbackName] = function (response) {
        cleanup();
        if (response && response.ok) {
          resolve(response.completed_set_ids || []);
        } else {
          reject(new Error((response && response.error) || "History request failed"));
        }
      };

      script.onerror = function () {
        cleanup();
        reject(new Error("History request failed"));
      };
      script.src = requestUrl;
      document.head.appendChild(script);
    });
  }

  async function loadHistory(nickname) {
    if (!submissionEndpoint) {
      return [];
    }

    try {
      var remoteIds = await requestRemoteHistory(nickname);
      return validSetIds(remoteIds);
    } catch (error) {
      return [];
    }
  }

  function startRound(setId) {
    createSession(setId);
    refreshRoundUi();
    renderPrompt();
    renderVideoCards();
    setHidden(scoringSection, true);
    submitButton.disabled = false;
    submitMessage.textContent = "";
    setHidden(studyScreen, false);
    setHidden(successScreen, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderPrompt() {
    var prompt = prompts[String(state.setId)] || "";
    promptText.textContent = prompt;
    promptText.classList.toggle("is-empty", !prompt);
  }

  function showFinalSuccess(message) {
    setHidden(introScreen, true);
    setHidden(studyScreen, true);
    setHidden(successScreen, false);
    successMessage.textContent = message;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function beginStudy(nickname, startButton) {
    startButton.disabled = true;
    startButton.firstChild.textContent = "正在检查历史记录… ";

    var historyIds = await loadHistory(nickname);
    state.nickname = nickname;
    state.completedSetIds = new Set(historyIds);
    state.groupsCompleted = state.completedSetIds.size;

    if (state.groupsCompleted >= targetGroupCount) {
      showFinalSuccess("这个昵称已经完成了 " + targetGroupCount + " 组测试，感谢你的参与。");
      return;
    }

    state.availableSetIds = allSetIds().filter(function (id) {
      return !state.completedSetIds.has(id);
    });

    startRound(shuffle(state.availableSetIds)[0]);
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
      return { mode: "offline", stored: false };
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
      return { mode: "offline", stored: false };
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

  clearLocalStorageFromUrl();

  nicknameForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    var nickname = nicknameInput.value.trim();
    var startButton = nicknameForm.querySelector("button");

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

    try {
      await beginStudy(nickname, startButton);
    } catch (error) {
      startButton.disabled = false;
      startButton.firstChild.textContent = "开始调查 ";
      showIntroError("历史记录查询失败，请稍后重试。 ");
    }
  });

  skipVideosButton.addEventListener("click", function () {
    var positions = testMode
      ? state.displayVideos.map(function (videoData) { return videoData.position; })
      : Array.from(state.missingPositions);
    positions.filter(function (position) {
      return !state.completedPositions.has(position);
    }).forEach(function (position) {
      markComplete(position, "skipped");
    });
  });

  autofillButton.addEventListener("click", function () {
    scoreGrid.querySelectorAll("input[type=number]").forEach(function (input) {
      input.value = "5";
    });
    submitMessage.className = "form-message";
    submitMessage.textContent = "测试评分已填入 5 分；请确认后再点击提交。";
  });

  scoringForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    submitMessage.className = "form-message";
    submitMessage.textContent = "";

    if (!scoringForm.checkValidity()) {
      submitMessage.className = "form-message error-message";
      submitMessage.textContent = "请为每个视频填写四项评分，范围为 1–5 分整数。";
      scoringForm.reportValidity();
      return;
    }

    var payload = collectPayload();
    submitButton.disabled = true;
    submitButton.firstChild.textContent = "正在提交… ";

    var result = await sendPayload(payload);
    if (result.mode !== "online") {
      submitButton.disabled = false;
      submitButton.firstChild.textContent = "提交本组并进入下一组";
      submitMessage.className = "form-message error-message";
      submitMessage.textContent = !submissionEndpoint
        ? "线上接口尚未配置，本组评分未保存，请联系调查发起人。"
        : "线上接口连接失败，本组评分未保存，请稍后重试。";
      return;
    }

    state.completedSetIds.add(state.setId);
    state.groupsCompleted = state.completedSetIds.size;
    state.availableSetIds = allSetIds().filter(function (id) {
      return !state.completedSetIds.has(id);
    });

    var deliveryMessage = "本组评分已发送到线上数据库。";

    if (state.groupsCompleted >= targetGroupCount || state.availableSetIds.length === 0) {
      showFinalSuccess(deliveryMessage + " 8 组测试已完成，感谢你的参与。");
      return;
    }

    submitMessage.textContent = deliveryMessage;
    roundMessage.textContent = "本组已提交，即将进入下一组…";
    window.setTimeout(function () {
      startRound(shuffle(state.availableSetIds)[0]);
    }, 900);
  });

  restartButton.addEventListener("click", function () {
    window.location.reload();
  });

  closeVideoModalButton.addEventListener("click", closeVideoModal);
  videoModal.querySelector("[data-close-video-modal]").addEventListener("click", closeVideoModal);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !videoModal.hidden) {
      closeVideoModal();
    }
  });
}());
