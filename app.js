const STORAGE_KEY = "questProgress";

const state = {
  stages: [],
  steps: [],
  codes: {},
  currentIndex: 0,
  progress: {
    maxUnlockedIndex: 0,
    completedStepIds: [],
    wrongCount: 0,
    codePiecesShown: {},
    lastIndex: 0,
    answers: {},
  },
  lastDirection: "right",
};

const elements = {
  stageTitle: document.getElementById("stage-title"),
  step: document.getElementById("step"),
  main: document.getElementById("main"),
  back: document.getElementById("back"),
  action: document.getElementById("action"),
  codePiece: document.getElementById("code-piece"),
  errorCount: document.getElementById("error-count"),
  reset: document.getElementById("reset"),
};

const normalizeText = (value, rules = {}) => {
  let next = value;
  if (rules.trim) {
    next = next.trim();
  }
  if (rules.collapseSpaces) {
    next = next.replace(/\s+/g, " ");
  }
  if (rules.caseInsensitive) {
    next = next.toLowerCase();
  }
  return next;
};

const loadData = async () => {
  const baseUrl = new URL("./", window.location.href);
  const [stagesResponse, codesResponse] = await Promise.all([
    fetch(new URL("data/stages.json", baseUrl)),
    fetch(new URL("data/codes.json", baseUrl)),
  ]);
  const stagesData = await stagesResponse.json();
  const codesData = await codesResponse.json();

  if (!stagesData.stages || !Array.isArray(stagesData.stages)) {
    throw new Error("Invalid stages.json");
  }
  state.stages = stagesData.stages;
  state.steps = stagesData.stages.flatMap((stage) =>
    stage.steps.map((step) => ({ ...step, stageTitle: stage.title }))
  );
  state.codes = codesData.pieces || {};
};

const loadProgress = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
    state.progress = {
      ...state.progress,
      ...parsed,
      completedStepIds: parsed.completedStepIds || [],
      codePiecesShown: parsed.codePiecesShown || {},
      answers: parsed.answers || {},
    };
  } catch (error) {
    console.warn("Failed to parse saved progress", error);
  }
};

const saveProgress = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
};

const updateErrorCount = () => {
  const { wrongCount } = state.progress;
  if (wrongCount > 0) {
    elements.errorCount.textContent = `Ошибки: ${wrongCount}`;
    elements.errorCount.classList.add("is-visible");
  } else {
    elements.errorCount.textContent = "";
    elements.errorCount.classList.remove("is-visible");
  }
};

const markWrong = () => {
  state.progress.wrongCount += 1;
  saveProgress();
  updateErrorCount();
};

const isCompleted = (stepId) =>
  state.progress.completedStepIds.includes(stepId);

const isUnlocked = (index) => index <= state.progress.maxUnlockedIndex;

const getCurrentStep = () => state.steps[state.currentIndex];

const renderFinal = (step) => {
  const container = document.createElement("div");
  container.className = "final-content";
  step.content.forEach((line) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = line;
    container.appendChild(paragraph);
  });
  return container;
};

