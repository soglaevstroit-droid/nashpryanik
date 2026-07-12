/* global CameraUtils, Headers, File, PhotoSlider, URL, crypto, navigator, sessionStorage */

const authTokenStorageKey = 'stroit.demo.accessToken';
const legacyShiftStorageKey = 'stroit.demo.shiftOpen';
const legacyShiftStateStorageKey = 'stroit.demo.shiftState';
const workerEmail = 'ilya';

const steps = [
  {
    title: 'Освободить помещение, перенести инструмент.',
    description: 'Проверьте трассу кабеля.',
  },
  {
    title: 'Проложить кабельные линии по проекту — стена А.',
    description: 'Проложите кабель до коробки по трассе.',
  },
  {
    title: 'Проложить кабельные линии по проекту — стена С.',
    description: 'Нанесите маркировку на линии.',
  },
  {
    title: 'Уложить стекловату — стена А.',
    description: 'Подключите оборудование по схеме.',
  },
  {
    title: 'Уложить стекловату — стена В.',
    description: 'Проверьте линию и результат работы.',
  },
];

const taskFlowState = {
  currentStep: 1,
  afterPhotoAdded: false,
  sentToManager: false,
  taskStatus: 'ready',
  taskStartedAt: null,
  taskStatusHistory: [],
  helpRequests: [],
};

let accessToken = sessionStorage.getItem(authTokenStorageKey);
let currentUser = null;
let currentShift = null;
let workerSummary = null;
let shiftStateResolved = false;
let lastTaskLockedMessageAt = 0;
let coinTicker = null;
let historyCursor = null;
let selectedTaskId = null;
let selectedTask = null;
let taskListScrollY = 0;
let taskDetailActionPending = false;
let pendingCameraMode = null;
let cameraAttempt = {
  mode: null,
  operationId: null,
  stream: null,
  blob: null,
  previewUrl: null,
  isSubmitting: false,
  facingMode: 'environment',
  cameraCount: 0,
};

const taskStatusView = {
  ready: {
    text: 'Взять в работу',
    icon: '▶',
    caption: 'Задача ещё не начата.',
    className: 'taskStatusControl is-ready',
    next: 'working',
  },
  working: {
    text: 'В работе',
    icon: '⏸',
    caption: 'Задача выполняется.',
    className: 'taskStatusControl is-working',
    next: 'paused',
  },
  paused: {
    text: 'На паузе',
    icon: '☕',
    caption: 'Работа временно остановлена.',
    className: 'taskStatusControl is-paused',
    next: 'working',
  },
  review: {
    text: 'Ожидает проверки',
    icon: '⏳',
    caption: 'Работы завершены. Ожидает проверки прорабом.',
    className: 'taskStatusControl is-review',
    next: 'accepted',
  },
  accepted: {
    text: 'Принята',
    icon: '✔',
    caption: 'Работа проверена и принята.',
    className: 'taskStatusControl is-accepted',
    next: null,
  },
};

const taskStatusConfirmView = {
  ready: {
    icon: '▶',
    title: 'Начать выполнение задачи?',
    text: 'Будет зафиксировано время начала выполнения.',
    action: 'Начать',
    theme: 'green',
  },
  working: {
    icon: '⏸',
    title: 'Поставить задачу на паузу?',
    text: 'Работа будет временно остановлена.',
    action: 'Поставить на паузу',
    theme: 'orange',
  },
  paused: {
    icon: '▶',
    title: 'Продолжить выполнение?',
    text: 'Работа снова перейдёт в активное состояние.',
    action: 'Продолжить',
    theme: 'green',
  },
  review: {
    icon: '✔',
    title: 'Отправить задачу на проверку?',
    text: 'После отправки редактирование задачи станет недоступно.',
    action: 'Отправить',
    theme: 'green',
  },
};

const elements = {
  loginScreen: document.querySelector('#loginScreen'),
  workspaceScreen: document.querySelector('#workspaceScreen'),
  loginForm: document.querySelector('#loginForm'),
  emailInput: document.querySelector('#emailInput'),
  passwordInput: document.querySelector('#passwordInput'),
  userInfo: document.querySelector('#userInfo'),
  totalCoinBalance: document.querySelector('#totalCoinBalance'),
  workerShiftStatus: document.querySelector('#workerShiftStatus'),
  approvedCoinAmount: document.querySelector('#approvedCoinAmount'),
  pendingCoinAmount: document.querySelector('#pendingCoinAmount'),
  startWorkButton: document.querySelector('#startWorkButton'),
  modalLayer: document.querySelector('#modalLayer'),
  messagePanel: document.querySelector('#messagePanel'),
  taskProgressCount: document.querySelector('#taskProgressCount'),
  taskProgressLine: document.querySelector('#taskProgressLine'),
  taskProgressPercent: document.querySelector('#taskProgressPercent'),
  taskMeta: document.querySelector('#taskMeta'),
  taskTitle: document.querySelector('#taskTitle'),
  taskObject: document.querySelector('#taskObject'),
  stepsList: document.querySelector('#stepsList'),
  taskStatusControls: Array.from(document.querySelectorAll('[data-task-status-control]')),
  homeTaskCards: Array.from(document.querySelectorAll('[data-home-task-card]')),
  homeTaskStatuses: Array.from(document.querySelectorAll('[data-home-task-status]')),
  taskStatusConfirmIcon: document.querySelector('#taskStatusConfirmIcon'),
  taskStatusConfirmTitle: document.querySelector('#taskStatusConfirmTitle'),
  taskStatusConfirmText: document.querySelector('#taskStatusConfirmText'),
  taskStatusConfirmButton: document.querySelector('#taskStatusConfirmButton'),
  pauseReasonField: document.querySelector('#pauseReasonField'),
  pauseReasonInput: document.querySelector('#pauseReasonInput'),
  pauseReasonError: document.querySelector('#pauseReasonError'),
  helpRequestInput: document.querySelector('#helpRequestInput'),
  helpRequestError: document.querySelector('#helpRequestError'),
  shiftCameraTitle: document.querySelector('#shiftCameraTitle'),
  shiftCameraText: document.querySelector('#shiftCameraText'),
  shiftCameraVideo: document.querySelector('#shiftCameraVideo'),
  shiftCameraCanvas: document.querySelector('#shiftCameraCanvas'),
  shiftCameraPreview: document.querySelector('#shiftCameraPreview'),
  shiftCameraState: document.querySelector('#shiftCameraState'),
  shiftCameraError: document.querySelector('#shiftCameraError'),
  shiftCameraCancelButton: document.querySelector('#shiftCameraCancelButton'),
  shiftCameraRetakeButton: document.querySelector('#shiftCameraRetakeButton'),
  shiftCameraCaptureButton: document.querySelector('#shiftCameraCaptureButton'),
  shiftCameraConfirmButton: document.querySelector('#shiftCameraConfirmButton'),
  shiftCameraFlipButton: document.querySelector('#shiftCameraFlipButton'),
  afterPhotoPlaceholder: document.querySelector('#afterPhotoPlaceholder'),
  afterPhotoResult: document.getElementById(`afterPhoto${String.fromCharCode(77, 111, 99, 107)}`),
  sendToManagerButton: document.querySelector('#sendToManagerButton'),
  currentStepScaleTitle: document.querySelector('#currentStepScaleTitle'),
  currentStepScaleText: document.querySelector('#currentStepScaleText'),
  currentStepTitle: document.querySelector('#currentStepTitle'),
  currentStepDescription: document.querySelector('#currentStepDescription'),
  stagePhotoTitle: document.querySelector('#stagePhotoTitle'),
  stagePhotoText: document.querySelector('#stagePhotoText'),
  stepScale: document.querySelector('.stepScale'),
  stepScaleDots: Array.from(document.querySelectorAll('.stepScale span')),
  stepRows: [
    document.querySelector('#stepsList article'),
    document.querySelector('#stepCableRow'),
    document.querySelector('#stepMarkingRow'),
    document.querySelector('#stepConnectRow'),
    document.querySelector('#stepTestRow'),
  ],
  workerObjectsList: document.querySelector('#workerObjectsList'),
  historyList: document.querySelector('#historyList'),
  historyMoreButton: document.querySelector('#historyMoreButton'),
  taskDescription: document.querySelector('#taskDescription'),
  taskAssignee: document.querySelector('#taskAssignee'),
  taskPhotos: document.querySelector('#taskPhotos'),
};

