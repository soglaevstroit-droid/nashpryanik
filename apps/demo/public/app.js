/* global CameraUtils, Headers, File, PhotoSlider, URL, crypto, navigator, sessionStorage */

const authTokenStorageKey = 'stroit.demo.accessToken';
const legacyShiftStorageKey = 'stroit.demo.shiftOpen';
const legacyShiftStateStorageKey = 'stroit.demo.shiftState';
const workerEmail = 'ilya';
const managerPhotoMaxBytes = 8 * 1024 * 1024;
const managerPhotosMaxBytes = 96 * 1024 * 1024;

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
let managerHistoryWorker = null;
let selectedTaskId = null;
let selectedTask = null;
let taskListScrollY = 0;
let taskDetailActionPending = false;
let pendingCameraMode = null;
let currentSection = 'tasks';
let previousWorkingSection = 'tasks';
let managerSelectedFiles = [];
let managerStepCount = 0;
let pendingStepCompletionId = null;
let taskCompletionOperationId = null;
let cameraAttempt = {
  mode: null,
  operationId: null,
  stream: null,
  blob: null,
  previewUrl: null,
  isSubmitting: false,
  facingMode: 'environment',
  cameraCount: 0,
  taskStepId: null,
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
  historyHeading: document.querySelector('#historyHeading'),
  historyMoreButton: document.querySelector('#historyMoreButton'),
  taskDescription: document.querySelector('#taskDescription'),
  taskAssignee: document.querySelector('#taskAssignee'),
  taskPhotos: document.querySelector('#taskPhotos'),
  taskPauseInfo: document.querySelector('#taskPauseInfo'),
  workerMessagesList: document.querySelector('#workerMessagesList'),
  workerArchiveList: document.querySelector('#workerArchiveList'),
  taskListHeading: document.querySelector('#taskListHeading'),
  orderNavButton: document.querySelector('#orderNavButton'),
  orderNavLabel: document.querySelector('#orderNavLabel'),
  historyNavButton: document.querySelector('#historyNavButton'),
  taskHelpIsland: document.querySelector('#taskHelpIsland'),
  managerTaskForm: document.querySelector('#managerTaskForm'),
  managerObject: document.querySelector('#managerObject'),
  managerWorker: document.querySelector('#managerWorker'),
  managerSteps: document.querySelector('#managerSteps'),
  managerPhotos: document.querySelector('#managerPhotos'),
  managerPhotoPreview: document.querySelector('#managerPhotoPreview'),
  taskDetailProgressLine: document.querySelector('#taskDetailProgressLine'),
  taskDetailProgressPercent: document.querySelector('#taskDetailProgressPercent'),
  taskDetailProgressCount: document.querySelector('#taskDetailProgressCount'),
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
  messages: document.querySelector('#messagesView'),
  maintenance: document.querySelector('#maintenanceView'),
};

const modals = {
  startShift: document.querySelector('#startShiftModal'),
  finishShift: document.querySelector('#finishShiftModal'),
  shiftCamera: document.querySelector('#shiftCameraModal'),
  taskStatusConfirm: document.querySelector('#taskStatusConfirmModal'),
  helpRequest: document.querySelector('#helpRequestModal'),
  managerTask: document.querySelector('#managerTaskModal'),
  completeStep: document.querySelector('#completeStepModal'),
  completeTask: document.querySelector('#completeTaskModal'),
  taskCompleted: document.querySelector('#taskCompletedModal'),
};

let modalCloseTimer;

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await login();
});
elements.historyMoreButton.addEventListener('click', () => loadHistory(false));
elements.managerTaskForm.addEventListener('submit', submitManagerTask);
elements.managerPhotos.addEventListener('change', () => {
  managerSelectedFiles = Array.from(elements.managerPhotos.files ?? []);
  renderManagerPhotoPreview();
});
document.addEventListener('change', (event) => {
  const control = event.target.closest?.('[data-manager-update]');
  if (control) void updateManagerTask(control.dataset.managerUpdate, control.value);
});