const renderInput = (step) => {
  const group = document.createElement("div");
  group.className = "input-group";
  const savedAnswer = state.progress.answers[step.id];

  if (step.type === "text") {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "text-input";
    input.placeholder = "Ответ";
    input.autocomplete = "off";
    if (typeof savedAnswer === "string") {
      input.value = savedAnswer;
    }
    input.addEventListener("input", () => {
      state.progress.answers[step.id] = input.value;
      saveProgress();
    });
    group.appendChild(input);
  }

  if (step.type === "date") {
    const wrapper = document.createElement("div");
    wrapper.className = "date-input-wrapper";
    const input = document.createElement("input");
    input.type = "date";
    input.className = "date-input";
    if (typeof savedAnswer === "string") {
      input.value = savedAnswer;
    }
    input.addEventListener("input", () => {
      state.progress.answers[step.id] = input.value;
      saveProgress();
    });
    wrapper.appendChild(input);
    group.appendChild(wrapper);
  }

  if (step.type === "radio" || step.type === "checkbox") {
    step.options.forEach((option) => {
      const label = document.createElement("label");
      label.className = "input-row";
      label.dataset.optionId = option.id;

      const input = document.createElement("input");
      input.type = step.type;
      input.name = step.id;
      input.value = option.id;
      input.id = `${step.id}-${option.id}`;
      if (step.type === "radio" && savedAnswer === option.id) {
        input.checked = true;
      }
      if (
        step.type === "checkbox" &&
        Array.isArray(savedAnswer) &&
        savedAnswer.includes(option.id)
      ) {
        input.checked = true;
      }
      input.addEventListener("change", () => {
        if (step.type === "radio") {
          state.progress.answers[step.id] = input.checked ? input.value : "";
        } else {
          const checked = Array.from(
            group.querySelectorAll("input:checked")
          ).map((item) => item.value);
          state.progress.answers[step.id] = checked;
        }
        saveProgress();
      });

      const span = document.createElement("span");
      span.textContent = option.label;

      label.appendChild(input);
      label.appendChild(span);

      if (step.type === "checkbox") {
        const blockedIds = step.blockedOptionIds || [];
        if (blockedIds.includes(option.id)) {
          label.addEventListener("click", (event) => {
            markWrong();
            input.checked = true;
            label.classList.add("is-blocked-feedback");
            setTimeout(() => {
              input.checked = false;
              label.classList.remove("is-blocked-feedback");
              const checked = Array.from(
                group.querySelectorAll("input:checked")
              ).map((item) => item.value);
              state.progress.answers[step.id] = checked;
              saveProgress();
            }, 1000);
          });
        }
      }

      group.appendChild(label);
    });
  }

  return group;
};

const validateStep = (step) => {
  if (step.type === "final") return true;
  const inputGroup = elements.step.querySelector(".input-group");
  if (!inputGroup) return false;

  if (step.type === "text") {
    const input = inputGroup.querySelector("input");
    const normalized = normalizeText(input.value, step.rules);
    const expected = normalizeText(step.rules.equalsText || "", step.rules);
    return normalized === expected;
  }

  if (step.type === "date") {
    const input = inputGroup.querySelector("input");
    return input.value === step.rules.equals;
  }

  if (step.type === "radio") {
    const checked = inputGroup.querySelector("input:checked");
    if (!checked) return false;
    if (step.rules.equalsOptionId) {
      return checked.value === step.rules.equalsOptionId;
    }
    if (step.rules.equalsOptionLabel) {
      const selected = step.options.find((option) => option.id === checked.value);
      return selected?.label === step.rules.equalsOptionLabel;
    }
  }

  if (step.type === "checkbox") {
    const checked = Array.from(
      inputGroup.querySelectorAll("input:checked")
    ).map((input) => input.value);

    if (step.rules.mustSelectAll) {
      return checked.length === step.options.length;
    }
    if (step.rules.atLeastOneOfAllowed) {
      const blocked = new Set(step.blockedOptionIds || []);
      return checked.some((id) => !blocked.has(id));
    }
  }

  return false;
};

const setError = (message = "") => {
  const errorMessage = elements.step.querySelector(".error-message");
  if (!errorMessage) return;
  if (message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove("is-hidden");
  } else {
    errorMessage.textContent = "";
    errorMessage.classList.add("is-hidden");
  }
};

const showCodePiece = (stepId) => {
  const piece = state.codes[stepId];
  if (!piece) {
    elements.codePiece.textContent = "";
    elements.codePiece.classList.remove("is-visible");
    return;
  }
  elements.codePiece.textContent = piece;
  elements.codePiece.classList.add("is-visible");
};