const photoSlider = new PhotoSlider({
  loadPhoto: async (id) => {
    const response = await apiFetch(`/api/v1/artifacts/${id}`);
    if (!response.ok) throw new Error('Photo is unavailable');
    return response.blob();
  },
  viewer: {
    root: document.querySelector('#photoViewer'),
    image: document.querySelector('#photoViewerImage'),
  },
  onLockedAttempt: notifyTaskLocked,
});

const views = {
  myWork: document.querySelector('#myWorkView'),
  taskChoice: document.querySelector('#taskChoiceView'),
  taskDetail: document.querySelector('#taskDetailView'),
  currentStep: document.querySelector('#currentStepView'),
  stagePhoto: document.querySelector('#stagePhotoView'),
  resultConfirmation: document.querySelector('#resultConfirmationView'),
  workSent: document.querySelector('#workSentView'),
  history: document.querySelector('#historyView'),
};

const modals = {
  startShift: document.querySelector('#startShiftModal'),
  finishShift: document.querySelector('#finishShiftModal'),
  shiftCamera: document.querySelector('#shiftCameraModal'),
  taskStatusConfirm: document.querySelector('#taskStatusConfirmModal'),
  helpRequest: document.querySelector('#helpRequestModal'),
};

let modalCloseTimer;

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await login();
});
elements.historyMoreButton.addEventListener('click', () => loadHistory(false));

document.addEventListener('click', async (event) => {
  const viewButton = event.target.closest('[data-open-view]');
  const modalButton = event.target.closest('[data-open-modal]');
  const closeButton = event.target.closest('[data-close-modal]');
  const completeStepButton = event.target.closest('[data-complete-step]');
  const takeStagePhotoButton = event.target.closest('[data-take-stage-photo]');
  const addAfterPhotoButton = event.target.closest('[data-add-after-photo]');
  const sendToManagerButton = event.target.closest('[data-send-to-manager]');
  const returnToTaskReviewButton = event.target.closest('[data-return-to-task-review]');
  const taskStatusButton = event.target.closest('[data-task-status-control]');
  const confirmTaskStatusButton = event.target.closest('[data-confirm-task-status]');
  const cancelTaskStatusButton = event.target.closest('[data-cancel-task-status]');
  const sendHelpRequestButton = event.target.closest('[data-send-help-request]');
  const cancelHelpRequestButton = event.target.closest('[data-cancel-help-request]');
  const shiftActionButton = event.target.closest('[data-shift-action]');
  const confirmStartShiftButton = event.target.closest('[data-confirm-start-shift]');
  const confirmFinishShiftButton = event.target.closest('[data-confirm-finish-shift]');
  const captureCameraButton = event.target.closest('[data-capture-camera]');
  const retakeCameraButton = event.target.closest('[data-retake-camera]');
  const confirmCameraButton = event.target.closest('[data-confirm-camera]');
  const cancelCameraButton = event.target.closest('[data-cancel-camera]');
  const flipCameraButton = event.target.closest('[data-flip-camera]');
  const taskActionButton = event.target.closest('[data-worker-task-action]');
  const taskCard = event.target.closest('[data-worker-task-id]');
  const backToTasksButton = event.target.closest('[data-back-to-tasks]');
  const detailTaskAction = event.target.closest('[data-detail-task-action]');
  const detailStepAction = event.target.closest('[data-detail-step-action]');
  const uploadPhotoButton = event.target.closest('[data-upload-detail-photo]');
  const reloadTaskDetailButton = event.target.closest('[data-reload-task-detail]');
  if (reloadTaskDetailButton) {
    renderTaskDetailLoading();
    await reloadTaskDetails();
    return;
  }

  if (backToTasksButton) {
    openView('myWork', { preserveScroll: true });
    window.scrollTo({ top: taskListScrollY, behavior: 'instant' });
    return;
  }

  if (detailTaskAction) {
    await runDetailAction('task', detailTaskAction.dataset.detailTaskAction, selectedTaskId);
    return;
  }

  if (detailStepAction) {
    await runDetailAction(
      'step',
      detailStepAction.dataset.detailStepAction,
      detailStepAction.dataset.stepId,
    );
    return;
  }

  if (uploadPhotoButton) {
    openDetailPhotoPicker(uploadPhotoButton.dataset.stepId || null);
    return;
  }

  if (taskActionButton) {
    if (isTaskAccessLocked()) return notifyTaskLocked();
    await runWorkerTaskAction(
      taskActionButton.dataset.workerTaskAction,
      taskActionButton.dataset.taskId,
    );
    return;
  }

  if (taskCard && !event.target.closest('[data-photo-slider]')) {
    if (isTaskAccessLocked()) return notifyTaskLocked();
    await openTaskDetails(taskCard.dataset.workerTaskId);
    return;
  }

  if (viewButton) {
    openView(viewButton.dataset.openView);
  }

  if (taskStatusButton) {
    requestTaskStatusChange();
  }

  if (shiftActionButton) {
    openModal(isShiftOpen() ? 'finishShift' : 'startShift');
  }

  if (modalButton) {
    openModal(modalButton.dataset.openModal);
  }

  if (closeButton) {
    closeModal();
  }

  if (cancelTaskStatusButton) {
    closeModal();
  }

  if (cancelHelpRequestButton) {
    closeModal();
  }

  if (confirmStartShiftButton) {
    scheduleShiftCamera('START', confirmStartShiftButton);
  }

  if (confirmFinishShiftButton) {
    scheduleShiftCamera('FINISH', confirmFinishShiftButton);
  }

  if (captureCameraButton) {
    void captureCameraPhoto();
  }

  if (retakeCameraButton) {
    void retakeCameraPhoto();
  }

  if (confirmCameraButton) {
    void submitCameraPhoto();
  }

  if (cancelCameraButton) {
    cancelCameraAttempt();
  }

  if (flipCameraButton) {
    await flipCamera();
  }

  if (confirmTaskStatusButton) {
    if (confirmTaskStatusButton.disabled) {
      return;
    }

    if (!confirmTaskStatusChange()) {
      return;
    }

    confirmTaskStatusButton.disabled = true;
    closeModal();
  }

  if (completeStepButton) {
    openView('stagePhoto');
  }

  if (takeStagePhotoButton) {
    completeCurrentStepAfterPhoto();
  }

  if (addAfterPhotoButton) {
    addAfterPhoto();
  }

  if (sendToManagerButton) {
    sendToManager();
  }

  if (returnToTaskReviewButton) {
    openView('taskDetail');
  }

  if (sendHelpRequestButton) {
    sendHelpRequest();
  }
});