document.addEventListener('click', async (event) => {
  const sectionButton = event.target.closest('[data-section]');
  const maintenanceBackButton = event.target.closest('[data-maintenance-back]');
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
  const addManagerStepButton = event.target.closest('[data-add-manager-step]');
  const removeManagerStepButton = event.target.closest('[data-remove-manager-step]');
  const removeManagerPhotoButton = event.target.closest('[data-remove-manager-photo]');
  const closeManagerFormButton = event.target.closest('[data-close-manager-form]');
  const managerDeleteButton = event.target.closest('[data-manager-delete]');
  const chooseAnotherTaskButton = event.target.closest('[data-choose-another-task]');
  const goToHistoryButton = event.target.closest('[data-go-to-history]');
  const confirmCompleteStepButton = event.target.closest('[data-confirm-complete-step]');
  const cancelCompleteStepButton = event.target.closest('[data-cancel-complete-step]');
  const confirmCompleteTaskButton = event.target.closest('[data-confirm-complete-task]');
  const cancelCompleteTaskButton = event.target.closest('[data-cancel-complete-task]');
  const finishCompleteTaskButton = event.target.closest('[data-finish-complete-task]');
  if (sectionButton) {
    navigateSection(sectionButton.dataset.section);
    return;
  }
  if (maintenanceBackButton) {
    navigateSection(previousWorkingSection || 'tasks');
    return;
  }
  if (addManagerStepButton) return addManagerStep();
  if (removeManagerStepButton)
    return removeManagerStep(removeManagerStepButton.closest('.managerStepFields'));
  if (removeManagerPhotoButton) {
    managerSelectedFiles.splice(Number(removeManagerPhotoButton.dataset.removeManagerPhoto), 1);
    renderManagerPhotoPreview();
    return;
  }
  if (closeManagerFormButton) return closeManagerForm();
  if (managerDeleteButton) return deleteManagerTask();
  if (chooseAnotherTaskButton) {
    selectedTask = null;
    selectedTaskId = null;
    openView('myWork');
    return;
  }
  if (goToHistoryButton) return navigateSection('history');
  if (confirmCompleteStepButton) {
    const stepId = pendingStepCompletionId;
    pendingStepCompletionId = null;
    closeModal();
    if (stepId) await runDetailAction('step', 'complete', stepId);
    return;
  }
  if (cancelCompleteStepButton) {
    pendingStepCompletionId = null;
    closeModal();
    return;
  }
  if (confirmCompleteTaskButton) return completeSelectedTask();
  if (cancelCompleteTaskButton) return closeModal();
  if (finishCompleteTaskButton) {
    closeModal();
    selectedTask = null;
    selectedTaskId = null;
    await loadWorkerObjects();
    openView('myWork');
    return;
  }
  const managerReplyButton = event.target.closest('[data-manager-reply]');
  if (managerReplyButton) {
    await replyToWorkerMessage(
      managerReplyButton.dataset.messageId,
      managerReplyButton.dataset.managerReply,
    );
    return;
  }
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
    requestStepCompletion(detailStepAction.dataset.stepId);
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
    if (!isManager() && (isTaskAccessLocked() || taskCard.dataset.businessLocked === 'true'))
      return notifyTaskLocked();
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
    await sendHelpRequest();
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

  if (isManager()) {
    configureBottomNavigation();
    elements.userInfo.textContent = currentUser.name ?? 'Руководитель';
    elements.loginScreen.hidden = true;
    elements.loginScreen.classList.remove('is-active');
    elements.workspaceScreen.hidden = false;
    elements.taskListHeading.textContent = 'Задачи сотрудников';
    await loadManagerTasks();
    navigateSection('tasks');
    return true;
  }

  const isSynced = await refreshShiftState();

  if (!isSynced) {
    return false;
  }

  elements.userInfo.textContent = currentUser?.name ?? 'Илья Н.';
  configureBottomNavigation();
  elements.loginScreen.hidden = true;
  elements.loginScreen.classList.remove('is-active');
  elements.workspaceScreen.hidden = false;
  renderTask();
  await loadWorkerObjects();
  navigateSection('tasks');
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
  if (name === 'messages') void loadWorkerMessages();

  for (const [viewName, view] of Object.entries(views)) {
    view.classList.toggle('is-active', viewName === name);
  }

  elements.workspaceScreen.classList.toggle('is-task-flow', taskFlowViews.includes(name));
  resetCarousels(views[name]);
  closeModal();
  if (!options.preserveScroll) window.scrollTo({ top: 0, behavior: 'instant' });
}

function navigateSection(section) {
  if (section === 'order' && isManager()) {
    currentSection = 'order';
    updateBottomNavigation();
    void openManagerTaskForm();
    return;
  }
  if (section === 'history' && !isManager()) {
    if (['tasks', 'history'].includes(currentSection))
      previousWorkingSection = currentSection === 'history' ? 'tasks' : currentSection;
    currentSection = 'history';
    openView('maintenance');
    updateBottomNavigation();
    return;
  }
  if (['messages', 'order', 'profile'].includes(section)) {
    if (['tasks', 'history'].includes(currentSection)) previousWorkingSection = currentSection;
    currentSection = section;
    openView('maintenance');
  } else if (section === 'history') {
    currentSection = 'history';
    previousWorkingSection = 'history';
    openView('history');
  } else {
    currentSection = 'tasks';
    previousWorkingSection = 'tasks';
    openView('myWork', { preserveScroll: true });
  }
  updateBottomNavigation();
}

function isManager() {
  return ['FOREMAN', 'DIRECTOR', 'CREATOR'].includes(currentUser?.role);
}

function configureBottomNavigation() {
  const manager = isManager();
  const expectedSections = ['tasks', 'messages', 'order', 'history', 'profile'];
  const buttons = Array.from(document.querySelectorAll('.bottomNav [data-section]'));

  for (const [index, button] of buttons.entries()) {
    button.hidden = !expectedSections.includes(button.dataset.section);
    button.style.order = String(expectedSections.indexOf(button.dataset.section));
    button.dataset.menuRole = currentUser?.role ?? '';
    if (button.dataset.section === 'history') {
      button.setAttribute(
        'aria-label',
        manager ? 'Открыть историю сотрудников' : 'История — технические работы',
      );
    }
    if (index >= expectedSections.length) button.hidden = true;
  }

  elements.workspaceScreen.classList.toggle('manager-mode', manager);
  elements.orderNavLabel.textContent = manager ? 'Поставить' : 'Заказать';
  elements.orderNavButton.setAttribute('aria-label', manager ? 'Поставить задачу' : 'Заказать');
  elements.historyNavButton.hidden = false;
  managerHistoryWorker = null;
  historyCursor = null;
  elements.historyHeading.textContent = 'История';
}

function updateBottomNavigation() {
  for (const button of document.querySelectorAll('.bottomNav [data-section]')) {
    const active = button.dataset.section === currentSection;
    button.classList.toggle('is-active', active);
    button.classList.toggle('is-order-active', active && currentSection === 'order');
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
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
  for (const card of elements.workerObjectsList.querySelectorAll('[data-worker-task-id]')) {
    const cardLocked = locked || card.dataset.businessLocked === 'true';
    photoSlider.setLocked(card, cardLocked);
    card.classList.toggle('is-task-locked', cardLocked);
    card.setAttribute('aria-disabled', String(cardLocked));
    card.setAttribute(
      'aria-label',
      cardLocked
        ? `${card.querySelector('h3')?.textContent ?? 'Задача'}. Задача заблокирована до открытия смены`
        : (card.querySelector('h3')?.textContent ?? 'Открыть задачу'),
    );
    card.setAttribute('role', cardLocked ? 'group' : 'button');
    card.tabIndex = cardLocked ? -1 : 0;
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
  elements.pendingCoinAmount.textContent = formatRoundedCoinUnits(pending);
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

async function loadManagerTasks() {
  elements.workerObjectsList.innerHTML = '<p>Загружаем задачи…</p>';
  const response = await apiFetch('/api/v1/manager/tasks');
  const tasks = await readResponseBody(response);
  if (!response.ok) {
    elements.workerObjectsList.innerHTML =
      '<div class="emptyObject"><p>Не удалось загрузить задачи</p></div>';
    return;
  }
  elements.workerObjectsList.innerHTML = tasks.length
    ? tasks
        .map((task) => renderTaskCard(task, task.object ?? { name: 'Объект не указан' }))
        .join('')
    : '<div class="emptyObject"><p>Активных задач пока нет</p></div>';
  photoSlider.mount(elements.workerObjectsList);
}

async function openManagerTaskForm() {
  const [objectsResponse, workersResponse] = await Promise.all([
    apiFetch('/api/v1/manager/objects'),
    apiFetch('/api/v1/manager/workers'),
  ]);
  const objects = await readResponseBody(objectsResponse);
  const workers = await readResponseBody(workersResponse);
  if (!objectsResponse.ok || !workersResponse.ok) return showMessage('Не удалось загрузить форму');
  elements.managerObject.innerHTML = objects
    .map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`)
    .join('');
  elements.managerWorker.innerHTML = workers.length
    ? workers
        .map((item) => `<option value="${item.id}">${escapeHtml(item.name || item.email)}</option>`)
        .join('')
    : '<option value="">Нет доступных исполнителей</option>';
  elements.managerTaskForm.querySelector('button[type="submit"]').disabled = !workers.length;
  elements.managerTaskForm.reset();
  managerSelectedFiles = [];
  managerStepCount = 0;
  elements.managerSteps.innerHTML = '';
  addManagerStep();
  renderManagerPhotoPreview();
  openModal('managerTask');
}

function addManagerStep() {
  managerStepCount += 1;
  elements.managerSteps.insertAdjacentHTML(
    'beforeend',
    `<section class="managerStepFields"><strong>Этап <span>${managerStepCount}</span></strong><label>Название<input data-manager-step-title required /></label><label>Описание<textarea data-manager-step-description required></textarea></label><button type="button" class="secondaryButton" data-remove-manager-step>Удалить этап</button></section>`,
  );
  renumberManagerSteps();
}

function removeManagerStep(step) {
  if (elements.managerSteps.children.length === 1)
    return showMessage('Минимум один этап обязателен');
  step?.remove();
  renumberManagerSteps();
}

function renumberManagerSteps() {
  [...elements.managerSteps.children].forEach((step, index) => {
    step.querySelector('strong span').textContent = index + 1;
  });
}

function renderManagerPhotoPreview() {
  elements.managerPhotoPreview.innerHTML = managerSelectedFiles
    .map(
      (file, index) =>
        `<figure><img src="${URL.createObjectURL(file)}" alt="${escapeHtml(file.name)}" /><button type="button" data-remove-manager-photo="${index}" aria-label="Удалить фото">×</button></figure>`,
    )
    .join('');
}

function closeManagerForm() {
  const dirty =
    elements.managerTaskForm.querySelector('input:not([type="radio"]):not([type="file"])')?.value ||
    managerSelectedFiles.length;
  if (dirty && !window.confirm('Закрыть окно? Введённые данные будут потеряны.')) return;
  closeModal();
  currentSection = 'tasks';
  updateBottomNavigation();
}

async function submitManagerTask(event) {
  event.preventDefault();
  const steps = [...elements.managerSteps.children].map((step) => ({
    title: step.querySelector('[data-manager-step-title]').value.trim(),
    description: step.querySelector('[data-manager-step-description]').value.trim(),
  }));
  const payload = {
    operationId: crypto.randomUUID(),
    objectId: elements.managerObject.value,
    assigneeId: elements.managerWorker.value,
    title: document.querySelector('#managerTitle').value.trim(),
    description: document.querySelector('#managerDescription').value.trim(),
    location: document.querySelector('#managerLocation').value.trim(),
    priority: new FormData(elements.managerTaskForm).get('managerPriority'),
    accessStatus: new FormData(elements.managerTaskForm).get('managerAccess'),
    position: Number(document.querySelector('#managerPosition').value),
    steps,
  };
  const summary = `${payload.title}\nЭтапов: ${steps.length}\nФото: ${managerSelectedFiles.length}\nПозиция: ${payload.position}`;
  if (!window.confirm(`Поставить задачу?\n\n${summary}`)) return;
  await sendManagerTask(payload);
}

async function sendManagerTask(payload) {
  const oversizedPhoto = managerSelectedFiles.find((file) => file.size > managerPhotoMaxBytes);
  if (oversizedPhoto) return showMessage(`Фото «${oversizedPhoto.name}» превышает лимит 8 МБ`);
  const photosSize = managerSelectedFiles.reduce((total, file) => total + file.size, 0);
  if (photosSize > managerPhotosMaxBytes)
    return showMessage('Общий размер фотографий превышает лимит 96 МБ');
  const data = new FormData();
  data.append('payload', JSON.stringify(payload));
  managerSelectedFiles.forEach((file) => data.append('photos', file));
  let response = await apiFetch('/api/v1/manager/tasks', { method: 'POST', body: data });
  let body = await readResponseBody(response);
  if (response.status === 409 && getApiMessage(body)?.includes('уже есть задача')) {
    if (!window.confirm(`${getApiMessage(body)}\n\nВсё равно поставить?`)) return;
    payload.forceUrgent = true;
    data.set('payload', JSON.stringify(payload));
    response = await apiFetch('/api/v1/manager/tasks', { method: 'POST', body: data });
    body = await readResponseBody(response);
  }
  if (!response.ok) return showMessage(getApiMessage(body) || 'Не удалось поставить задачу');
  closeModal();
  currentSection = 'tasks';
  updateBottomNavigation();
  await loadManagerTasks();
  showMessage('Задача поставлена');
}

async function updateManagerTask(field, value) {
  if (!selectedTaskId || !isManager()) return;
  if (
    field === 'accessStatus' &&
    value === 'CLOSED' &&
    selectedTask.status === 'IN_PROGRESS' &&
    !window.confirm('Задача находится в работе. После закрытия сотрудник потеряет к ней доступ.')
  )
    return renderSelectedTask();
  const response = await apiFetch(`/api/v1/manager/tasks/${selectedTaskId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operationId: crypto.randomUUID(), [field]: value }),
  });
  const body = await readResponseBody(response);
  if (!response.ok) return showMessage(getApiMessage(body) || 'Не удалось изменить задачу');
  await Promise.all([reloadTaskDetails(), loadManagerTasks()]);
  showMessage('Параметры обновлены');
}

async function deleteManagerTask() {
  if (!selectedTask) return;
  const needsReason = ['ACCEPTED', 'IN_PROGRESS', 'PAUSED'].includes(selectedTask.status);
  const reason = window
    .prompt(
      `Удалить задачу?\nЗадача будет удалена из активного списка сотрудника.${needsReason ? '\nУкажите причину удаления:' : ''}`,
    )
    ?.trim();
  if (reason === undefined || (needsReason && !reason))
    return needsReason && showMessage('Причина удаления обязательна');
  if (!window.confirm(`Да, удалить «${selectedTask.title}»?`)) return;
  const response = await apiFetch(`/api/v1/manager/tasks/${selectedTask.id}`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operationId: crypto.randomUUID(), reason }),
  });
  const body = await readResponseBody(response);
  if (!response.ok) return showMessage(getApiMessage(body) || 'Не удалось удалить задачу');
  selectedTask = null;
  selectedTaskId = null;
  await loadManagerTasks();
  openView('myWork');
  showMessage('Задача удалена');
}