const renderStep = () => {
  const step = getCurrentStep();
  if (!step) return;

  elements.stageTitle.textContent = step.stageTitle;
  elements.step.innerHTML = "";

  const directionClass =
    state.lastDirection === "left" ? "slide-in-left" : "slide-in-right";
  elements.step.classList.remove("slide-in-left", "slide-in-right");
  elements.step.classList.add(directionClass);

  const prompt = document.createElement("p");
  prompt.className = "prompt";
  if (step.type === "final") {
    prompt.textContent = "Финал";
  } else if (step.id === "s1-q1") {
    prompt.textContent = step.prompt;
  } else {
    const questionSteps = state.steps.filter(
      (item) => item.type !== "final" && item.id !== "s1-q1"
    );
    const questionIndex = questionSteps.findIndex(
      (item) => item.id === step.id
    );
    const questionNumber = questionIndex === -1 ? "" : `${questionIndex + 1}. `;
    prompt.textContent = `Вопрос ${questionNumber}${step.prompt}`;
  }

  elements.step.appendChild(prompt);

  if (step.type === "final") {
    elements.step.appendChild(renderFinal(step));
  } else {
    elements.step.appendChild(renderInput(step));
  }

  const errorMessage = document.createElement("div");
  errorMessage.className = "error-message is-hidden";
  elements.step.appendChild(errorMessage);

  const completed = isCompleted(step.id);
  const isFinal = step.type === "final";

  elements.back.disabled = state.currentIndex === 0;
  if (isFinal) {
    elements.action.disabled = true;
    elements.action.textContent = "";
    elements.action.classList.add("is-hidden");
  } else {
    elements.action.classList.remove("is-hidden");
    elements.action.disabled = false;
    elements.action.textContent = completed ? "Далее" : "Проверить";
  }

  if (completed) {
    showCodePiece(step.id);
  } else {
    elements.codePiece.textContent = "";
    elements.codePiece.classList.remove("is-visible");
  }

  updateErrorCount();
};

const updateProgressOnSuccess = (step) => {
  if (!isCompleted(step.id)) {
    state.progress.completedStepIds.push(step.id);
  }
  state.progress.maxUnlockedIndex = Math.max(
    state.progress.maxUnlockedIndex,
    state.currentIndex + 1
  );
  state.progress.lastIndex = Math.min(
    state.currentIndex,
    state.progress.maxUnlockedIndex
  );

  if (state.codes[step.id]) {
    state.progress.codePiecesShown[step.id] = state.codes[step.id];
  }
  saveProgress();
};

const handleCheck = () => {
  const step = getCurrentStep();
  if (isCompleted(step.id)) {
    goNext();
    return;
  }
  const isValid = validateStep(step);
  if (isValid) {
    setError("");
    updateProgressOnSuccess(step);
    renderStep();
    elements.step.classList.add("is-success");
    setTimeout(() => elements.step.classList.remove("is-success"), 900);
    return;
  }
  markWrong();
  setError("Неверный ответ. Попробуй ещё раз.");
  elements.step.classList.add("is-error");
  setTimeout(() => elements.step.classList.remove("is-error"), 280);
};

const goNext = () => {
  if (!isUnlocked(state.currentIndex + 1)) return;
  state.lastDirection = "right";
  state.currentIndex += 1;
  state.progress.lastIndex = state.currentIndex;
  saveProgress();
  renderStep();
};

const goBack = () => {
  if (state.currentIndex === 0) return;
  state.lastDirection = "left";
  state.currentIndex -= 1;
  state.progress.lastIndex = state.currentIndex;
  saveProgress();
  renderStep();
};

const resetProgress = () => {
  state.progress = {
    maxUnlockedIndex: 0,
    completedStepIds: [],
    wrongCount: 0,
    codePiecesShown: {},
    lastIndex: 0,
    answers: {},
  };
  state.currentIndex = 0;
  saveProgress();
  renderStep();
};

const init = async () => {
  await loadData();
  loadProgress();

  if (state.progress.lastIndex > state.progress.maxUnlockedIndex) {
    state.progress.lastIndex = state.progress.maxUnlockedIndex;
  }
  state.currentIndex = Math.min(
    state.progress.lastIndex,
    state.steps.length - 1
  );

  elements.back.addEventListener("click", goBack);
  elements.action.addEventListener("click", handleCheck);
  elements.reset.addEventListener("click", resetProgress);

  renderStep();
};

init();