document.addEventListener('keydown', async (event) => {
  if (!['Enter', ' '].includes(event.key)) return;
  const taskCard = event.target.closest('[data-worker-task-id]');
  if (!taskCard) return;
  event.preventDefault();
  if (isTaskAccessLocked()) return notifyTaskLocked();
  await openTaskDetails(taskCard.dataset.workerTaskId);
});

elements.pauseReasonInput.addEventListener('input', () => {
  elements.pauseReasonError.hidden = true;
});

elements.helpRequestInput.addEventListener('input', () => {
  elements.helpRequestError.hidden = true;
});

window.addEventListener('beforeunload', stopCameraStream);

clearLegacyShiftStorage();

if (accessToken) {
  void restoreSession();
}

async function login() {
  const loginValue = elements.emailInput.value.trim().toLowerCase();
  const passwordValue = elements.passwordInput.value;
  let response;

  try {
    response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: loginValue || workerEmail,
        password: passwordValue,
      }),
    });
  } catch {
    clearAuthToken();
    showMessage('Backend недоступен. Проверьте соединение и повторите попытку.');
    return;
  }

  const body = await readResponseBody(response);

  if (!response.ok || typeof body?.accessToken !== 'string') {
    clearAuthToken();
    showMessage('Неверный логин или пароль');
    return;
  }

  accessToken = body.accessToken;
  currentUser = body.user ?? null;
  sessionStorage.setItem(authTokenStorageKey, accessToken);
  elements.passwordInput.value = '';
  await showWorkspace();
}

async function restoreSession() {
  await showWorkspace();
}

async function showWorkspace() {
  if (!accessToken) {
    return false;
  }

  const isSynced = await refreshShiftState();

  if (!isSynced) {
    return false;
  }

  elements.userInfo.textContent = currentUser?.name ?? 'Илья Н.';
  elements.loginScreen.hidden = true;
  elements.loginScreen.classList.remove('is-active');
  elements.workspaceScreen.hidden = false;
  renderTask();
  await loadWorkerObjects();
  openView('myWork');
  return true;
}

function openView(name, options = {}) {
  const taskFlowViews = [
    'taskDetail',
    'currentStep',
    'stagePhoto',
    'resultConfirmation',
    'workSent',
  ];

  if (name === 'currentStep') {
    renderCurrentStep();
  }

  if (name === 'stagePhoto') {
    renderStagePhoto();
  }
  if (name === 'history') void loadHistory(true);

  for (const [viewName, view] of Object.entries(views)) {
    view.classList.toggle('is-active', viewName === name);
  }

  elements.workspaceScreen.classList.toggle('is-task-flow', taskFlowViews.includes(name));
  resetCarousels(views[name]);
  closeModal();
  if (!options.preserveScroll) window.scrollTo({ top: 0, behavior: 'instant' });
}

function openModal(name) {
  window.clearTimeout(modalCloseTimer);
  document.body.classList.add('is-modal-open');
  elements.modalLayer.classList.remove('is-closing');
  elements.modalLayer.classList.toggle('is-task-status-modal', name === 'taskStatusConfirm');
  elements.modalLayer.classList.toggle('is-camera-modal', name === 'shiftCamera');
  elements.helpRequestInput.value = '';
  elements.helpRequestError.hidden = true;

  for (const [modalName, modal] of Object.entries(modals)) {
    modal.classList.toggle('is-active', modalName === name);
    modal.classList.remove('is-closing');
  }

  elements.modalLayer.hidden = false;
}

function closeModal() {
  if (elements.modalLayer.hidden) {
    return;
  }

  const cameraWasActive = modals.shiftCamera.classList.contains('is-active');

  window.clearTimeout(modalCloseTimer);
  elements.modalLayer.classList.add('is-closing');

  for (const modal of Object.values(modals)) {
    modal.classList.toggle('is-closing', modal.classList.contains('is-active'));
  }

  modalCloseTimer = window.setTimeout(() => {
    elements.modalLayer.hidden = true;
    document.body.classList.remove('is-modal-open');
    elements.modalLayer.classList.remove('is-closing', 'is-task-status-modal', 'is-camera-modal');

    for (const modal of Object.values(modals)) {
      modal.classList.remove('is-active', 'is-closing');
    }
  }, 190);

  if (cameraWasActive) {
    cleanupCameraAttempt({ keepOperationId: false });
  }
}

function isShiftOpen() {
  return currentShift?.status === 'ACTIVE';
}

function isTaskAccessLocked() {
  return !shiftStateResolved || !isShiftOpen();
}

function notifyTaskLocked() {
  const now = Date.now();
  if (now - lastTaskLockedMessageAt < 1_200) return;
  lastTaskLockedMessageAt = now;
  showMessage('Откройте смену, чтобы перейти к задаче');
}

function applyTaskAccessState() {
  const locked = isTaskAccessLocked();
  photoSlider.setLocked(elements.workerObjectsList, locked);
  for (const card of elements.workerObjectsList.querySelectorAll('[data-worker-task-id]')) {
    card.classList.toggle('is-task-locked', locked);
    card.setAttribute('aria-disabled', String(locked));
    card.setAttribute(
      'aria-label',
      locked
        ? `${card.querySelector('h3')?.textContent ?? 'Задача'}. Задача заблокирована до открытия смены`
        : (card.querySelector('h3')?.textContent ?? 'Открыть задачу'),
    );
    card.setAttribute('role', locked ? 'group' : 'button');
    card.tabIndex = locked ? -1 : 0;
  }
  if (locked) {
    photoSlider.close();
    if (elements.workspaceScreen.classList.contains('is-task-flow')) {
      selectedTaskId = null;
      selectedTask = null;
      openView('myWork', { preserveScroll: true });
    }
  }
}

function renderShiftState() {
  const isOpen = isShiftOpen();
  const status = workerSummary?.shift?.status ?? 'NOT_STARTED';
  elements.workerShiftStatus.textContent = status === 'ACTIVE' ? 'Работает' : 'Отдыхает';
  elements.startWorkButton.textContent = isOpen ? 'ЗАКОНЧИТЬ РАБОТУ' : 'НАЧАТЬ РАБОТУ';
  elements.startWorkButton.classList.toggle('is-working', isOpen);
  const approved = workerSummary?.coins?.approvedBalanceCoinUnits ?? 0;
  const pending = workerSummary?.coins?.pendingCoinUnits ?? 0;
  elements.approvedCoinAmount.textContent = '0,00';
  elements.approvedCoinAmount.classList.toggle('is-live', isOpen);
  elements.pendingCoinAmount.textContent = formatCoinUnits(pending);
  elements.totalCoinBalance.textContent = formatApprovedCoinUnits(approved);
  if (isOpen) startCoinTicker();
  else stopCoinTicker();
  applyTaskAccessState();
}