function renderTaskCard(task, object) {
  const completed = task.steps.filter((step) => step.status === 'COMPLETED').length;
  const percent = task.steps.length ? Math.round((completed / task.steps.length) * 100) : 0;
  const gallery = PhotoSlider.render(task.photos, {
    id: `task-list-${task.id}`,
    emptyText: 'Фотографий пока нет',
    locked: !isManager() && (isTaskAccessLocked() || task.isAccessLocked),
  });
  const location = taskLocationLabel(task, object);
  const statusClass =
    task.priority === 'URGENT' && task.status !== 'IN_PROGRESS'
      ? 'is-paused'
      : taskCardStatusClass(task.status);
  return `<article class="taskCard taskFeedCard ${statusClass}" data-worker-task-id="${task.id}" data-business-locked="${Boolean(task.isAccessLocked)}" role="button" tabindex="0"><div class="taskFeedCardHeader"><h3>${escapeHtml(task.title)}</h3></div>${gallery}<p class="taskLocation">${escapeHtml(location)}</p><div class="taskProgressBlock"><div class="taskProgressLine"><span><i style="width:${percent}%"></i></span><b>${percent}%</b></div><small>${completed} из ${task.steps.length} этапов выполнено</small></div></article>`;
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
      PAUSED: 'is-paused',
    }[status] ?? ''
  );
}

