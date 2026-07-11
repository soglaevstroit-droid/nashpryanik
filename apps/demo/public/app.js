/* global Headers, File, URL, crypto, navigator, sessionStorage */

const authTokenStorageKey = 'stroit.demo.accessToken';
const legacyShiftStorageKey = 'stroit.demo.shiftOpen';
const legacyShiftStateStorageKey = 'stroit.demo.shiftState';
const workerEmail = 'ilya.demo@stroit.local';

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

const coinBalanceStorageKey = 'stroit.demo.coinBalance';
const defaultCoinBalance = 12540;
let accessToken = sessionStorage.getItem(authTokenStorageKey);
let currentUser = null;
let currentShift = null;
let pendingCameraMode = null;
let cameraAttempt = {
  mode: null,
  operationId: null,
  stream: null,
  blob: null,
  previewUrl: null,
  isSubmitting: false,
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
  shiftEarnedAmount: document.querySelector('#shiftEarnedAmount'),
  startWorkButton: document.querySelector('#startWorkButton'),
  modalLayer: document.querySelector('#modalLayer'),
  messagePanel: document.querySelector('#messagePanel'),
  taskProgressCount: document.querySelector('#taskProgressCount'),
  taskProgressLine: document.querySelector('#taskProgressLine'),
  taskProgressPercent: document.querySelector('#taskProgressPercent'),
  taskMeta: document.querySelector('#taskMeta'),
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
};

const views = {
  myWork: document.querySelector('#myWorkView'),
  taskChoice: document.querySelector('#taskChoiceView'),
  taskDetail: document.querySelector('#taskDetailView'),
  currentStep: document.querySelector('#currentStepView'),
  stagePhoto: document.querySelector('#stagePhotoView'),
  resultConfirmation: document.querySelector('#resultConfirmationView'),
  workSent: document.querySelector('#workSentView'),
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

document.addEventListener('click', (event) => {
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

  elements.userInfo.textContent = currentUser?.name ?? 'Илья';
  elements.loginScreen.hidden = true;
  elements.loginScreen.classList.remove('is-active');
  elements.workspaceScreen.hidden = false;
  renderCoinBalance();
  renderTask();
  openView('myWork');
  return true;
}

function openView(name) {
  const taskFlowViews = ['taskDetail', 'currentStep', 'stagePhoto', 'resultConfirmation', 'workSent'];

  if (name === 'taskDetail') {
    renderTask();
  }

  if (name === 'currentStep') {
    renderCurrentStep();
  }

  if (name === 'stagePhoto') {
    renderStagePhoto();
  }

  for (const [viewName, view] of Object.entries(views)) {
    view.classList.toggle('is-active', viewName === name);
  }

  elements.workspaceScreen.classList.toggle('is-task-flow', taskFlowViews.includes(name));
  resetCarousels(views[name]);
  closeModal();
  window.scrollTo({ top: 0, behavior: 'instant' });
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

function renderShiftState() {
  const isOpen = isShiftOpen();

  elements.workerShiftStatus.textContent = isOpen ? 'Работает' : 'Отдыхает';
  elements.startWorkButton.textContent = isOpen ? 'ЗАКОНЧИТЬ РАБОТУ' : 'НАЧАТЬ РАБОТУ';
  elements.startWorkButton.classList.toggle('is-working', isOpen);
  elements.shiftEarnedAmount.textContent = formatShiftCoins(0);
}

async function refreshShiftState() {
  try {
    const response = await apiFetch('/api/v1/work-shifts/current');
    const body = await readResponseBody(response);

    if (!response.ok) {
      await handleApiFailure(response.status, body, {
        fallbackMessage: 'Не удалось получить состояние смены.',
      });
      return false;
    }

    currentShift = body?.shift ?? null;
    renderShiftState();
    return true;
  } catch {
    showMessage('Backend недоступен. Проверьте соединение и повторите попытку.');
    return false;
  }
}

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

  showCameraOrToastError(options.fallbackMessage ?? 'Не удалось сохранить фотографию. Проверьте соединение и повторите попытку.');
}

function handleUnauthorized() {
  clearAuthToken();
  stopCameraStream();
  cleanupCameraAttempt({ keepOperationId: false });
  closeModal();
  currentUser = null;
  currentShift = null;
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

async function startCameraStream() {
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
        facingMode: 'user',
      },
      audio: false,
    });

    cameraAttempt.stream = stream;
    elements.shiftCameraVideo.srcObject = stream;
    elements.shiftCameraVideo.hidden = false;
    elements.shiftCameraPreview.hidden = true;
    elements.shiftCameraState.hidden = true;
    elements.shiftCameraCaptureButton.disabled = false;
    await elements.shiftCameraVideo.play();
  } catch {
    setCameraError(
      'Не удалось получить доступ к камере. Разрешите использование камеры в настройках браузера и повторите попытку.',
    );
  }
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
  };
}

function stopCameraStream() {
  if (cameraAttempt.stream) {
    for (const track of cameraAttempt.stream.getTracks()) {
      track.stop();
    }
  }

  elements.shiftCameraVideo.pause();
  elements.shiftCameraVideo.srcObject = null;
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

function readCoinBalance() {
  const savedValue = localStorage.getItem(coinBalanceStorageKey);

  if (savedValue === null) {
    return defaultCoinBalance;
  }

  const savedBalance = Number(savedValue);
  return Number.isFinite(savedBalance) ? savedBalance : defaultCoinBalance;
}

function renderCoinBalance() {
  elements.totalCoinBalance.textContent = formatWholeCoins(readCoinBalance());
}

function formatShiftCoins(value) {
  return value.toFixed(2).replace('.', ',');
}

function formatWholeCoins(value) {
  return Math.round(value).toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
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