async function refreshShiftState() {
  try {
    const response = await apiFetch('/api/v1/worker/summary');
    const body = await readResponseBody(response);

    if (!response.ok) {
      shiftStateResolved = false;
      currentShift = null;
      applyTaskAccessState();
      await handleApiFailure(response.status, body, {
        fallbackMessage: 'Не удалось получить состояние смены.',
      });
      return false;
    }

    workerSummary = body;
    currentShift = body?.shift?.status === 'ACTIVE' ? body.shift : null;
    shiftStateResolved = true;
    renderShiftState();
    return true;
  } catch {
    shiftStateResolved = false;
    currentShift = null;
    applyTaskAccessState();
    showMessage('Backend недоступен. Проверьте соединение и повторите попытку.');
    return false;
  }
}

function startCoinTicker() {
  stopCoinTicker();
  renderOnlineCoins();
  coinTicker = window.setInterval(renderOnlineCoins, 1_000);
}

function stopCoinTicker() {
  if (coinTicker !== null) window.clearInterval(coinTicker);
  coinTicker = null;
  elements.approvedCoinAmount.textContent = '0,00';
  elements.approvedCoinAmount.classList.remove('is-live');
}

function renderOnlineCoins() {
  if (!currentShift?.startedAt || !workerSummary?.policy) return stopCoinTicker();
  const durationSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(currentShift.startedAt).getTime()) / 1_000),
  );
  const units = Math.min(
    durationSeconds * workerSummary.policy.coinUnitsPerSecond,
    workerSummary.policy.dailyStandardLimitCoinUnits,
  );
  elements.approvedCoinAmount.textContent = formatCoinUnits(units);
  elements.approvedCoinAmount.classList.add('is-live');
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && accessToken) void refreshShiftState();
});

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers ?? {});

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  return response;
}

async function loadWorkerObjects() {
  elements.workerObjectsList.innerHTML = '<p>Загружаем задачи…</p>';
  try {
    const response = await apiFetch('/api/v1/worker/objects');
    const groups = await readResponseBody(response);
    if (!response.ok) throw new Error(getApiMessage(groups));
    const total = groups.reduce((sum, group) => sum + group.tasks.length, 0);
    if (total === 0) {
      elements.workerObjectsList.innerHTML =
        '<div class="emptyObject"><p>У вас пока нет назначенных задач</p></div>';
      return;
    }
    elements.workerObjectsList.innerHTML = groups
      .flatMap((group) => group.tasks.map((task) => renderTaskCard(task, group.object)))
      .join('');
    photoSlider.mount(elements.workerObjectsList);
    applyTaskAccessState();
  } catch {
    elements.workerObjectsList.innerHTML =
      '<div class="emptyObject"><p>Не удалось загрузить задачи. Повторить</p><button class="secondaryButton" type="button" data-reload-worker-tasks>Повторить</button></div>';
    elements.workerObjectsList
      .querySelector('[data-reload-worker-tasks]')
      ?.addEventListener('click', loadWorkerObjects);
  }
}

function renderTaskCard(task, object) {
  const completed = task.steps.filter((step) => step.status === 'COMPLETED').length;
  const percent = task.steps.length ? Math.round((completed / task.steps.length) * 100) : 0;
  const gallery = PhotoSlider.render(task.photos, {
    id: `task-list-${task.id}`,
    emptyText: 'Фотографий пока нет',
    locked: isTaskAccessLocked(),
  });
  const location = task.location || object.name;
  return `<article class="taskCard taskFeedCard ${taskCardStatusClass(task.status)}" data-worker-task-id="${task.id}" role="button" tabindex="0"><div class="taskFeedCardHeader"><h3>${escapeHtml(task.title)}</h3></div>${gallery}<p class="taskLocation">${escapeHtml(location)}</p><div class="taskProgressBlock"><div class="taskProgressLine"><span><i style="width:${percent}%"></i></span><b>${percent}%</b></div><small>${completed} из ${task.steps.length} этапов выполнено</small></div></article>`;
}

function taskCardStatusClass(status) {
  return (
    {
      ASSIGNED: 'is-ready',
      ACCEPTED: 'is-accepted',
      IN_PROGRESS: 'is-working',
      ON_REVIEW: 'is-review',
      COMPLETED: 'is-accepted',
      CANCELLED: 'is-paused',
    }[status] ?? ''
  );
}

async function runWorkerTaskAction(action, taskId) {
  if (isTaskAccessLocked()) return notifyTaskLocked();
  const endpoint = action === 'accept' ? 'accept' : 'start';
  const response = await apiFetch(`/api/v1/tasks/${taskId}/${endpoint}`, { method: 'PATCH' });
  const body = await readResponseBody(response);
  if (!response.ok) return showMessage(getApiMessage(body) || 'Не удалось изменить задачу');
  await loadWorkerObjects();
  showMessage(action === 'accept' ? 'Задача принята' : 'Задача начата');
}

async function openTaskDetails(taskId) {
  if (isTaskAccessLocked()) return notifyTaskLocked();
  selectedTaskId = taskId;
  selectedTask = null;
  taskListScrollY = window.scrollY;
  renderTaskDetailLoading();
  openView('taskDetail');
  await reloadTaskDetails();
}

async function reloadTaskDetails() {
  if (isTaskAccessLocked()) {
    openView('myWork', { preserveScroll: true });
    return notifyTaskLocked();
  }
  if (!selectedTaskId) return;
  try {
    const response = await apiFetch(`/api/v1/worker/tasks/${selectedTaskId}`);
    const body = await readResponseBody(response);
    if (!response.ok) {
      renderTaskDetailError(
        response.status === 404
          ? 'Задача не найдена или недоступна.'
          : getApiMessage(body) || 'Не удалось загрузить задачу.',
      );
      return;
    }
    selectedTask = body;
    renderSelectedTask();
    await hydrateDetailPhotos();
  } catch {
    renderTaskDetailError('Не удалось загрузить задачу. Проверьте соединение и повторите попытку.');
  }
}

function renderTaskDetailLoading() {
  elements.taskTitle.textContent = 'Загружаем задачу…';
  elements.taskObject.textContent = '';
  elements.taskDescription.textContent = '';
  elements.taskAssignee.textContent = '';
  elements.taskPhotos.innerHTML = '<p>Загружаем фотографии…</p>';
  elements.stepsList.innerHTML = '<p>Загружаем этапы…</p>';
}

function renderTaskDetailError(message) {
  elements.taskTitle.textContent = 'Задача недоступна';
  elements.taskObject.textContent = '';
  elements.taskDescription.textContent = message;
  elements.taskAssignee.textContent = '';
  elements.taskPhotos.innerHTML = '<p>Фотографий нет</p>';
  elements.stepsList.innerHTML =
    '<button class="secondaryButton" type="button" data-reload-task-detail>Повторить</button>';
}