function taskLocationLabel(task, object = task.object) {
  return [object?.name, task.location].filter(Boolean).join(' / ') || 'Место не указано';
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
  if (!isManager() && isTaskAccessLocked()) return notifyTaskLocked();
  selectedTaskId = taskId;
  selectedTask = null;
  taskListScrollY = window.scrollY;
  renderTaskDetailLoading();
  openView('taskDetail');
  await reloadTaskDetails();
}

async function reloadTaskDetails() {
  if (!isManager() && isTaskAccessLocked()) {
    openView('myWork', { preserveScroll: true });
    return notifyTaskLocked();
  }
  if (!selectedTaskId) return;
  try {
    const response = await apiFetch(
      isManager()
        ? `/api/v1/manager/tasks/${selectedTaskId}`
        : `/api/v1/worker/tasks/${selectedTaskId}`,
    );
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
  elements.taskDetailProgressLine.style.width = '0%';
  elements.taskDetailProgressPercent.textContent = '0%';
  elements.taskDetailProgressCount.textContent = 'Загружаем этапы…';
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
  elements.taskObject.textContent = taskLocationLabel(selectedTask);
  elements.taskDescription.textContent = selectedTask.description || 'Описание не указано';
  elements.taskAssignee.textContent = `Исполнитель: ${selectedTask.assignee?.name ?? 'не назначен'}`;
  elements.taskMeta.hidden = false;
  elements.taskMeta.textContent = taskStatusLabel(selectedTask.status);
  const completedSteps = selectedTask.steps.filter((step) => step.status === 'COMPLETED').length;
  const progress = selectedTask.steps.length
    ? Math.round((completedSteps / selectedTask.steps.length) * 100)
    : 0;
  elements.taskDetailProgressLine.style.width = `${progress}%`;
  elements.taskDetailProgressPercent.textContent = `${progress}%`;
  elements.taskDetailProgressCount.textContent = `${completedSteps} из ${selectedTask.steps.length} этапов выполнено`;
  renderSelectedTaskControl();
  elements.taskPhotos.innerHTML = PhotoSlider.render(selectedTask.photos, {
    id: `task-${selectedTask.id}`,
    emptyText: 'У задачи пока нет фотографий',
  });
  elements.stepsList.innerHTML = selectedTask.steps.length
    ? selectedTask.steps.map(renderTaskStep).join('')
    : '<div class="emptyObject"><p>У задачи нет этапов</p></div>';
  renderStepWorkflowFooter();
  if (!isManager()) {
    elements.taskHelpIsland.hidden =
      ['COMPLETED', 'CANCELLED'].includes(selectedTask.status) || Boolean(selectedTask.deletedAt);
    elements.taskHelpIsland.innerHTML =
      '<button class="helpButton" type="button" data-open-modal="helpRequest">Нужна помощь?</button>';
  }
  renderManagerControls();
}

function renderSelectedTaskControl() {
  const control = views.taskDetail.querySelector('[data-task-status-control]');
  if (isManager()) {
    control.disabled = true;
    control.dataset.detailTaskAction = '';
    control.querySelector('b').textContent = taskStatusLabel(selectedTask.status);
    control.querySelector('small').textContent =
      `Исполнитель: ${selectedTask.assignee?.name ?? 'не назначен'}`;
    return;
  }
  const action =
    selectedTask.status === 'ASSIGNED'
      ? 'accept'
      : selectedTask.status === 'ACCEPTED'
        ? 'start'
        : selectedTask.status === 'IN_PROGRESS'
          ? 'pause'
          : null;
  control.disabled = taskDetailActionPending || !action;
  control.dataset.detailTaskAction = action ?? '';
  control.querySelector('b').textContent = action
    ? { accept: 'Принять задачу', start: 'Начать задачу', pause: 'Поставить на паузу' }[action]
    : taskStatusLabel(selectedTask.status);
  control.querySelector('small').textContent = action
    ? 'Действие будет сохранено в истории.'
    : 'Для текущего статуса действий нет.';
}

function renderTaskStep(step, index) {
  const currentStep = ['IN_PROGRESS', 'PAUSED'].includes(selectedTask.status)
    ? selectedTask.steps.find((candidate) => candidate.status !== 'COMPLETED')
    : null;
  const isWorkerCurrent = !isManager() && currentStep?.id === step.id;
  const isPaused = isWorkerCurrent && selectedTask.status === 'PAUSED';
  const isBlocked = isPaused && selectedTask.isWorkBlocked;
  const pause = latestPauseForStep(step.id);
  const reply = pause
    ? selectedTask.messages.find(
        (message) => message.kind === 'MANAGER_REPLY' && message.parentId === pause.id,
      )
    : null;
  if (isWorkerCurrent) {
    const pausePanel = pause
      ? `<section class="stepStateMessage ${isBlocked ? 'is-blocked' : reply?.decision === 'CONTINUE' ? 'is-success' : 'is-paused'}"><strong>Причина паузы</strong><p>${escapeHtml(pause.body)}</p><time>${formatLocalDateTime(pause.createdAt)}</time>${reply ? `<strong>Ответ руководителя</strong><p>${escapeHtml(reply.body)}</p><time>${formatLocalDateTime(reply.createdAt)}</time>` : '<small>Ожидайте ответа руководителя.</small>'}</section>`
      : '';
    const actions = isPaused
      ? `<p class="stepStoppedText">${isBlocked ? 'Работы по задаче остановлены. Выберите другую задачу.' : 'Работа приостановлена. Ожидайте ответ руководителя.'}</p>`
      : `<div class="stepWorkActions"><button class="stepPhotoButton" type="button" data-upload-detail-photo data-step-id="${step.id}" ${taskDetailActionPending ? 'disabled' : ''}><span aria-hidden="true">▣</span> Сделать фото</button><button class="stepCompleteButton" type="button" data-detail-step-action="complete" data-step-id="${step.id}" ${taskDetailActionPending ? 'disabled' : ''}>${taskDetailActionPending ? 'Завершаем…' : 'Завершить этап'}</button></div>`;
    return `<article class="workStep is-current ${isPaused ? 'is-paused' : ''}" data-active-step><div class="currentStepBubble"><h3>${escapeHtml(cleanStepTitle(step.title))}</h3><p>${escapeHtml(step.description || 'Описание не указано')}</p>${pausePanel}${actions}</div>${index < selectedTask.steps.length - 1 ? '<span class="workStepArrow" aria-hidden="true">↓</span>' : ''}</article>`;
  }
  const completed = step.status === 'COMPLETED' && Boolean(step.completedAt);
  return `<article class="workStep ${completed ? 'is-complete' : ''}"><div class="workStepCompact"><h3>${escapeHtml(cleanStepTitle(step.title))}</h3>${completed ? '<small>✓ Выполнено</small>' : ''}</div>${index < selectedTask.steps.length - 1 ? '<span class="workStepArrow" aria-hidden="true">↓</span>' : ''}</article>`;
}

function cleanStepTitle(title) {
  return String(title ?? '')
    .replace(/^\s*(?:этап\s*№?\s*\d+|\d+\s*[.)-]?\s*этап)\s*[.):-]?\s*/i, '')
    .trim();
}