function renderSelectedTask() {
  if (!selectedTask) return;
  photoSlider.clear(views.taskDetail);
  elements.taskTitle.textContent = selectedTask.title;
  elements.taskObject.textContent = selectedTask.object?.name ?? 'Объект не указан';
  elements.taskDescription.textContent = selectedTask.description || 'Описание не указано';
  elements.taskAssignee.textContent = `Исполнитель: ${selectedTask.assignee?.name ?? 'не назначен'}`;
  elements.taskMeta.hidden = false;
  elements.taskMeta.textContent = taskStatusLabel(selectedTask.status);
  renderSelectedTaskControl();
  elements.taskPhotos.innerHTML = PhotoSlider.render(selectedTask.photos, {
    id: `task-${selectedTask.id}`,
    emptyText: 'У задачи пока нет фотографий',
  });
  elements.stepsList.innerHTML = selectedTask.steps.length
    ? selectedTask.steps.map(renderTaskStep).join('')
    : '<div class="emptyObject"><p>У задачи нет этапов</p></div>';
}

function renderSelectedTaskControl() {
  const control = views.taskDetail.querySelector('[data-task-status-control]');
  const action =
    selectedTask.status === 'ASSIGNED'
      ? 'accept'
      : selectedTask.status === 'ACCEPTED'
        ? 'start'
        : selectedTask.status === 'IN_PROGRESS'
          ? 'complete'
          : null;
  control.disabled = taskDetailActionPending || !action;
  control.dataset.detailTaskAction = action ?? '';
  control.querySelector('b').textContent = action
    ? { accept: 'Принять задачу', start: 'Начать задачу', complete: 'Завершить задачу' }[action]
    : taskStatusLabel(selectedTask.status);
  control.querySelector('small').textContent = action
    ? 'Действие будет сохранено в истории.'
    : 'Для текущего статуса действий нет.';
}

function renderTaskStep(step, index) {
  const taskAllowsStepActions = selectedTask.status === 'IN_PROGRESS';
  const action = taskAllowsStepActions
    ? step.status === 'CREATED' || step.status === 'REOPENED'
      ? 'start'
      : step.status === 'IN_PROGRESS'
        ? 'complete'
        : null
    : null;
  const actionLabel = action === 'start' ? 'Начать этап' : 'Завершить этап';
  const photos = PhotoSlider.render(step.photos, {
    id: `step-${step.id}`,
    emptyText: 'Фотографий этапа нет',
  });
  if (action || step.status === 'IN_PROGRESS') {
    return `<article class="stepTimelineCurrent is-current"><span class="stepNumber">${index + 1}</span><div class="currentStepBubble"><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.description || 'Описание не указано')}</p><em>${taskStepStatusLabel(step.status)}</em>${photos}${action ? `<button type="button" data-detail-step-action="${action}" data-step-id="${step.id}" ${taskDetailActionPending ? 'disabled' : ''}>${actionLabel}</button>` : ''}${step.status === 'IN_PROGRESS' ? `<button class="linkButton" type="button" data-upload-detail-photo data-step-id="${step.id}" ${taskDetailActionPending ? 'disabled' : ''}>Добавить фото</button>` : ''}</div></article>`;
  }
  return `<article class="stepTimelineFuture ${step.status === 'COMPLETED' ? 'is-complete' : ''}"><span class="${step.status === 'COMPLETED' ? 'stepCompleteMark' : 'stageLock'}" aria-hidden="true">${step.status === 'COMPLETED' ? '✓' : ''}</span><div><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.description || 'Описание не указано')}</p>${photos}</div><em>${taskStepStatusLabel(step.status)}</em><i aria-hidden="true">›</i></article>`;
}

async function hydrateDetailPhotos() {
  photoSlider.mount(views.taskDetail);
}

async function runDetailAction(kind, action, id) {
  if (isTaskAccessLocked()) return notifyTaskLocked();
  if (taskDetailActionPending || !action || !id) return;
  taskDetailActionPending = true;
  renderSelectedTaskControl();
  try {
    const base = kind === 'task' ? `/api/v1/tasks/${id}` : `/api/v1/task-steps/${id}`;
    const response = await apiFetch(`${base}/${action}`, { method: 'PATCH' });
    const body = await readResponseBody(response);
    if (!response.ok) return showMessage(getApiMessage(body) || 'Действие сейчас недоступно.');
    await Promise.all([reloadTaskDetails(), loadWorkerObjects(), loadHistory(true)]);
    showMessage('Статус обновлён');
  } catch {
    showMessage('Не удалось выполнить действие. Проверьте соединение и повторите попытку.');
  } finally {
    taskDetailActionPending = false;
    if (selectedTask) renderSelectedTaskControl();
  }
}

function openDetailPhotoPicker(stepId) {
  if (isTaskAccessLocked()) return notifyTaskLocked();
  if (taskDetailActionPending || !selectedTaskId) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/webp';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    taskDetailActionPending = true;
    const form = new FormData();
    form.append('file', file);
    form.append('taskId', selectedTaskId);
    if (stepId) form.append('taskStepId', stepId);
    try {
      const response = await apiFetch('/api/v1/artifacts/photos', { method: 'POST', body: form });
      const body = await readResponseBody(response);
      if (!response.ok) return showMessage(getApiMessage(body) || 'Не удалось загрузить фото.');
      await Promise.all([reloadTaskDetails(), loadHistory(true)]);
      showMessage('Фото добавлено');
    } catch {
      showMessage('Не удалось загрузить фото. Проверьте соединение и повторите попытку.');
    } finally {
      taskDetailActionPending = false;
    }
  });
  input.click();
}

function taskStepStatusLabel(status) {
  return (
    { CREATED: 'Ожидает', IN_PROGRESS: 'В работе', COMPLETED: 'Выполнен', CANCELLED: 'Отменён' }[
      status
    ] ?? status
  );
}

async function loadHistory(reset) {
  if (reset) {
    historyCursor = null;
    elements.historyList.innerHTML = '<p>Загружаем историю…</p>';
  }
  try {
    const url = `/api/v1/history?limit=20${historyCursor ? `&cursor=${encodeURIComponent(historyCursor)}` : ''}`;
    const response = await apiFetch(url);
    const body = await readResponseBody(response);
    if (!response.ok) throw new Error();
    if (reset && body.items.length === 0)
      elements.historyList.innerHTML =
        '<div class="emptyObject"><p>История действий пока пуста</p></div>';
    else renderHistoryItems(body.items, reset);
    historyCursor = body.nextCursor;
    elements.historyMoreButton.hidden = !body.hasMore;
  } catch {
    elements.historyList.innerHTML =
      '<div class="emptyObject"><p>Не удалось загрузить историю. Повторить</p></div>';
  }
}

function renderHistoryItems(items, reset) {
  const groups = new Map();
  for (const item of items) {
    const key = new Date(item.createdAt).toLocaleDateString('ru-RU');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const html = [...groups.entries()]
    .map(
      ([date, events]) =>
        `<section class="objectBlock"><h2>${historyDateLabel(events[0].createdAt, date)}</h2>${events.map(renderHistoryEvent).join('')}</section>`,
    )
    .join('');
  if (reset) elements.historyList.innerHTML = html;
  else elements.historyList.insertAdjacentHTML('beforeend', html);
  photoSlider.mount(elements.historyList);
}

function renderHistoryEvent(event) {
  const metadata = event.metadata ?? {};
  const description =
    metadata.stepTitle ?? metadata.taskTitle ?? metadata.objectName ?? 'Действие сотрудника';
  const photos = PhotoSlider.render(event.artifacts, {
    id: `history-${event.id}`,
    showEmpty: false,
  });
  const time = new Date(event.createdAt).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `<article class="taskCard historyEventCard"><h3>${eventLabel(event.type)}</h3><p class="taskSummary">${escapeHtml(description)}</p>${photos}<time datetime="${event.createdAt}">${time}</time>${metadata.objectName ? `<p>${escapeHtml(metadata.objectName)}</p>` : ''}${metadata.taskTitle ? `<p>«${escapeHtml(metadata.taskTitle)}»</p>` : ''}${metadata.stepTitle ? `<p>Этап: ${escapeHtml(metadata.stepTitle)}</p>` : ''}</article>`;
}

function historyDateLabel(value, fallback) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return `Сегодня, ${fallback}`;
  if (date.toDateString() === yesterday.toDateString()) return `Вчера, ${fallback}`;
  return fallback;
}

function eventLabel(type) {
  return (
    {
      WORK_SHIFT_STARTED: 'Открыл смену',
      WORK_SHIFT_FINISHED: 'Закрыл смену',
      TASK_ACCEPTED: 'Принял задачу',
      TASK_STARTED: 'Начал задачу',
      TASK_COMPLETED: 'Завершил задачу',
      STEP_STARTED: 'Начал этап',
      STEP_COMPLETED: 'Завершил этап',
      PHOTO_UPLOADED: 'Добавил фотографию',
    }[type] ?? 'Выполнил действие'
  );
}

function taskStatusLabel(status) {
  return (
    { IN_PROGRESS: 'В работе', ACCEPTED: 'Принята', ON_REVIEW: 'На проверке' }[status] ?? status
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function readResponseBody(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function getApiMessage(body) {
  if (typeof body?.message === 'string') {
    return body.message;
  }

  if (Array.isArray(body?.message)) {
    return body.message.join('. ');
  }

  if (typeof body?.error === 'string') {
    return body.error;
  }

  return null;
}

async function handleApiFailure(status, body, options = {}) {
  if (status === 401) {
    handleUnauthorized();
    return;
  }

  if (status === 403) {
    showCameraOrToastError('Недостаточно прав для выполнения действия.');
    return;
  }

  if (status === 409) {
    showCameraOrToastError(getApiMessage(body) ?? 'Состояние смены изменилось.');
    await refreshShiftState();
    return;
  }

  if (status === 400) {
    showCameraOrToastError('Некорректные данные или фотография.');
    return;
  }

  showCameraOrToastError(
    options.fallbackMessage ??
      'Не удалось сохранить фотографию. Проверьте соединение и повторите попытку.',
  );
}

function handleUnauthorized() {
  clearAuthToken();
  stopCameraStream();
  cleanupCameraAttempt({ keepOperationId: false });
  closeModal();
  currentUser = null;
  currentShift = null;
  shiftStateResolved = false;
  elements.workspaceScreen.hidden = true;
  elements.loginScreen.hidden = false;
  elements.loginScreen.classList.add('is-active');
  showMessage('Сессия истекла. Войдите снова.');
}

function clearAuthToken() {
  accessToken = null;
  sessionStorage.removeItem(authTokenStorageKey);
}

function clearLegacyShiftStorage() {
  localStorage.removeItem(legacyShiftStorageKey);
  localStorage.removeItem(legacyShiftStateStorageKey);
}

function showCameraOrToastError(message) {
  if (modals.shiftCamera.classList.contains('is-active')) {
    setCameraError(message);
    return;
  }

  showMessage(message);
}

function scheduleShiftCamera(mode, button) {
  if (pendingCameraMode || cameraAttempt.operationId) {
    return;
  }

  pendingCameraMode = mode;
  button.disabled = true;
  closeModal();
  window.setTimeout(() => {
    button.disabled = false;
    openShiftCamera(mode);
  }, 210);
}

async function openShiftCamera(mode) {
  pendingCameraMode = null;
  cleanupCameraAttempt({ keepOperationId: false });
  cameraAttempt = {
    mode,
    operationId: crypto.randomUUID(),
    stream: null,
    blob: null,
    previewUrl: null,
    isSubmitting: false,
    facingMode: 'environment',
    cameraCount: 0,
  };

  elements.shiftCameraTitle.textContent =
    mode === 'START' ? 'Фото перед началом смены' : 'Фото перед завершением смены';
  elements.shiftCameraText.textContent =
    mode === 'START'
      ? 'Расположите лицо в кадре и сделайте фотографию.'
      : 'Сделайте фотографию для подтверждения завершения смены.';

  resetCameraUi();
  openModal('shiftCamera');
  await startCameraStream();
}

async function startCameraStream(facingMode = cameraAttempt.facingMode || 'environment') {
  stopCameraStream();
  setCameraLoading('Открываем камеру...');
  elements.shiftCameraCaptureButton.disabled = true;

  if (!navigator.mediaDevices?.getUserMedia) {
    setCameraError('Камера недоступна на этом устройстве или в этом браузере.');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
      },
      audio: false,
    });

    cameraAttempt.stream = stream;
    cameraAttempt.facingMode = facingMode;
    elements.shiftCameraVideo.srcObject = stream;
    elements.shiftCameraVideo.classList.toggle('is-front-camera', facingMode === 'user');
    elements.shiftCameraVideo.hidden = false;
    elements.shiftCameraPreview.hidden = true;
    elements.shiftCameraState.hidden = true;
    elements.shiftCameraCaptureButton.disabled = false;
    await elements.shiftCameraVideo.play();
    try {
      const devices = await navigator.mediaDevices.enumerateDevices?.();
      cameraAttempt.cameraCount = devices ? CameraUtils.countVideoInputs(devices) : 1;
    } catch {
      cameraAttempt.cameraCount = 1;
    }
    elements.shiftCameraFlipButton.hidden = cameraAttempt.cameraCount < 2;
    return true;
  } catch {
    setCameraError(
      'Не удалось получить доступ к камере. Разрешите использование камеры в настройках браузера и повторите попытку.',
    );
    return false;
  }
}

async function flipCamera() {
  if (cameraAttempt.isSubmitting || cameraAttempt.cameraCount < 2) return;
  const previousMode = cameraAttempt.facingMode;
  const nextMode = CameraUtils.nextFacingMode(previousMode);
  elements.shiftCameraFlipButton.disabled = true;
  const switched = await startCameraStream(nextMode);
  if (!switched) await startCameraStream(previousMode);
  elements.shiftCameraFlipButton.disabled = false;
}

async function captureCameraPhoto() {
  if (!cameraAttempt.stream || cameraAttempt.isSubmitting) {
    return;
  }

  const video = elements.shiftCameraVideo;
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!width || !height) {
    setCameraError('Камера ещё не готова. Повторите попытку.');
    return;
  }

  const canvas = elements.shiftCameraCanvas;
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(video, 0, 0, width, height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));

  if (!blob) {
    setCameraError('Не удалось сделать фотографию. Повторите попытку.');
    return;
  }

  clearCameraPreview();
  cameraAttempt.blob = blob;
  cameraAttempt.previewUrl = URL.createObjectURL(blob);
  elements.shiftCameraPreview.src = cameraAttempt.previewUrl;
  elements.shiftCameraPreview.hidden = false;
  elements.shiftCameraVideo.hidden = true;
  elements.shiftCameraState.hidden = true;
  elements.shiftCameraCaptureButton.hidden = true;
  elements.shiftCameraFlipButton.hidden = true;
  elements.shiftCameraRetakeButton.hidden = false;
  elements.shiftCameraConfirmButton.hidden = false;
  elements.shiftCameraConfirmButton.disabled = false;
  elements.shiftCameraError.hidden = true;
  stopCameraStream();
}