function renderManagerControls() {
  if (!isManager()) return;
  elements.taskHelpIsland.hidden = false;
  elements.taskHelpIsland.innerHTML = `<h3>Управление задачей</h3><div class="managerControls"><label>Приоритет<select data-manager-update="priority"><option value="NORMAL" ${selectedTask.priority === 'NORMAL' ? 'selected' : ''}>Обычная</option><option value="URGENT" ${selectedTask.priority === 'URGENT' ? 'selected' : ''}>Срочная</option></select></label><label>Доступ<select data-manager-update="accessStatus"><option value="OPEN" ${selectedTask.accessStatus === 'OPEN' ? 'selected' : ''}>Открытая</option><option value="CLOSED" ${selectedTask.accessStatus === 'CLOSED' ? 'selected' : ''}>Закрытая</option></select></label><button type="button" class="dangerButton" data-manager-delete>Удалить задачу</button></div>`;
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
    if (kind === 'task' && action === 'pause') {
      const message = window.prompt('Укажите причину паузы')?.trim();
      if (!message) return showMessage('Укажите причину паузы');
      const response = await apiFetch(`/api/v1/worker/tasks/${id}/pause`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const body = await readResponseBody(response);
      if (!response.ok)
        return showMessage(getApiMessage(body) || 'Не удалось поставить задачу на паузу.');
      await Promise.all([reloadTaskDetails(), loadWorkerObjects(), loadHistory(true)]);
      return showMessage('Сообщение отправлено руководителю');
    }
    const completesTask =
      kind === 'step' &&
      selectedTask.steps.filter((step) => step.status !== 'COMPLETED').length === 1;
    const base = kind === 'task' ? `/api/v1/tasks/${id}` : `/api/v1/task-steps/${id}`;
    const response = await apiFetch(`${base}/${action}`, {
      method: 'PATCH',
      headers:
        kind === 'step' && action === 'complete'
          ? { 'content-type': 'application/json' }
          : undefined,
      body:
        kind === 'step' && action === 'complete'
          ? JSON.stringify({ operationId: crypto.randomUUID() })
          : undefined,
    });
    const body = await readResponseBody(response);
    if (!response.ok) return showMessage(getApiMessage(body) || 'Действие сейчас недоступно.');
    await Promise.all([reloadTaskDetails(), loadWorkerObjects(), loadHistory(true)]);
    if (kind === 'step') {
      if (completesTask) {
        taskCompletionOperationId = crypto.randomUUID();
        openModal('completeTask');
        return;
      }
      window.setTimeout(
        () =>
          views.taskDetail
            .querySelector('[data-active-step]')
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
        40,
      );
      showMessage('Этап выполнен. Работайте со следующим этапом.');
    } else showMessage('Статус обновлён');
  } catch {
    showMessage('Не удалось выполнить действие. Проверьте соединение и повторите попытку.');
  } finally {
    taskDetailActionPending = false;
    if (selectedTask) renderSelectedTaskControl();
  }
}

function requestStepCompletion(stepId) {
  if (taskDetailActionPending || !stepId) return;
  const step = selectedTask?.steps.find((candidate) => candidate.id === stepId);
  if (!step || step.status !== 'IN_PROGRESS') return;
  if ((step.photos?.length ?? 0) < 2) {
    showMessage('Загрузите минимум две фотографии, чтобы завершить этап.');
    return;
  }
  pendingStepCompletionId = stepId;
  openModal('completeStep');
}

async function completeSelectedTask() {
  if (!selectedTaskId || taskDetailActionPending) return;
  taskDetailActionPending = true;
  const operationId = taskCompletionOperationId ?? crypto.randomUUID();
  taskCompletionOperationId = operationId;
  const button = modals.completeTask.querySelector('[data-confirm-complete-task]');
  button.disabled = true;
  try {
    const response = await apiFetch(`/api/v1/tasks/${selectedTaskId}/complete`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operationId }),
    });
    const body = await readResponseBody(response);
    if (!response.ok) return showMessage(getApiMessage(body) || 'Не удалось завершить задачу.');
    calculateCompletionBonus();
    await Promise.all([loadWorkerObjects(), loadHistory(true), loadWorkerMessages()]);
    openModal('taskCompleted');
  } finally {
    taskDetailActionPending = false;
    button.disabled = false;
  }
}