async function retakeCameraPhoto() {
  if (cameraAttempt.isSubmitting) {
    return;
  }

  clearCameraPreview();
  cameraAttempt.blob = null;
  elements.shiftCameraPreview.hidden = true;
  elements.shiftCameraCaptureButton.hidden = false;
  elements.shiftCameraRetakeButton.hidden = true;
  elements.shiftCameraConfirmButton.hidden = true;
  elements.shiftCameraConfirmButton.disabled = true;
  elements.shiftCameraFlipButton.hidden = cameraAttempt.cameraCount < 2;
  await startCameraStream();
}

async function submitCameraPhoto() {
  if (!cameraAttempt.blob || !cameraAttempt.operationId || cameraAttempt.isSubmitting) {
    return;
  }

  cameraAttempt.isSubmitting = true;
  setCameraLoading('Сохраняем фотографию...');
  elements.shiftCameraConfirmButton.disabled = true;
  elements.shiftCameraRetakeButton.disabled = true;
  elements.shiftCameraCancelButton.disabled = true;

  const formData = new FormData();
  formData.append(
    'file',
    new File([cameraAttempt.blob], `${cameraAttempt.mode.toLowerCase()}-shift-photo.jpg`, {
      type: 'image/jpeg',
    }),
  );
  formData.append('capturedAt', new Date().toISOString());
  formData.append('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  formData.append('operationId', cameraAttempt.operationId);

  try {
    const endpoint =
      cameraAttempt.mode === 'START'
        ? '/api/v1/work-shifts/start-with-photo'
        : '/api/v1/work-shifts/finish-with-photo';
    const response = await apiFetch(endpoint, {
      method: 'POST',
      body: formData,
    });
    const body = await readResponseBody(response);

    if (!response.ok) {
      cameraAttempt.isSubmitting = false;
      elements.shiftCameraConfirmButton.disabled = false;
      elements.shiftCameraRetakeButton.disabled = false;
      elements.shiftCameraCancelButton.disabled = false;
      await handleApiFailure(response.status, body);
      return;
    }

    cleanupCameraAttempt({ keepOperationId: false });
    closeModal();
    await refreshShiftState();
  } catch {
    cameraAttempt.isSubmitting = false;
    elements.shiftCameraConfirmButton.disabled = false;
    elements.shiftCameraRetakeButton.disabled = false;
    elements.shiftCameraCancelButton.disabled = false;
    setCameraError('Не удалось сохранить фотографию. Проверьте соединение и повторите попытку.');
  }
}

function cancelCameraAttempt() {
  cleanupCameraAttempt({ keepOperationId: false });
  closeModal();
}

function resetCameraUi() {
  clearCameraPreview();
  elements.shiftCameraVideo.hidden = false;
  elements.shiftCameraPreview.hidden = true;
  elements.shiftCameraState.hidden = false;
  elements.shiftCameraError.hidden = true;
  elements.shiftCameraCaptureButton.hidden = false;
  elements.shiftCameraCaptureButton.disabled = true;
  elements.shiftCameraRetakeButton.hidden = true;
  elements.shiftCameraRetakeButton.disabled = false;
  elements.shiftCameraConfirmButton.hidden = true;
  elements.shiftCameraConfirmButton.disabled = true;
  elements.shiftCameraCancelButton.disabled = false;
  elements.shiftCameraFlipButton.hidden = true;
}

function setCameraLoading(message) {
  elements.shiftCameraState.hidden = false;
  elements.shiftCameraState.textContent = message;
  elements.shiftCameraError.hidden = true;
}

function setCameraError(message) {
  elements.shiftCameraState.hidden = true;
  elements.shiftCameraError.textContent = message;
  elements.shiftCameraError.hidden = false;
}

function cleanupCameraAttempt({ keepOperationId }) {
  stopCameraStream();
  clearCameraPreview();

  if (!keepOperationId) {
    cameraAttempt.operationId = null;
  }

  cameraAttempt = {
    mode: keepOperationId ? cameraAttempt.mode : null,
    operationId: keepOperationId ? cameraAttempt.operationId : null,
    stream: null,
    blob: null,
    previewUrl: null,
    isSubmitting: false,
    facingMode: keepOperationId ? cameraAttempt.facingMode : 'environment',
    cameraCount: keepOperationId ? cameraAttempt.cameraCount : 0,
  };
}

function stopCameraStream() {
  CameraUtils.stopStream(cameraAttempt.stream);

  elements.shiftCameraVideo.pause();
  elements.shiftCameraVideo.srcObject = null;
  elements.shiftCameraVideo.classList.remove('is-front-camera');
  cameraAttempt.stream = null;
}

function clearCameraPreview() {
  if (cameraAttempt.previewUrl) {
    URL.revokeObjectURL(cameraAttempt.previewUrl);
  }

  cameraAttempt.previewUrl = null;
  cameraAttempt.blob = null;
  elements.shiftCameraPreview.removeAttribute('src');
  elements.shiftCameraCanvas.width = 0;
  elements.shiftCameraCanvas.height = 0;
}

function formatCoinUnits(units) {
  const safeUnits = Number.isSafeInteger(units) ? units : 0;
  const whole = Math.floor(safeUnits / 100);
  const fraction = String(safeUnits % 100).padStart(2, '0');
  return `${whole.toLocaleString('ru-RU').replace(/\u00a0/g, ' ')},${fraction}`;
}

function formatApprovedCoinUnits(units) {
  return Math.floor((Number.isSafeInteger(units) ? units : 0) / 100)
    .toLocaleString('ru-RU')
    .replace(/\u00a0/g, ' ');
}

function completeCurrentStepAfterPhoto() {
  if (taskFlowState.currentStep < steps.length - 1) {
    taskFlowState.currentStep += 1;
    renderTask();
    renderCurrentStep();
    showMessage('+25 опыта  +10');
    openView('currentStep');
    return;
  }

  taskFlowState.currentStep = steps.length;
  taskFlowState.afterPhotoAdded = true;
  renderTask();
  elements.afterPhotoPlaceholder.hidden = true;
  elements.afterPhotoResult.hidden = false;
  elements.sendToManagerButton.disabled = false;
  openView('resultConfirmation');
}

function addAfterPhoto() {
  taskFlowState.afterPhotoAdded = true;
  elements.afterPhotoPlaceholder.hidden = true;
  elements.afterPhotoResult.hidden = false;
  elements.sendToManagerButton.disabled = false;
}

function sendToManager() {
  if (!taskFlowState.afterPhotoAdded) {
    showMessage('Добавьте фото результата.');
    return;
  }

  taskFlowState.sentToManager = true;
  setTaskStatus('review');
  renderTask();
  openView('workSent');
}

function sendHelpRequest() {
  const message = elements.helpRequestInput.value.trim();

  if (!message) {
    elements.helpRequestError.hidden = false;
    elements.helpRequestInput.focus();
    return;
  }

  taskFlowState.helpRequests.push({
    user: 'Илья Н.',
    task: 'Подготовить основание стен для последующей обшивки ГКЛ.',
    createdAt: new Date().toISOString(),
    message,
  });
  closeModal();
  showMessage('Сообщение отправлено руководителю.');
}

function renderTask() {
  const progressStep = Math.min(taskFlowState.currentStep + 1, steps.length);
  const percent = Math.round((progressStep / steps.length) * 100);

  if (elements.taskProgressCount && elements.taskProgressLine && elements.taskProgressPercent) {
    elements.taskProgressCount.textContent = `${progressStep} / ${steps.length}`;
    elements.taskProgressLine.style.width = `${percent}%`;
    elements.taskProgressLine.style.backgroundColor = 'var(--green)';
    elements.taskProgressPercent.textContent = `${percent}%`;
  }

  if (taskFlowState.sentToManager) {
    elements.taskMeta.textContent = 'Ожидает проверки';
    renderTaskStatus(taskFlowState.taskStatus);
  } else {
    elements.taskMeta.textContent = taskStatusView[taskFlowState.taskStatus].text;
    renderTaskStatus(taskFlowState.taskStatus);
  }

  if (document.querySelector('#stepsList.stepTimeline')) {
    return;
  }

  for (const [index, row] of elements.stepRows.entries()) {
    const marker = row.querySelector('span');
    const badge = row.querySelector('em');

    row.classList.remove('is-current', 'is-complete');

    if (index < taskFlowState.currentStep || taskFlowState.currentStep >= steps.length) {
      row.classList.add('is-complete');
      marker.textContent = String(index + 1);
      badge.textContent = 'Выполнен';
      continue;
    }

    marker.textContent = String(index + 1);

    if (!taskFlowState.sentToManager && index === taskFlowState.currentStep) {
      row.classList.add('is-current');
      badge.textContent = 'Текущий этап';
      continue;
    }

    badge.textContent = 'Ожидает';
  }
}

function renderCurrentStep() {
  const step = steps[taskFlowState.currentStep];
  const currentStepNumber = taskFlowState.currentStep + 1;
  const doneWidth = `${(taskFlowState.currentStep / (steps.length - 1)) * 100}%`;
  const currentEnd = `${(currentStepNumber / steps.length) * 100}%`;
  const progressColor = getProgressColor(Math.round((currentStepNumber / steps.length) * 100));

  elements.currentStepScaleTitle.textContent = `Этап ${currentStepNumber} из ${steps.length}`;
  elements.currentStepScaleText.textContent = `${currentStepNumber} из ${steps.length} этапов`;
  elements.currentStepTitle.textContent = step.title;
  elements.currentStepDescription.textContent = step.description;
  elements.stepScale.style.setProperty('--done-width', doneWidth);
  elements.stepScale.style.setProperty('--current-end', currentEnd);
  elements.stepScale.style.setProperty('--progress-color', progressColor);

  for (const [index, dot] of elements.stepScaleDots.entries()) {
    dot.classList.toggle('done', index < taskFlowState.currentStep);
    dot.classList.toggle('current', index === taskFlowState.currentStep);
  }
}

function renderStagePhoto() {
  const step = steps[taskFlowState.currentStep];

  elements.stagePhotoTitle.textContent = `Фото: ${step.title}`;
  elements.stagePhotoText.textContent = 'Сделайте фото результата. После фото этап будет выполнен.';
}

function renderTaskStatus(status) {
  const view = taskStatusView[status];
  const statusClass = view.className.replace('taskStatusControl ', '');

  for (const control of elements.taskStatusControls) {
    control.className = view.className;
    control.querySelector('[data-task-status-text]').textContent = view.text;
    control.querySelector('[data-task-status-caption]').textContent = view.caption;
    control.querySelector('[data-task-status-icon]').textContent = view.icon;
    control.disabled = !view.next;
  }

  for (const statusElement of elements.homeTaskStatuses) {
    statusElement.className = `homeTaskStatus ${statusClass} is-updating`;
    statusElement.querySelector('[data-home-task-status-text]').textContent = view.text;
    statusElement.querySelector('[data-home-task-status-icon]').textContent = view.icon;
    window.setTimeout(() => statusElement.classList.remove('is-updating'), 220);
  }

  for (const card of elements.homeTaskCards) {
    card.className = `taskCard ${statusClass}`;
  }
}

function requestTaskStatusChange() {
  if (!elements.modalLayer.hidden) {
    return;
  }

  const view = taskStatusView[taskFlowState.taskStatus];
  const confirmation = taskStatusConfirmView[taskFlowState.taskStatus];

  if (!view.next || !confirmation) {
    return;
  }

  elements.taskStatusConfirmIcon.textContent = confirmation.icon;
  elements.taskStatusConfirmTitle.textContent = confirmation.title;
  elements.taskStatusConfirmText.textContent = confirmation.text;
  elements.taskStatusConfirmButton.textContent = confirmation.action;
  elements.taskStatusConfirmButton.disabled = false;
  elements.pauseReasonInput.value = '';
  elements.pauseReasonError.hidden = true;
  elements.pauseReasonField.hidden = view.next !== 'paused';
  modals.taskStatusConfirm.classList.remove(
    'is-confirm-green',
    'is-confirm-gray',
    'is-confirm-orange',
    'is-confirm-yellow',
  );
  modals.taskStatusConfirm.classList.add(`is-confirm-${confirmation.theme}`);
  openModal('taskStatusConfirm');
}

function confirmTaskStatusChange() {
  const nextStatus = taskStatusView[taskFlowState.taskStatus].next;
  const reason = elements.pauseReasonInput.value.trim();

  if (nextStatus === 'paused' && !reason) {
    elements.pauseReasonError.hidden = false;
    elements.pauseReasonInput.focus();
    return false;
  }

  advanceTaskStatus({ reason: nextStatus === 'paused' ? reason : null });
  return true;
}

function advanceTaskStatus(details = {}) {
  const nextStatus = taskStatusView[taskFlowState.taskStatus].next;

  if (!nextStatus) {
    return;
  }

  setTaskStatus(nextStatus, details);
  renderTask();
}

function setTaskStatus(status, details = {}) {
  if (taskFlowState.taskStatus === status) {
    return;
  }

  const changedAt = new Date().toISOString();

  taskFlowState.taskStatus = status;
  taskFlowState.taskStartedAt ??= status === 'working' ? changedAt : null;
  taskFlowState.taskStatusHistory.push({
    status,
    changedAt,
    reason: details.reason,
    user: 'Илья Н.',
    object: 'Пряник / Этаж 3 / Пом. 314',
    task: 'Подготовить основание стен для последующей обшивки ГКЛ.',
  });
}

function getProgressColor(percent) {
  const hue = Math.round((Math.max(0, Math.min(100, percent)) / 100) * 120);
  return `hsl(${hue} 70% 42%)`;
}

function resetCarousels(root) {
  for (const carousel of root.querySelectorAll('.photoCarousel')) {
    carousel.scrollLeft = 0;
  }
}

function showMessage(message) {
  elements.messagePanel.hidden = false;
  elements.messagePanel.textContent = message;
  window.setTimeout(() => {
    elements.messagePanel.hidden = true;
  }, 1800);
}