function openDetailPhotoPicker(stepId) {
  if (isTaskAccessLocked()) return notifyTaskLocked();
  if (taskDetailActionPending || !selectedTaskId || !stepId) return;
  void openShiftCamera('TASK_STEP', stepId);
}

function latestPauseForStep(stepId) {
  return [...(selectedTask.messages ?? [])]
    .reverse()
    .find((message) => message.kind === 'PAUSE_REQUEST' && message.taskStepId === stepId);
}

function renderStepWorkflowFooter() {
  elements.taskPauseInfo.hidden = true;
  elements.taskPauseInfo.innerHTML = '';
}

function formatLocalDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

async function loadWorkerMessages() {
  if (['FOREMAN', 'DIRECTOR', 'CREATOR'].includes(currentUser?.role)) return loadManagerMessages();
  const [messagesResponse, archiveResponse] = await Promise.all([
    apiFetch('/api/v1/worker/messages'),
    apiFetch('/api/v1/worker/archive'),
  ]);
  const messages = await readResponseBody(messagesResponse);
  const archive = await readResponseBody(archiveResponse);
  elements.workerMessagesList.innerHTML =
    messagesResponse.ok && messages.length
      ? messages
          .map(
            (message) =>
              `<article class="whiteCard messageCard"><strong>${message.kind === 'MANAGER_REPLY' ? 'Ответ руководителя' : message.kind === 'HELP_REQUEST' ? 'Запрос помощи' : 'Пауза'}</strong><p>${escapeHtml(message.body)}</p><small>${escapeHtml(message.task.title)}</small></article>`,
          )
          .join('')
      : '<div class="emptyObject"><p>Сообщений пока нет</p></div>';
  elements.workerArchiveList.innerHTML =
    archiveResponse.ok && archive.length
      ? archive
          .map(
            (task) =>
              `<article class="whiteCard messageCard"><strong>${escapeHtml(task.title)}</strong><p>${escapeHtml(task.object?.name ?? '')}</p><small>${task.steps.length} этапов</small></article>`,
          )
          .join('')
      : '<div class="emptyObject"><p>Архив пока пуст</p></div>';
}

async function loadManagerMessages() {
  const [messagesResponse, archiveResponse] = await Promise.all([
    apiFetch('/api/v1/manager/messages'),
    apiFetch('/api/v1/manager/archive'),
  ]);
  const messages = await readResponseBody(messagesResponse);
  const archive = await readResponseBody(archiveResponse);
  elements.workerMessagesList.innerHTML =
    messagesResponse.ok && messages.length
      ? messages
          .map(
            (message) =>
              `<article class="whiteCard messageCard"><strong>${message.kind === 'HELP_REQUEST' ? 'Нужна помощь' : 'Задача на паузе'}</strong><p>${escapeHtml(message.body)}</p><small>${escapeHtml(message.task.object?.name ?? '')} · ${escapeHtml(message.task.title)}</small><div class="stepWorkActions"><button data-manager-reply="CONTINUE" data-message-id="${message.id}">Продолжить работу</button><button data-manager-reply="STOP" data-message-id="${message.id}">Не продолжать</button></div></article>`,
          )
          .join('')
      : '<div class="emptyObject"><p>Новых обращений нет</p></div>';
  elements.workerArchiveList.innerHTML =
    archiveResponse.ok && archive.length
      ? archive
          .map(
            (task) =>
              `<article class="whiteCard messageCard"><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.object?.name ?? '')}</small></article>`,
          )
          .join('')
      : '<div class="emptyObject"><p>Архив пока пуст</p></div>';
}

async function replyToWorkerMessage(messageId, decision) {
  const message = window.prompt('Ответ сотруднику')?.trim();
  if (!message) return showMessage('Введите ответ сотруднику');
  const response = await apiFetch(`/api/v1/manager/messages/${messageId}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, decision }),
  });
  const body = await readResponseBody(response);
  if (!response.ok) return showMessage(getApiMessage(body) || 'Не удалось отправить ответ');
  await loadManagerMessages();
  showMessage('Ответ отправлен сотруднику');
}

function calculateCompletionBonus() {
  return 0;
}

async function loadHistory(reset) {
  if (reset) {
    historyCursor = null;
    elements.historyList.innerHTML = '<p>Загружаем историю…</p>';
  }
  try {
    if (isManager() && !managerHistoryWorker) {
      const workersResponse = await apiFetch('/api/v1/manager/workers');
      const workers = await readResponseBody(workersResponse);
      if (!workersResponse.ok || !Array.isArray(workers) || workers.length === 0)
        throw new Error('No workers');
      managerHistoryWorker = workers[0];
    }
    const pagination = `limit=20${historyCursor ? `&cursor=${encodeURIComponent(historyCursor)}` : ''}`;
    const url = isManager()
      ? `/api/v1/manager/history?workerId=${encodeURIComponent(managerHistoryWorker.id)}&${pagination}`
      : `/api/v1/history?${pagination}`;
    const response = await apiFetch(url);
    const body = await readResponseBody(response);
    if (!response.ok) throw new Error();
    if (isManager()) {
      managerHistoryWorker = body.worker ?? managerHistoryWorker;
      elements.historyHeading.textContent = `История — ${managerHistoryWorker.name || managerHistoryWorker.email}`;
    }
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
      TASK_PAUSED: 'Поставил задачу на паузу',
      HELP_REQUEST: 'Запросил помощь',
      MANAGER_REPLY: 'Получил ответ руководителя',
    }[type] ?? 'Выполнил действие'
  );
}

function taskStatusLabel(status) {
  return (
    {
      ASSIGNED: 'Не начата',
      IN_PROGRESS: 'В работе',
      ACCEPTED: 'Принята',
      PAUSED: 'На паузе',
      ON_REVIEW: 'На проверке',
      COMPLETED: 'Выполнена',
    }[status] ?? status
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

async function openShiftCamera(mode, taskStepId = null) {
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
    taskStepId,
  };

  elements.shiftCameraTitle.textContent =
    mode === 'START'
      ? 'Фото перед началом смены'
      : mode === 'TASK_STEP'
        ? 'Фото текущего этапа'
        : 'Фото перед завершением смены';
  elements.shiftCameraText.textContent =
    mode === 'START'
      ? 'Расположите лицо в кадре и сделайте фотографию.'
      : mode === 'TASK_STEP'
        ? 'Сделайте фотографию выполненной работы.'
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
    await elements.shiftCameraVideo.play();
    await waitForVideoFrame(elements.shiftCameraVideo);
    elements.shiftCameraCaptureButton.disabled = false;
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
  elements.shiftCameraCaptureButton.disabled = true;
  setCameraLoading('Подготавливаем фотографию...');
  try {
    await waitForVideoFrame(video);
    await nextAnimationFrame();
  } catch {
    setCameraError('Не удалось подготовить фотографию. Сделайте снимок ещё раз.');
    elements.shiftCameraCaptureButton.disabled = false;
    return;
  }
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!width || !height) {
    setCameraError('Не удалось подготовить фотографию. Сделайте снимок ещё раз.');
    elements.shiftCameraCaptureButton.disabled = false;
    return;
  }

  const canvas = elements.shiftCameraCanvas;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    setCameraError('Не удалось подготовить фотографию. Сделайте снимок ещё раз.');
    elements.shiftCameraCaptureButton.disabled = false;
    return;
  }
  context.drawImage(video, 0, 0, width, height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));

  if (!blob) {
    setCameraError('Не удалось подготовить фотографию. Сделайте снимок ещё раз.');
    elements.shiftCameraCaptureButton.disabled = false;
    return;
  }

  clearCameraPreview();
  cameraAttempt.blob = blob;
  cameraAttempt.previewUrl = URL.createObjectURL(blob);
  try {
    await loadPreviewImage(elements.shiftCameraPreview, cameraAttempt.previewUrl);
  } catch {
    clearCameraPreview();
    setCameraError('Не удалось отобразить фотографию. Переснимите кадр.');
    elements.shiftCameraConfirmButton.hidden = true;
    elements.shiftCameraConfirmButton.disabled = true;
    elements.shiftCameraCaptureButton.disabled = false;
    return;
  }
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

function waitForVideoFrame(video, timeoutMs = 4_000) {
  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0)
    return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Video frame timeout'));
    }, timeoutMs);
    const ready = () => {
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      cleanup();
      resolve();
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('canplay', ready);
    };
    video.addEventListener('loadeddata', ready);
    video.addEventListener('canplay', ready);
  });
}

function nextAnimationFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function loadPreviewImage(image, source) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
    };
    const loaded = () => {
      cleanup();
      if (image.naturalWidth > 0 && image.naturalHeight > 0) resolve();
      else reject(new Error('Preview is empty'));
    };
    const failed = () => {
      cleanup();
      reject(new Error('Preview failed'));
    };
    image.addEventListener('load', loaded, { once: true });
    image.addEventListener('error', failed, { once: true });
    image.src = source;
  });
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
    new File([cameraAttempt.blob], `${cameraAttempt.mode.toLowerCase()}-photo.jpg`, {
      type: 'image/jpeg',
    }),
  );
  if (cameraAttempt.mode === 'TASK_STEP') {
    formData.append('taskId', selectedTaskId);
    formData.append('taskStepId', cameraAttempt.taskStepId);
    formData.append('operationId', cameraAttempt.operationId);
  } else {
    formData.append('capturedAt', new Date().toISOString());
    formData.append('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    formData.append('operationId', cameraAttempt.operationId);
  }

  try {
    const endpoint =
      cameraAttempt.mode === 'START'
        ? '/api/v1/work-shifts/start-with-photo'
        : cameraAttempt.mode === 'TASK_STEP'
          ? '/api/v1/artifacts/photos'
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

    const submittedMode = cameraAttempt.mode;
    cleanupCameraAttempt({ keepOperationId: false });
    closeModal();
    if (submittedMode === 'TASK_STEP')
      await Promise.all([reloadTaskDetails(), loadWorkerObjects(), loadHistory(true)]);
    else await refreshShiftState();
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
    taskStepId: keepOperationId ? cameraAttempt.taskStepId : null,
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

function formatRoundedCoinUnits(units) {
  const safeUnits = Number.isSafeInteger(units) ? units : 0;
  return Math.floor((safeUnits + 50) / 100)
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

async function sendHelpRequest() {
  const message = elements.helpRequestInput.value.trim();

  if (!message) {
    elements.helpRequestError.hidden = false;
    elements.helpRequestInput.focus();
    return;
  }

  if (!selectedTaskId) return showMessage('Сначала откройте задачу');
  const response = await apiFetch(`/api/v1/worker/tasks/${selectedTaskId}/help`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const body = await readResponseBody(response);
  if (!response.ok) return showMessage(getApiMessage(body) || 'Не удалось отправить сообщение');
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
