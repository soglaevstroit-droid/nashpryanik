/* global AnalystTimeline, CameraUtils, Headers, HTMLElement, File, PhotoSlider, URL, crypto, navigator, sessionStorage */

const authTokenStorageKey = 'stroit.demo.accessToken';
const legacyShiftStorageKey = 'stroit.demo.shiftOpen';
const legacyShiftStateStorageKey = 'stroit.demo.shiftState';
const workerEmail = 'ilya';
const managerPhotoMaxBytes = 8 * 1024 * 1024;
const managerPhotosMaxBytes = 96 * 1024 * 1024;
const managerPhotoMaxCount = 12;
const managerAllowedPhotoTypes = new Set(['image/jpeg', 'image/webp']);

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
let analystPollingTimer = null;
let analystLiveRequest = null;
let analystRequestGeneration = 0;
let analystLiveSignature = '';
const analystFrameIndexStore = AnalystTimeline.createIndexStore();
let selectedTaskId = null;
let selectedTask = null;
let activeWorkerTaskId = null;
let pendingTaskPause = null;
let pendingTaskResume = null;
let activeTaskHistoryArmed = false;
let workerNavigationRevision = 0;
let workerObjectsRequestId = 0;
let managerTasksRequestId = 0;
let taskListScrollY = 0;
let taskDetailActionPending = false;
let pendingCameraMode = null;
let currentSection = 'tasks';
let previousWorkingSection = 'tasks';
let managerSelectedFiles = [];
let managerPhotoPreviewUrls = [];
let managerStepCount = 0;
let managerPendingConfirmation = null;
let managerDraftOperationId = null;
let managerTaskSubmitting = false;
let managerWorkersAvailable = false;
let managerFormReturnFocus = null;
let managerConfirmReturnFocus = null;
let managerInitialObjectId = null;
let managerInitialWorkerId = null;
let managerFormMode = 'create';
let managerEditingTask = null;
let managerExistingPhotos = [];
let managerRemovedPhotoIds = [];
let managerExistingPhotoUrls = [];
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
  filePickerFallback: false,
  fileName: null,
  mimeType: 'image/jpeg',
  taskId: null,
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
  shiftCameraFileInput: document.querySelector('#shiftCameraFileInput'),
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
  analystWorkersList: document.querySelector('#analystWorkersList'),
  historyList: document.querySelector('#historyList'),
  historyHeading: document.querySelector('#historyHeading'),
  historyMoreButton: document.querySelector('#historyMoreButton'),
  taskDescription: document.querySelector('#taskDescription'),
  taskDescriptionCard: document.querySelector('#taskDescriptionCard'),
  simpleTaskActions: document.querySelector('#simpleTaskActions'),
  taskAssignee: document.querySelector('#taskAssignee'),
  taskPhotos: document.querySelector('#taskPhotos'),
  taskPauseInfo: document.querySelector('#taskPauseInfo'),
  workerMessagesList: document.querySelector('#workerMessagesList'),
  workerArchiveList: document.querySelector('#workerArchiveList'),
  taskListHeading: document.querySelector('#taskListHeading'),
  tasksNavLabel: document.querySelector('#tasksNavLabel'),
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
  managerPhotoCount: document.querySelector('#managerPhotoCount'),
  managerPhotoSize: document.querySelector('#managerPhotoSize'),
  managerPhotoError: document.querySelector('#managerPhotoError'),
  managerFormError: document.querySelector('#managerFormError'),
  managerSubmitButton: document.querySelector('#managerSubmitButton'),
  managerDialogTitle: document.querySelector('#managerTaskTitle'),
  managerDialogSubtitle: document.querySelector('.managerDialogHeader p'),
  managerReasonField: document.querySelector('#managerReasonField'),
  managerEditReason: document.querySelector('#managerEditReason'),
  managerFormConfirm: document.querySelector('#managerFormConfirm'),
  managerConfirmTitle: document.querySelector('#managerConfirmTitle'),
  managerConfirmText: document.querySelector('#managerConfirmText'),
  managerConfirmSummary: document.querySelector('#managerConfirmSummary'),
  managerConfirmSubmit: document.querySelector('[data-manager-confirm-submit]'),
  taskDetailProgressLine: document.querySelector('#taskDetailProgressLine'),
  taskDetailProgressPercent: document.querySelector('#taskDetailProgressPercent'),
  taskDetailProgressCount: document.querySelector('#taskDetailProgressCount'),
  taskDetailProgress: document.querySelector('#taskDetailProgress'),
  stepTimelineCard: document.querySelector('#stepTimelineCard'),
};

const photoSlider = new PhotoSlider({
  loadPreview: async (id) => {
    const response = await apiFetch(`/api/v1/artifacts/${id}/preview`);
    if (!response.ok) throw new Error('Photo preview is unavailable');
    return response.blob();
  },
  loadOriginal: async (id) => {
    const response = await apiFetch(`/api/v1/artifacts/${id}`);
    if (!response.ok) throw new Error('Photo is unavailable');
    return response.blob();
  },
  viewer: {
    root: document.querySelector('#photoViewer'),
    image: document.querySelector('#photoViewerImage'),
    status: document.querySelector('#photoViewerStatus'),
  },
  onLockedAttempt: notifyTaskLocked,
});

const views = {
  myWork: document.querySelector('#myWorkView'),
  analystLive: document.querySelector('#analystLiveView'),
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
elements.managerPhotos.addEventListener('change', handleManagerPhotoSelection);
elements.shiftCameraFileInput.addEventListener('change', handleCameraFileSelection);
elements.managerTaskForm.addEventListener('input', clearManagerFormError);
elements.managerTaskForm.addEventListener('keydown', (event) => {
  if (
    event.key === 'Enter' &&
    event.target.tagName !== 'TEXTAREA' &&
    event.target.tagName !== 'BUTTON'
  )
    event.preventDefault();
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
  const simpleTaskPhotoButton = event.target.closest('[data-simple-task-photo]');
  const simpleTaskCompleteButton = event.target.closest('[data-simple-task-complete]');
  const addManagerStepButton = event.target.closest('[data-add-manager-step]');
  const removeManagerStepButton = event.target.closest('[data-remove-manager-step]');
  const removeManagerPhotoButton = event.target.closest('[data-remove-manager-photo]');
  const removeExistingPhotoButton = event.target.closest('[data-remove-existing-photo]');
  const openManagerPhotosButton = event.target.closest('[data-open-manager-photos]');
  const closeManagerFormButton = event.target.closest('[data-close-manager-form]');
  const managerConfirmBackButton = event.target.closest('[data-manager-confirm-back]');
  const managerConfirmSubmitButton = event.target.closest('[data-manager-confirm-submit]');
  const managerDeleteButton = event.target.closest('[data-manager-delete]');
  const managerEditButton = event.target.closest('[data-manager-edit]');
  const moveManagerStepButton = event.target.closest('[data-move-manager-step]');
  const chooseAnotherTaskButton = event.target.closest('[data-choose-another-task]');
  const goToHistoryButton = event.target.closest('[data-go-to-history]');
  const confirmCompleteStepButton = event.target.closest('[data-confirm-complete-step]');
  const cancelCompleteStepButton = event.target.closest('[data-cancel-complete-step]');
  const confirmCompleteTaskButton = event.target.closest('[data-confirm-complete-task]');
  const cancelCompleteTaskButton = event.target.closest('[data-cancel-complete-task]');
  const finishCompleteTaskButton = event.target.closest('[data-finish-complete-task]');
  const analystRetryButton = event.target.closest('[data-analyst-retry]');
  const analystShiftButton = event.target.closest('[data-analyst-shift-id]');
  const analystHistoryBackButton = event.target.closest('[data-analyst-history-back]');
  if (sectionButton) {
    navigateSection(sectionButton.dataset.section);
    return;
  }
  if (maintenanceBackButton) {
    navigateSection(previousWorkingSection || 'tasks');
    return;
  }
  if (analystRetryButton) return loadAnalystWorkers({ initial: true });
  if (analystShiftButton) return loadAnalystShift(analystShiftButton.dataset.analystShiftId);
  if (analystHistoryBackButton) return loadAnalystHistory();
  if (addManagerStepButton) return addManagerStep({ focus: true });
  if (removeManagerStepButton)
    return removeManagerStep(removeManagerStepButton.closest('.managerStepFields'));
  if (moveManagerStepButton)
    return moveManagerStep(
      moveManagerStepButton.closest('.managerStepFields'),
      moveManagerStepButton.dataset.moveManagerStep,
    );
  if (openManagerPhotosButton) {
    elements.managerPhotos.click();
    return;
  }
  if (removeManagerPhotoButton) {
    managerSelectedFiles.splice(Number(removeManagerPhotoButton.dataset.removeManagerPhoto), 1);
    clearManagerPhotoError();
    void renderManagerPhotoPreview();
    return;
  }
  if (removeExistingPhotoButton) {
    managerRemovedPhotoIds.push(removeExistingPhotoButton.dataset.removeExistingPhoto);
    void renderManagerPhotoPreview();
    return;
  }
  if (managerConfirmBackButton) return hideManagerConfirmation();
  if (managerConfirmSubmitButton) return confirmManagerAction();
  if (closeManagerFormButton) return closeManagerForm();
  if (managerDeleteButton) return deleteManagerTask();
  if (managerEditButton) return openManagerTaskForm(selectedTask);
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

  if (simpleTaskPhotoButton) {
    openSimpleTaskCamera(false);
    return;
  }

  if (simpleTaskCompleteButton) {
    openSimpleTaskCamera(true);
    return;
  }

  if (backToTasksButton) {
    if (hasActiveWorkerTask()) {
      await requestActiveTaskExit();
      return;
    }
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
    pendingTaskPause = null;
    pendingTaskResume = null;
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

    if (pendingTaskPause) {
      await confirmSelectedTaskPause();
      return;
    }

    if (pendingTaskResume) {
      await confirmWorkerTaskResume();
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
  if (modals.managerTask.classList.contains('is-active')) {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!elements.managerFormConfirm.hidden) hideManagerConfirmation();
      else closeManagerForm();
      return;
    }
    if (event.key === 'Tab') {
      trapManagerDialogFocus(event);
      return;
    }
  }
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
window.addEventListener('popstate', () => {
  if (!hasActiveWorkerTask()) return;
  armActiveTaskHistory();
  void requestActiveTaskExit();
});
window.addEventListener('pageshow', (event) => {
  if (accessToken && (event.persisted || isAnalyst())) void refreshCurrentWorkspace();
});
window.addEventListener('focus', () => {
  if (accessToken && isAnalyst()) void refreshCurrentWorkspace();
});

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
  try {
    const response = await apiFetch('/api/v1/auth/me');
    const body = await readResponseBody(response);

    if (!response.ok) {
      if (response.status === 401) handleUnauthorized();
      else showMessage('Не удалось восстановить сессию. Обновите страницу и повторите попытку.');
      return false;
    }

    currentUser = body;
    return showWorkspace();
  } catch {
    showMessage('Backend недоступен. Проверьте соединение и повторите попытку.');
    return false;
  }
}

async function showWorkspace() {
  if (!accessToken) {
    return false;
  }

  if (isManager()) {
    stopAnalystPolling();
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

  if (isAnalyst()) {
    configureBottomNavigation();
    elements.userInfo.textContent = currentUser.name ?? 'Аналитик';
    elements.loginScreen.hidden = true;
    elements.loginScreen.classList.remove('is-active');
    elements.workspaceScreen.hidden = false;
    currentSection = 'tasks';
    previousWorkingSection = 'tasks';
    openView('analystLive');
    updateBottomNavigation();
    await loadAnalystWorkers({ initial: true });
    startAnalystPolling();
    return true;
  }

  if (!isWorker()) {
    stopAnalystPolling();
    configureBottomNavigation();
    elements.userInfo.textContent = currentUser?.name ?? currentUser?.role ?? 'Пользователь';
    elements.loginScreen.hidden = true;
    elements.loginScreen.classList.remove('is-active');
    elements.workspaceScreen.hidden = false;
    currentSection = 'tasks';
    previousWorkingSection = 'tasks';
    openView('maintenance');
    updateBottomNavigation();
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
  if (hasActiveWorkerTask()) await ensureActiveWorkerTaskOpen();
  else navigateSection('tasks');
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

  if (hasActiveWorkerTask() && !taskFlowViews.includes(name)) {
    name = 'taskDetail';
    if (selectedTaskId !== activeWorkerTaskId) void ensureActiveWorkerTaskOpen();
  }

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
  if (hasActiveWorkerTask()) {
    void ensureActiveWorkerTaskOpen();
    return;
  }
  if (isAnalyst()) {
    if (section === 'tasks') {
      currentSection = 'tasks';
      previousWorkingSection = 'tasks';
      openView('analystLive', { preserveScroll: true });
      void loadAnalystWorkers();
    } else if (section === 'history') {
      currentSection = 'history';
      previousWorkingSection = 'history';
      openView('history');
    } else {
      currentSection = section;
      openView('maintenance');
    }
    updateBottomNavigation();
    return;
  }
  if (!isManager() && !isWorker()) {
    currentSection = section;
    openView('maintenance');
    updateBottomNavigation();
    return;
  }
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

function isWorker() {
  return currentUser?.role === 'WORKER';
}

function isAnalyst() {
  return currentUser?.role === 'ANALYST';
}

function hasActiveWorkerTask() {
  return isWorker() && isShiftOpen() && Boolean(activeWorkerTaskId);
}

async function ensureActiveWorkerTaskOpen() {
  if (!hasActiveWorkerTask()) return false;
  if (
    selectedTaskId === activeWorkerTaskId &&
    selectedTask?.status === 'IN_PROGRESS' &&
    views.taskDetail.classList.contains('is-active')
  ) {
    armActiveTaskHistory();
    return true;
  }
  await openTaskDetails(activeWorkerTaskId, { preserveListScroll: true });
  return true;
}

function findConfirmedActiveWorkerTask(tasks) {
  const activeTasks = tasks.filter(
    (task) => task?.status === 'IN_PROGRESS' && task.accessStatus === 'OPEN' && !task.deletedAt,
  );
  return activeTasks.length === 1 ? activeTasks[0] : null;
}

function setActiveWorkerTask(taskId) {
  const nextTaskId = taskId || null;
  if (activeWorkerTaskId === nextTaskId) {
    if (!nextTaskId) releaseActiveTaskHistory();
    return;
  }
  releaseActiveTaskHistory();
  activeWorkerTaskId = nextTaskId;
  workerNavigationRevision += 1;
}

function clearSelectedWorkerTask() {
  photoSlider.clear(views.taskDetail);
  selectedTask = null;
  selectedTaskId = null;
}

function clearActiveWorkerTaskState({ clearSelection = false } = {}) {
  workerObjectsRequestId += 1;
  setActiveWorkerTask(null);
  pendingTaskPause = null;
  pendingTaskResume = null;
  if (clearSelection) clearSelectedWorkerTask();
}

function armActiveTaskHistory() {
  if (!hasActiveWorkerTask()) return;
  const state =
    window.history.state && typeof window.history.state === 'object'
      ? { ...window.history.state }
      : {};
  if (activeTaskHistoryArmed && state.activeWorkerTaskId === activeWorkerTaskId) return;
  if (!activeTaskHistoryArmed && state.activeWorkerTaskId === activeWorkerTaskId) {
    delete state.activeWorkerTaskId;
    window.history.replaceState(state, '', window.location.href);
  }
  window.history.pushState({ ...state, activeWorkerTaskId }, '', window.location.href);
  activeTaskHistoryArmed = true;
}

function releaseActiveTaskHistory() {
  const state =
    window.history.state && typeof window.history.state === 'object'
      ? { ...window.history.state }
      : {};
  if ('activeWorkerTaskId' in state) {
    delete state.activeWorkerTaskId;
    window.history.replaceState(state, '', window.location.href);
  }
  activeTaskHistoryArmed = false;
}

async function restoreWorkerWorkspace() {
  if (!isWorker()) return true;
  if (!(await refreshShiftState())) return false;
  if (!(await loadWorkerObjects())) return false;
  if (hasActiveWorkerTask()) await ensureActiveWorkerTaskOpen();
  else {
    clearSelectedWorkerTask();
    currentSection = 'tasks';
    previousWorkingSection = 'tasks';
    openView('myWork', { preserveScroll: true });
    updateBottomNavigation();
  }
  return true;
}

async function refreshCurrentWorkspace() {
  if (isWorker()) return restoreWorkerWorkspace();
  if (isAnalyst()) {
    if (currentSection === 'history') return loadAnalystHistory();
    return loadAnalystWorkers();
  }
  if (!isManager()) return true;
  const loaded = await loadManagerTasks();
  if (selectedTaskId && views.taskDetail.classList.contains('is-active')) await reloadTaskDetails();
  if (currentSection === 'messages') await loadManagerMessages();
  return loaded;
}

function configureBottomNavigation() {
  const manager = isManager();
  const analyst = isAnalyst();
  const expectedSections = analyst
    ? ['tasks', 'history', 'profile']
    : ['tasks', 'messages', 'order', 'history', 'profile'];
  const buttons = Array.from(document.querySelectorAll('.bottomNav [data-section]'));

  for (const [index, button] of buttons.entries()) {
    button.hidden = !expectedSections.includes(button.dataset.section);
    button.style.order = String(expectedSections.indexOf(button.dataset.section));
    button.dataset.menuRole = currentUser?.role ?? '';
    if (button.dataset.section === 'history') {
      button.setAttribute(
        'aria-label',
        manager || analyst ? 'Открыть историю сотрудников' : 'История — технические работы',
      );
    }
    if (index >= expectedSections.length) button.hidden = true;
  }

  elements.workspaceScreen.classList.toggle('manager-mode', manager);
  elements.workspaceScreen.classList.toggle('analyst-mode', analyst);
  elements.tasksNavLabel.textContent = analyst ? 'Сотрудники' : 'Задачи';
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
  elements.modalLayer.classList.toggle('is-manager-task-modal', name === 'managerTask');
  elements.helpRequestInput.value = '';
  elements.helpRequestError.hidden = true;

  for (const [modalName, modal] of Object.entries(modals)) {
    modal.classList.toggle('is-active', modalName === name);
    modal.classList.remove('is-closing');
  }

  elements.modalLayer.hidden = false;
  if (name === 'managerTask')
    window.requestAnimationFrame(() => modals.managerTask.focus({ preventScroll: true }));
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
    elements.modalLayer.classList.remove(
      'is-closing',
      'is-task-status-modal',
      'is-camera-modal',
      'is-manager-task-modal',
    );

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
    if (elements.workspaceScreen.classList.contains('is-task-flow') && !hasActiveWorkerTask()) {
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
  if (!document.hidden && accessToken) {
    void refreshCurrentWorkspace();
    if (isAnalyst()) startAnalystPolling();
  } else if (isAnalyst()) stopAnalystPolling();
});

function startAnalystPolling() {
  stopAnalystPolling();
  if (!isAnalyst() || document.hidden) return;
  analystPollingTimer = window.setTimeout(async () => {
    await loadAnalystWorkers();
    startAnalystPolling();
  }, 20_000);
}

function stopAnalystPolling() {
  if (analystPollingTimer !== null) window.clearTimeout(analystPollingTimer);
  analystPollingTimer = null;
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

async function loadWorkerObjects() {
  const requestId = ++workerObjectsRequestId;
  elements.workerObjectsList.innerHTML = '<p>Загружаем задачи…</p>';
  try {
    const response = await apiFetch('/api/v1/worker/objects');
    const groups = await readResponseBody(response);
    if (!response.ok) throw new Error(getApiMessage(groups));
    if (requestId !== workerObjectsRequestId) return false;
    const tasks = groups.flatMap((group) => group.tasks);
    const activeTask = findConfirmedActiveWorkerTask(tasks);
    setActiveWorkerTask(activeTask?.id ?? null);
    const total = tasks.length;
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
    return true;
  } catch {
    if (requestId !== workerObjectsRequestId) return false;
    elements.workerObjectsList.innerHTML =
      '<div class="emptyObject"><p>Не удалось загрузить задачи. Повторить</p><button class="secondaryButton" type="button" data-reload-worker-tasks>Повторить</button></div>';
    elements.workerObjectsList
      .querySelector('[data-reload-worker-tasks]')
      ?.addEventListener('click', loadWorkerObjects);
    return false;
  }
}

async function loadManagerTasks() {
  const requestId = ++managerTasksRequestId;
  elements.workerObjectsList.innerHTML = '<p>Загружаем задачи…</p>';
  try {
    const response = await apiFetch('/api/v1/manager/tasks');
    const tasks = await readResponseBody(response);
    if (requestId !== managerTasksRequestId) return false;
    if (!response.ok) throw new Error();
    elements.workerObjectsList.innerHTML = tasks.length
      ? tasks
          .map((task) => renderTaskCard(task, task.object ?? { name: 'Объект не указан' }))
          .join('')
      : '<div class="emptyObject"><p>Активных задач пока нет</p></div>';
    photoSlider.mount(elements.workerObjectsList);
    return true;
  } catch {
    if (requestId !== managerTasksRequestId) return false;
    elements.workerObjectsList.innerHTML =
      '<div class="emptyObject"><p>Не удалось загрузить задачи</p></div>';
    return false;
  }
}

async function openManagerTaskForm(task = null) {
  managerFormReturnFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : elements.orderNavButton;
  let objectsResponse;
  let workersResponse;
  try {
    [objectsResponse, workersResponse] = await Promise.all([
      apiFetch('/api/v1/manager/objects'),
      apiFetch('/api/v1/manager/workers'),
    ]);
  } catch {
    currentSection = 'tasks';
    updateBottomNavigation();
    showMessage('Не удалось загрузить форму. Проверьте соединение и повторите попытку.');
    return;
  }
  const objects = await readResponseBody(objectsResponse);
  const workers = await readResponseBody(workersResponse);
  if (!objectsResponse.ok || !workersResponse.ok) return showMessage('Не удалось загрузить форму');
  elements.managerObject.innerHTML = objects
    .map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`)
    .join('');
  elements.managerWorker.innerHTML = [
    '<option value="">Без ответственного</option>',
    ...workers.map(
      (item) => `<option value="${item.id}">${escapeHtml(item.name || item.email)}</option>`,
    ),
  ].join('');
  managerWorkersAvailable = true;
  clearManagerPhotoPreviews();
  elements.managerTaskForm.reset();
  elements.managerTaskForm.classList.remove('was-validated');
  managerInitialObjectId = elements.managerObject.value;
  managerInitialWorkerId = elements.managerWorker.value;
  managerSelectedFiles = [];
  managerFormMode = task ? 'edit' : 'create';
  managerEditingTask = task ? JSON.parse(JSON.stringify(task)) : null;
  managerExistingPhotos = task ? task.photos.filter((photo) => !photo.taskStepId) : [];
  managerRemovedPhotoIds = [];
  managerDraftOperationId = crypto.randomUUID();
  managerTaskSubmitting = false;
  managerPendingConfirmation = null;
  elements.managerFormConfirm.hidden = true;
  clearManagerFormError();
  clearManagerPhotoError();
  managerStepCount = 0;
  elements.managerSteps.innerHTML = '';
  elements.managerDialogTitle.textContent = task ? 'Редактировать задачу' : 'Поставить задачу';
  elements.managerDialogSubtitle.textContent = task
    ? 'Внесите необходимые изменения'
    : 'Создайте новую задачу для монтажника';
  elements.managerTaskForm
    .querySelector('[data-close-manager-form]')
    .setAttribute(
      'aria-label',
      task ? 'Закрыть форму редактирования задачи' : 'Закрыть форму постановки задачи',
    );
  elements.managerReasonField.hidden =
    !task || !['ACCEPTED', 'IN_PROGRESS', 'PAUSED'].includes(task.status);
  elements.managerEditReason.required = !elements.managerReasonField.hidden;
  elements.managerEditReason.setAttribute(
    'aria-required',
    String(elements.managerEditReason.required),
  );
  if (task) {
    elements.managerObject.value = task.objectId ?? '';
    elements.managerWorker.value = task.assigneeId ?? '';
    document.querySelector('#managerLocation').value = task.location ?? '';
    document.querySelector('#managerTitle').value = task.title ?? '';
    document.querySelector('#managerDescription').value = task.description ?? '';
    document.querySelector('#managerPosition').value = String(task.position ?? 1);
    elements.managerTaskForm.querySelector(
      `input[name="managerPriority"][value="${task.priority}"]`,
    ).checked = true;
    elements.managerTaskForm.querySelector(
      `input[name="managerAccess"][value="${task.accessStatus}"]`,
    ).checked = true;
    if (['ACCEPTED', 'IN_PROGRESS', 'PAUSED'].includes(task.status))
      elements.managerObject.disabled = true;
    if (task.status === 'IN_PROGRESS') elements.managerWorker.disabled = true;
    task.steps.forEach((step) => addManagerStep({ focus: false, step }));
  }
  await renderManagerPhotoPreview();
  setManagerSubmitting(false);
  openModal('managerTask');
}

function addManagerStep({ focus = true, step = null } = {}) {
  managerStepCount += 1;
  const fieldId = `managerStep-${managerStepCount}`;
  elements.managerSteps.insertAdjacentHTML(
    'beforeend',
    `<article class="managerStepFields ${step?.status === 'COMPLETED' ? 'is-readonly' : ''}" data-manager-step-card data-step-id="${step?.id ?? ''}" data-step-status="${step?.status ?? 'NEW'}">
      <header class="managerStepHeader">
        <div><span class="managerStepNumber">${managerStepCount}</span><strong>Этап <span data-manager-step-order>${managerStepCount}</span></strong></div>
        <div class="managerStepTools">
          <button type="button" class="managerMoveStepButton" data-move-manager-step="up" aria-label="Переместить этап выше">↑</button>
          <button type="button" class="managerMoveStepButton" data-move-manager-step="down" aria-label="Переместить этап ниже">↓</button>
          <button type="button" class="managerRemoveStepButton" data-remove-manager-step aria-label="Удалить этап ${managerStepCount}"><span aria-hidden="true">⌫</span></button>
        </div>
      </header>
      <label class="managerField" for="${fieldId}-title">
        <span class="managerFieldLabel">Название этапа <i class="requiredMark" aria-hidden="true">*</i></span>
        <input id="${fieldId}-title" data-manager-step-title required aria-required="true" placeholder="Название этапа" value="${escapeHtml(step?.title ?? '')}" ${step?.status === 'COMPLETED' ? 'readonly' : ''} />
      </label>
      <label class="managerField" for="${fieldId}-description">
        <span class="managerFieldLabel">Описание работ <i class="requiredMark" aria-hidden="true">*</i></span>
        <textarea id="${fieldId}-description" data-manager-step-description required aria-required="true" placeholder="Описание работ на этапе…" ${step?.status === 'COMPLETED' ? 'readonly' : ''}>${escapeHtml(step?.description ?? '')}</textarea>
      </label>
      ${step?.status === 'COMPLETED' ? '<small class="managerStepReadonlyNote">Выполненный этап защищён от изменений</small>' : ''}
    </article>`,
  );
  renumberManagerSteps();
  const card = elements.managerSteps.lastElementChild;
  if (focus && card) {
    window.requestAnimationFrame(() => {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.querySelector('[data-manager-step-title]')?.focus({ preventScroll: true });
    });
  }
}

function removeManagerStep(step) {
  if (!step) return;
  const title = step.querySelector('[data-manager-step-title]')?.value.trim();
  const description = step.querySelector('[data-manager-step-description]')?.value.trim();
  if (title || description) {
    const order = step.querySelector('[data-manager-step-order]')?.textContent ?? '';
    showManagerConfirmation({
      type: 'deleteStep',
      title: 'Удалить этап?',
      text:
        step.dataset.stepStatus === 'IN_PROGRESS'
          ? 'Этап находится в работе. Его удаление изменит текущий рабочий процесс сотрудника. Укажите причину изменений перед сохранением.'
          : 'Введённые данные этого этапа будут удалены.',
      summaryRows: [['Этап', order], ...(title ? [['Название', title]] : [])],
      confirmLabel: 'Удалить этап',
      backLabel: 'Отмена',
      danger: true,
      step,
    });
    return;
  }
  removeManagerStepImmediately(step);
}

function removeManagerStepImmediately(step) {
  step.remove();
  renumberManagerSteps();
}

function renumberManagerSteps() {
  const cards = [...elements.managerSteps.children];
  cards.forEach((step, index) => {
    const order = index + 1;
    step.querySelector('[data-manager-step-order]').textContent = order;
    step.querySelector('.managerStepNumber').textContent = order;
    const removeButton = step.querySelector('[data-remove-manager-step]');
    const isCompleted = step.dataset.stepStatus === 'COMPLETED';
    removeButton.hidden = isCompleted;
    removeButton.setAttribute('aria-label', `Удалить этап ${order}`);
    const current = cards.find((candidate) => candidate.dataset.stepStatus === 'IN_PROGRESS');
    const moveable = managerFormMode === 'edit' && !isCompleted && step !== current;
    const futureCards = cards.filter(
      (candidate) => candidate.dataset.stepStatus !== 'COMPLETED' && candidate !== current,
    );
    const futureIndex = futureCards.indexOf(step);
    const [up, down] = step.querySelectorAll('[data-move-manager-step]');
    up.hidden = !moveable;
    down.hidden = !moveable;
    up.disabled = futureIndex <= 0;
    down.disabled = futureIndex < 0 || futureIndex >= futureCards.length - 1;
  });
}

function moveManagerStep(step, direction) {
  if (!step || step.dataset.stepStatus === 'COMPLETED' || step.dataset.stepStatus === 'IN_PROGRESS')
    return;
  const cards = [...elements.managerSteps.children];
  const moveable = cards.filter(
    (candidate) => !['COMPLETED', 'IN_PROGRESS'].includes(candidate.dataset.stepStatus),
  );
  const index = moveable.indexOf(step);
  const target = moveable[index + (direction === 'up' ? -1 : 1)];
  if (!target) return;
  if (direction === 'up') elements.managerSteps.insertBefore(step, target);
  else elements.managerSteps.insertBefore(target, step);
  renumberManagerSteps();
}

function handleManagerPhotoSelection() {
  clearManagerPhotoError();
  const selected = Array.from(elements.managerPhotos.files ?? []);
  elements.managerPhotos.value = '';
  if (!selected.length) return;
  const unsupported = selected.find((file) => !managerAllowedPhotoTypes.has(file.type));
  if (unsupported) {
    showManagerPhotoError(`Файл «${unsupported.name}» не поддерживается. Выберите JPEG или WebP.`);
    return;
  }
  const oversized = selected.find((file) => file.size > managerPhotoMaxBytes);
  if (oversized) {
    showManagerPhotoError(`Фото «${oversized.name}» превышает лимит 8 МБ.`);
    return;
  }
  const nextFiles = [...managerSelectedFiles, ...selected];
  if (nextFiles.length > managerPhotoMaxCount) {
    showManagerPhotoError(`Можно добавить не более ${managerPhotoMaxCount} фотографий.`);
    return;
  }
  const totalSize = nextFiles.reduce((total, file) => total + file.size, 0);
  if (totalSize > managerPhotosMaxBytes) {
    showManagerPhotoError('Общий размер фотографий превышает лимит 96 МБ.');
    return;
  }
  managerSelectedFiles = nextFiles;
  void renderManagerPhotoPreview();
}

async function renderManagerPhotoPreview() {
  clearManagerPhotoPreviews();
  managerPhotoPreviewUrls = managerSelectedFiles.map((file) => URL.createObjectURL(file));
  const visibleExisting = managerExistingPhotos.filter(
    (photo) => !managerRemovedPhotoIds.includes(photo.id),
  );
  const existingPreviews = await Promise.all(
    visibleExisting.map(async (photo) => {
      try {
        const response = await apiFetch(`/api/v1/artifacts/${photo.id}`);
        if (!response.ok) return null;
        const url = URL.createObjectURL(await response.blob());
        managerExistingPhotoUrls.push(url);
        return url;
      } catch {
        return null;
      }
    }),
  );
  const existingHtml = visibleExisting
    .map(
      (photo, index) =>
        `<figure>${existingPreviews[index] ? `<img src="${existingPreviews[index]}" alt="Исходное фото: ${escapeHtml(photo.originalFileName)}" />` : '<span class="managerPhotoUnavailable">Фото недоступно</span>'}<figcaption title="${escapeHtml(photo.originalFileName)}">${escapeHtml(photo.originalFileName)}</figcaption><button type="button" data-remove-existing-photo="${photo.id}" aria-label="Убрать исходное фото ${index + 1}">×</button></figure>`,
    )
    .join('');
  const newHtml = managerSelectedFiles
    .map(
      (file, index) =>
        `<figure><img src="${managerPhotoPreviewUrls[index]}" alt="Предпросмотр: ${escapeHtml(file.name)}" /><figcaption title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</figcaption><button type="button" data-remove-manager-photo="${index}" aria-label="Удалить фото ${index + 1}">×</button></figure>`,
    )
    .join('');
  elements.managerPhotoPreview.innerHTML = existingHtml + newHtml;
  elements.managerPhotoPreview.hidden = !visibleExisting.length && !managerSelectedFiles.length;
  const totalSize = managerSelectedFiles.reduce((total, file) => total + file.size, 0);
  elements.managerPhotoCount.textContent = `Фото: ${visibleExisting.length + managerSelectedFiles.length} (новых ${managerSelectedFiles.length})`;
  elements.managerPhotoSize.textContent = formatManagerFileSize(totalSize);
}

function clearManagerPhotoPreviews() {
  for (const url of managerPhotoPreviewUrls) URL.revokeObjectURL(url);
  for (const url of managerExistingPhotoUrls) URL.revokeObjectURL(url);
  managerPhotoPreviewUrls = [];
  managerExistingPhotoUrls = [];
}

function formatManagerFileSize(bytes) {
  if (!bytes) return '0 МБ';
  return `${(bytes / 1024 / 1024).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ`;
}

function showManagerPhotoError(message) {
  elements.managerPhotoError.textContent = message;
  elements.managerPhotoError.hidden = false;
}

function clearManagerPhotoError() {
  elements.managerPhotoError.textContent = '';
  elements.managerPhotoError.hidden = true;
}

function closeManagerForm() {
  if (managerTaskSubmitting) return;
  if (isManagerFormDirty()) {
    showManagerConfirmation({
      type: 'discard',
      title: 'Закрыть форму?',
      text: 'Введённые данные будут потеряны.',
      confirmLabel: 'Закрыть',
      backLabel: 'Продолжить заполнение',
      danger: true,
    });
    return;
  }
  finishManagerForm();
}

function isManagerFormDirty() {
  if (managerFormMode === 'edit') return buildManagerEditChanges().length > 0;
  const hasText = [
    '#managerLocation',
    '#managerTitle',
    '#managerDescription',
    '[data-manager-step-title]',
    '[data-manager-step-description]',
  ].some((selector) => elements.managerTaskForm.querySelector(selector)?.value.trim());
  const priority = new FormData(elements.managerTaskForm).get('managerPriority');
  const access = new FormData(elements.managerTaskForm).get('managerAccess');
  const position = document.querySelector('#managerPosition').value;
  return Boolean(
    hasText ||
    managerSelectedFiles.length ||
    elements.managerSteps.children.length > 1 ||
    priority !== 'NORMAL' ||
    access !== 'OPEN' ||
    position !== '1' ||
    elements.managerObject.value !== managerInitialObjectId ||
    elements.managerWorker.value !== managerInitialWorkerId,
  );
}

function finishManagerForm() {
  hideManagerConfirmation({ restoreFocus: false });
  clearManagerPhotoPreviews();
  managerSelectedFiles = [];
  managerDraftOperationId = null;
  managerTaskSubmitting = false;
  managerInitialObjectId = null;
  managerInitialWorkerId = null;
  managerFormMode = 'create';
  managerEditingTask = null;
  managerExistingPhotos = [];
  managerRemovedPhotoIds = [];
  closeModal();
  currentSection = 'tasks';
  updateBottomNavigation();
  const returnFocus = managerFormReturnFocus ?? elements.orderNavButton;
  managerFormReturnFocus = null;
  window.setTimeout(() => returnFocus?.focus({ preventScroll: true }), 210);
}

async function submitManagerTask(event) {
  event.preventDefault();
  if (managerTaskSubmitting) return;
  clearManagerFormError();
  const titleInput = document.querySelector('#managerTitle');
  const descriptionInput = document.querySelector('#managerDescription');
  const locationInput = document.querySelector('#managerLocation');
  const positionInput = document.querySelector('#managerPosition');
  locationInput.setCustomValidity(locationInput.value.trim() ? '' : 'Укажите место выполнения.');
  titleInput.setCustomValidity(
    titleInput.value.trim().length >= 3 ? '' : 'Введите минимум 3 символа.',
  );
  descriptionInput.setCustomValidity(
    descriptionInput.value.trim() ? '' : 'Опишите, что нужно выполнить.',
  );
  const position = Number(positionInput.value);
  positionInput.setCustomValidity(
    Number.isInteger(position) && position > 0 ? '' : 'Введите положительное целое число.',
  );
  for (const step of elements.managerSteps.children) {
    const stepTitle = step.querySelector('[data-manager-step-title]');
    const stepDescription = step.querySelector('[data-manager-step-description]');
    stepTitle.setCustomValidity(stepTitle.value.trim() ? '' : 'Укажите название этапа.');
    stepDescription.setCustomValidity(
      stepDescription.value.trim() ? '' : 'Добавьте описание работ на этапе.',
    );
  }
  elements.managerTaskForm.classList.add('was-validated');
  if (!elements.managerTaskForm.checkValidity()) {
    elements.managerTaskForm.reportValidity();
    elements.managerTaskForm.querySelector(':invalid')?.focus();
    return;
  }
  const steps = [...elements.managerSteps.children].map((step) => ({
    ...(step.dataset.stepId ? { id: step.dataset.stepId } : {}),
    title: step.querySelector('[data-manager-step-title]').value.trim(),
    description: step.querySelector('[data-manager-step-description]').value.trim(),
  }));
  const payload = {
    operationId: managerDraftOperationId ?? crypto.randomUUID(),
    objectId: elements.managerObject.value,
    assigneeId: elements.managerWorker.value || null,
    title: titleInput.value.trim(),
    description: descriptionInput.value.trim(),
    location: document.querySelector('#managerLocation').value.trim(),
    priority: new FormData(elements.managerTaskForm).get('managerPriority'),
    accessStatus: new FormData(elements.managerTaskForm).get('managerAccess'),
    position,
    steps,
    ...(managerFormMode === 'edit'
      ? {
          updatedAt: managerEditingTask.updatedAt,
          reason: elements.managerEditReason.value.trim(),
          removedPhotoIds: managerRemovedPhotoIds,
        }
      : {}),
  };
  const objectName = elements.managerObject.selectedOptions[0]?.textContent.trim() ?? '—';
  const workerName =
    elements.managerWorker.selectedOptions[0]?.textContent.trim() ?? 'Без ответственного';
  const editChanges = managerFormMode === 'edit' ? buildManagerEditChanges(payload) : [];
  if (managerFormMode === 'edit' && !editChanges.length) {
    showMessage('Изменений нет.');
    return;
  }
  showManagerConfirmation({
    type: 'submitTask',
    title: managerFormMode === 'edit' ? 'Сохранить изменения?' : 'Поставить задачу?',
    text:
      managerFormMode === 'edit'
        ? 'Сотрудник получит уведомление с причиной и перечнем изменений.'
        : 'Проверьте параметры перед отправкой монтажнику.',
    summaryRows:
      managerFormMode === 'edit'
        ? editChanges.map((change) => ['Изменение', change])
        : [
            ['Объект', objectName],
            ['Место', payload.location],
            ['Название', payload.title],
            ['Исполнитель', workerName],
            ['Фотографии', String(managerSelectedFiles.length)],
            ['Этапы', String(steps.length)],
            ['Приоритет', payload.priority === 'URGENT' ? 'Срочная' : 'Обычная'],
            ['Доступ', payload.accessStatus === 'CLOSED' ? 'Закрытая' : 'Открытая'],
            ['Позиция', String(payload.position)],
          ],
    confirmLabel: managerFormMode === 'edit' ? 'Сохранить изменения' : 'Да, поставить',
    backLabel: 'Вернуться',
    payload,
  });
}

async function sendManagerTask(payload) {
  const oversizedPhoto = managerSelectedFiles.find((file) => file.size > managerPhotoMaxBytes);
  if (oversizedPhoto) {
    showManagerPhotoError(`Фото «${oversizedPhoto.name}» превышает лимит 8 МБ.`);
    return;
  }
  const photosSize = managerSelectedFiles.reduce((total, file) => total + file.size, 0);
  if (photosSize > managerPhotosMaxBytes) {
    showManagerPhotoError('Общий размер фотографий превышает лимит 96 МБ.');
    return;
  }
  setManagerSubmitting(true);
  const data = new FormData();
  data.append('payload', JSON.stringify(payload));
  managerSelectedFiles.forEach((file) => data.append('photos', file));
  let response;
  let body;
  try {
    const editing = managerFormMode === 'edit';
    response = await apiFetch(
      editing ? `/api/v1/manager/tasks/${managerEditingTask.id}/edit` : '/api/v1/manager/tasks',
      { method: editing ? 'PATCH' : 'POST', body: data },
    );
    body = await readResponseBody(response);
  } catch {
    setManagerSubmitting(false);
    showManagerFormError('Не удалось отправить задачу. Проверьте соединение и повторите попытку.');
    return;
  }
  if (response.status === 409 && getApiMessage(body)?.includes('уже есть задача')) {
    setManagerSubmitting(false);
    showManagerConfirmation({
      type: 'forceUrgent',
      title: 'У сотрудника есть задача в работе',
      text: `${getApiMessage(body)} Всё равно поставить срочную задачу?`,
      confirmLabel: 'Всё равно поставить',
      backLabel: 'Вернуться',
      payload,
    });
    return;
  }
  if (!response.ok) {
    setManagerSubmitting(false);
    showManagerFormError(managerTaskApiError(response.status, body));
    return;
  }
  const editing = managerFormMode === 'edit';
  finishManagerForm();
  await loadManagerTasks();
  if (editing && selectedTaskId) await reloadTaskDetails();
  showMessage(editing ? 'Изменения сохранены. Сотрудник уведомлён.' : 'Задача поставлена');
}

function managerTaskApiError(status, body) {
  if (status === 413)
    return 'Фотографии превышают допустимый общий размер. Удалите часть файлов или выберите изображения меньшего размера.';
  const message = getApiMessage(body);
  if (message && !/<[a-z][\s\S]*>/i.test(message)) return message;
  return managerFormMode === 'edit'
    ? 'Не удалось сохранить изменения. Проверьте соединение и повторите попытку.'
    : 'Не удалось поставить задачу. Проверьте соединение и повторите попытку.';
}

function setManagerSubmitting(submitting) {
  managerTaskSubmitting = submitting;
  for (const control of elements.managerTaskForm.querySelectorAll(
    'input, select, textarea, button',
  ))
    control.disabled = submitting;
  if (!submitting && managerFormMode === 'edit' && managerEditingTask) {
    if (['ACCEPTED', 'IN_PROGRESS', 'PAUSED'].includes(managerEditingTask.status))
      elements.managerObject.disabled = true;
    if (managerEditingTask.status === 'IN_PROGRESS') elements.managerWorker.disabled = true;
  }
  elements.managerSubmitButton.disabled = submitting || !managerWorkersAvailable;
  elements.managerSubmitButton.classList.toggle('is-loading', submitting);
  elements.managerSubmitButton.querySelector('[data-manager-submit-text]').textContent = submitting
    ? managerFormMode === 'edit'
      ? 'Сохраняем изменения…'
      : 'Создаём задачу…'
    : managerFormMode === 'edit'
      ? 'Сохранить изменения'
      : 'Поставить задачу';
}

function buildManagerEditChanges(payload = null) {
  if (!managerEditingTask) return [];
  const current = payload ?? {
    objectId: elements.managerObject.value,
    assigneeId: elements.managerWorker.value || null,
    title: document.querySelector('#managerTitle').value.trim(),
    description: document.querySelector('#managerDescription').value.trim(),
    location: document.querySelector('#managerLocation').value.trim(),
    priority: new FormData(elements.managerTaskForm).get('managerPriority'),
    accessStatus: new FormData(elements.managerTaskForm).get('managerAccess'),
    position: Number(document.querySelector('#managerPosition').value),
    steps: [...elements.managerSteps.children].map((step) => ({
      ...(step.dataset.stepId ? { id: step.dataset.stepId } : {}),
      title: step.querySelector('[data-manager-step-title]').value.trim(),
      description: step.querySelector('[data-manager-step-description]').value.trim(),
    })),
  };
  const changes = [];
  const fields = [
    ['title', 'Название задачи изменено'],
    ['description', 'Описание задачи изменено'],
    ['location', 'Место выполнения изменено'],
    ['objectId', 'Объект изменён'],
    ['assigneeId', 'Исполнитель изменён'],
    ['priority', 'Приоритет изменён'],
    ['accessStatus', 'Доступ изменён'],
    ['position', 'Позиция задачи изменена'],
  ];
  for (const [field, label] of fields)
    if ((managerEditingTask[field] ?? '') !== (current[field] ?? '')) changes.push(label);
  const originalSteps = managerEditingTask.steps.map((step) => ({
    id: step.id,
    title: step.title,
    description: step.description ?? '',
  }));
  const currentSteps = current.steps.map((step) => ({
    id: step.id ?? null,
    title: step.title,
    description: step.description ?? '',
  }));
  if (JSON.stringify(originalSteps) !== JSON.stringify(currentSteps))
    changes.push('Состав, описание или порядок этапов изменены');
  if (managerSelectedFiles.length)
    changes.push(`Добавлено фотографий: ${managerSelectedFiles.length}`);
  if (managerRemovedPhotoIds.length)
    changes.push(`Удалено исходных фотографий: ${managerRemovedPhotoIds.length}`);
  return [...new Set(changes)];
}

function showManagerFormError(message) {
  elements.managerFormError.textContent = message;
  elements.managerFormError.hidden = false;
  elements.managerFormError.scrollIntoView({ behavior: 'smooth', block: 'center' });
  elements.managerFormError.focus?.();
}

function clearManagerFormError(event) {
  if (event?.target?.setCustomValidity) event.target.setCustomValidity('');
  elements.managerFormError.textContent = '';
  elements.managerFormError.hidden = true;
}

function showManagerConfirmation(options) {
  managerConfirmReturnFocus = document.activeElement;
  managerPendingConfirmation = options;
  elements.managerConfirmTitle.textContent = options.title;
  elements.managerConfirmText.textContent = options.text;
  elements.managerConfirmSummary.hidden = !options.summaryRows?.length;
  elements.managerConfirmSummary.innerHTML = options.summaryRows?.length
    ? `<dl>${options.summaryRows
        .map(
          ([label, value]) =>
            `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || '—')}</dd></div>`,
        )
        .join('')}</dl>`
    : '';
  const backButton = elements.managerFormConfirm.querySelector('[data-manager-confirm-back]');
  backButton.textContent = options.backLabel ?? 'Вернуться';
  elements.managerConfirmSubmit.textContent = options.confirmLabel ?? 'Подтвердить';
  elements.managerConfirmSubmit.classList.toggle('is-danger', Boolean(options.danger));
  elements.managerFormConfirm.hidden = false;
  window.requestAnimationFrame(() => elements.managerConfirmSubmit.focus());
}

function hideManagerConfirmation({ restoreFocus = true } = {}) {
  if (elements.managerFormConfirm.hidden) return;
  elements.managerFormConfirm.hidden = true;
  managerPendingConfirmation = null;
  if (restoreFocus) managerConfirmReturnFocus?.focus?.({ preventScroll: true });
  managerConfirmReturnFocus = null;
}

async function confirmManagerAction() {
  const pending = managerPendingConfirmation;
  if (!pending) return;
  hideManagerConfirmation({ restoreFocus: false });
  if (pending.type === 'deleteStep') {
    removeManagerStepImmediately(pending.step);
    return;
  }
  if (pending.type === 'discard') {
    finishManagerForm();
    return;
  }
  if (pending.type === 'submitTask') {
    await sendManagerTask(pending.payload);
    return;
  }
  if (pending.type === 'forceUrgent') {
    pending.payload.forceUrgent = true;
    await sendManagerTask(pending.payload);
  }
}

function trapManagerDialogFocus(event) {
  const scope = elements.managerFormConfirm.hidden
    ? modals.managerTask
    : elements.managerFormConfirm;
  const focusable = [
    ...scope.querySelectorAll('button, input, select, textarea, [tabindex]'),
  ].filter(
    (element) => !element.disabled && !element.hidden && element.getAttribute('tabindex') !== '-1',
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
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
  const assignee = renderTaskAssignee(task);
  const assigneeClass = assignee ? ' has-task-assignee' : '';
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
  const resumeAction =
    !isManager() && task.status === 'PAUSED' && !task.isWorkBlocked
      ? `<button class="secondaryButton taskResumeButton" type="button" data-worker-task-action="resume" data-task-id="${task.id}">Продолжить работу</button>`
      : '';
  const progress = task.steps.length
    ? `<div class="taskProgressBlock"><div class="taskProgressLine"><span><i style="width:${percent}%"></i></span><b>${percent}%</b></div><small>${completed} из ${task.steps.length} этапов выполнено</small></div>`
    : '';
  return `<article class="taskCard taskFeedCard ${statusClass}${assigneeClass}${task.steps.length ? ' has-steps' : ' is-simple-task'}" data-worker-task-id="${task.id}" data-business-locked="${Boolean(task.isAccessLocked)}" role="button" tabindex="0"><div class="taskFeedCardHeader"><h3>${escapeHtml(task.title)}</h3></div>${assignee}${gallery}<p class="taskLocation">${escapeHtml(location)}</p>${progress}${resumeAction}</article>`;
}

function renderTaskAssignee(task) {
  if (!isManager()) return '';
  const name = taskAssigneeDisplayName(task.assignee);
  const text = name ? `Ответственный: ${name}` : 'Ответственный не назначен';
  const stateClass = name ? '' : ' is-unassigned';
  return `<div class="taskAssigneeSlot"><p class="taskAssignee${stateClass}">${escapeHtml(text)}</p></div>`;
}

function taskAssigneeDisplayName(assignee) {
  return (
    [assignee?.name, assignee?.displayName, assignee?.login, assignee?.email]
      .find((value) => typeof value === 'string' && value.trim())
      ?.trim() ?? ''
  );
}

function taskCardStatusClass(status) {
  return (
    {
      ASSIGNED: 'is-ready',
      ACCEPTED: 'is-accepted',
      IN_PROGRESS: 'is-working',
      ON_REVIEW: 'is-review',
      COMPLETED: 'is-completed',
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
  if (action === 'resume') {
    requestWorkerTaskResume(taskId);
    return;
  }
  if (taskDetailActionPending) return;
  taskDetailActionPending = true;
  try {
    const response = await apiFetch(`/api/v1/tasks/${taskId}/accept`, { method: 'PATCH' });
    const body = await readResponseBody(response);
    if (!response.ok) {
      await loadWorkerObjects();
      if (response.status === 409) {
        clearSelectedWorkerTask();
        openView('myWork', { preserveScroll: true });
      }
      showMessage(getApiMessage(body) || 'Не удалось принять задачу');
      return;
    }
    await Promise.all([loadWorkerObjects(), loadHistory(true)]);
    if (activeWorkerTaskId) await ensureActiveWorkerTaskOpen();
    showMessage('Задача принята и начата');
  } catch {
    showMessage('Не удалось принять задачу. Проверьте соединение.');
  } finally {
    taskDetailActionPending = false;
    renderSelectedTaskActionState();
  }
}

async function openTaskDetails(taskId, options = {}) {
  if (!isManager() && isTaskAccessLocked()) return notifyTaskLocked();
  if (!isManager() && activeWorkerTaskId && taskId !== activeWorkerTaskId) {
    taskId = activeWorkerTaskId;
  }
  selectedTaskId = taskId;
  selectedTask = null;
  if (!options.preserveListScroll) taskListScrollY = window.scrollY;
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
  const requestedTaskId = selectedTaskId;
  const navigationRevision = workerNavigationRevision;
  try {
    const response = await apiFetch(
      isManager()
        ? `/api/v1/manager/tasks/${requestedTaskId}`
        : `/api/v1/worker/tasks/${requestedTaskId}`,
    );
    const body = await readResponseBody(response);
    if (
      requestedTaskId !== selectedTaskId ||
      (!isManager() && navigationRevision !== workerNavigationRevision)
    )
      return;
    if (!response.ok) {
      if (!isManager() && [403, 404].includes(response.status)) {
        await reconcileUnavailableWorkerTask(requestedTaskId, getApiMessage(body));
        return;
      }
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
    if (
      requestedTaskId !== selectedTaskId ||
      (!isManager() && navigationRevision !== workerNavigationRevision)
    )
      return;
    renderTaskDetailError('Не удалось загрузить задачу. Проверьте соединение и повторите попытку.');
  }
}

async function reconcileUnavailableWorkerTask(taskId, message) {
  const tasksLoaded = await loadWorkerObjects();
  if (!tasksLoaded) {
    if (selectedTaskId === taskId)
      renderTaskDetailError(message || 'Не удалось проверить состояние задачи.');
    return;
  }
  if (activeWorkerTaskId === taskId) {
    renderTaskDetailError(message || 'Не удалось загрузить активную задачу.');
    return;
  }
  clearSelectedWorkerTask();
  currentSection = 'tasks';
  previousWorkingSection = 'tasks';
  openView('myWork', { preserveScroll: true });
  updateBottomNavigation();
}

function renderTaskDetailLoading() {
  elements.taskTitle.textContent = 'Загружаем задачу…';
  elements.taskObject.textContent = '';
  elements.taskDescription.textContent = '';
  elements.taskAssignee.textContent = '';
  elements.taskPhotos.innerHTML = '<p>Загружаем фотографии…</p>';
  elements.stepsList.innerHTML = '<p>Загружаем этапы…</p>';
  elements.stepTimelineCard.hidden = false;
  elements.taskDetailProgress.hidden = false;
  elements.simpleTaskActions.hidden = true;
  elements.simpleTaskActions.innerHTML = '';
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
  elements.stepTimelineCard.hidden = false;
  elements.taskDetailProgress.hidden = true;
  elements.simpleTaskActions.hidden = true;
}

function renderSelectedTask() {
  if (!selectedTask) return;
  if (!isManager() && selectedTask.id === activeWorkerTaskId) armActiveTaskHistory();
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
  elements.taskDetailProgress.hidden = selectedTask.steps.length === 0;
  elements.stepTimelineCard.hidden = selectedTask.steps.length === 0;
  renderSelectedTaskControl();
  elements.taskPhotos.innerHTML = PhotoSlider.render(selectedTask.photos, {
    id: `task-${selectedTask.id}`,
    emptyText: 'У задачи пока нет фотографий',
  });
  elements.stepsList.innerHTML = selectedTask.steps.map(renderTaskStep).join('');
  renderSimpleTaskActions();
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
  control.className = `taskStatusControl ${taskCardStatusClass(selectedTask.status)}`;
  if (isManager()) {
    control.disabled = true;
    control.dataset.detailTaskAction = '';
    control.querySelector('b').textContent = taskStatusLabel(selectedTask.status);
    control.querySelector('small').textContent =
      `Исполнитель: ${selectedTask.assignee?.name ?? 'не назначен'}`;
    return;
  }
  const action = ['ASSIGNED', 'ACCEPTED'].includes(selectedTask.status)
    ? 'accept'
    : selectedTask.status === 'IN_PROGRESS'
      ? 'pause'
      : selectedTask.status === 'PAUSED' && !selectedTask.isWorkBlocked
        ? 'resume'
        : null;
  control.disabled = taskDetailActionPending || !action;
  control.dataset.detailTaskAction = action ?? '';
  control.querySelector('b').textContent = action
    ? {
        accept: 'Принять задачу',
        pause: 'Поставить на паузу',
        resume: 'Продолжить работу',
      }[action]
    : taskStatusLabel(selectedTask.status);
  control.querySelector('small').textContent = action
    ? 'Действие будет сохранено в истории.'
    : 'Для текущего статуса действий нет.';
}

function renderSelectedTaskActionState() {
  if (!selectedTask) return;
  renderSelectedTaskControl();
  renderSimpleTaskActions();
}

function renderSimpleTaskActions() {
  if (!selectedTask || selectedTask.steps.length > 0) {
    elements.simpleTaskActions.hidden = true;
    elements.simpleTaskActions.innerHTML = '';
    return;
  }
  const pause = [...(selectedTask.messages ?? [])]
    .reverse()
    .find((message) => message.kind === 'PAUSE_REQUEST');
  const pausePanel =
    selectedTask.status === 'PAUSED' && pause
      ? `<section class="stepStateMessage is-paused"><strong>Причина паузы</strong><p>${escapeHtml(pause.body)}</p><time>${formatLocalDateTime(pause.createdAt)}</time></section>`
      : '';
  const workerActions =
    !isManager() && selectedTask.status === 'IN_PROGRESS'
      ? `<button class="simpleTaskPhotoButton" type="button" data-simple-task-photo ${taskDetailActionPending ? 'disabled' : ''}>Сделать фото</button>${selectedTask.hasWorkerProgressPhoto ? `<button class="simpleTaskCompleteButton" type="button" data-simple-task-complete ${taskDetailActionPending ? 'disabled' : ''}>Завершить</button>` : ''}`
      : '';
  elements.simpleTaskActions.innerHTML = pausePanel + workerActions;
  elements.simpleTaskActions.hidden = !pausePanel && !workerActions;
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
  const editable =
    !['COMPLETED', 'CANCELLED'].includes(selectedTask.status) && !selectedTask.deletedAt;
  elements.taskHelpIsland.innerHTML = `<h3>Управление задачей</h3><div class="managerControls"><span class="managerControlValue"><small>Приоритет</small><strong>${selectedTask.priority === 'URGENT' ? 'Срочная' : 'Обычная'}</strong></span><span class="managerControlValue"><small>Доступ</small><strong>${selectedTask.accessStatus === 'CLOSED' ? 'Закрытая' : 'Открытая'}</strong></span>${editable ? '<button type="button" class="secondaryButton" data-manager-edit>Редактировать задачу</button>' : '<p class="managerEditUnavailable">Завершённую задачу нельзя редактировать.</p>'}<button type="button" class="dangerButton" data-manager-delete>Удалить задачу</button></div>`;
}

async function hydrateDetailPhotos() {
  photoSlider.mount(views.taskDetail);
}

async function requestActiveTaskExit() {
  if (!hasActiveWorkerTask()) return;
  await ensureActiveWorkerTaskOpen();
  if (selectedTask?.status !== 'IN_PROGRESS') return;
  requestSelectedTaskPause();
}

function requestSelectedTaskPause() {
  if (
    pendingTaskPause ||
    !selectedTaskId ||
    selectedTask?.status !== 'IN_PROGRESS' ||
    taskDetailActionPending
  )
    return;
  pendingTaskPause = { taskId: selectedTaskId };
  elements.pauseReasonError.textContent = 'Укажите причину паузы';
  elements.taskStatusConfirmIcon.textContent = '⏸';
  elements.taskStatusConfirmTitle.textContent = 'Поставить задачу на паузу?';
  elements.taskStatusConfirmText.textContent = 'Работа будет временно остановлена.';
  elements.taskStatusConfirmButton.textContent = 'Поставить на паузу';
  elements.taskStatusConfirmButton.disabled = false;
  elements.pauseReasonInput.value = '';
  elements.pauseReasonInput.placeholder = 'Напишите причину...';
  elements.pauseReasonError.hidden = true;
  elements.pauseReasonField.hidden = false;
  modals.taskStatusConfirm.classList.remove(
    'is-confirm-green',
    'is-confirm-gray',
    'is-confirm-orange',
    'is-confirm-yellow',
  );
  modals.taskStatusConfirm.classList.add('is-confirm-orange');
  openModal('taskStatusConfirm');
}

function requestWorkerTaskResume(taskId) {
  if (pendingTaskResume || taskDetailActionPending || !taskId) return;
  pendingTaskResume = { taskId };
  elements.taskStatusConfirmIcon.textContent = '▶';
  elements.taskStatusConfirmTitle.textContent = 'Продолжить работу?';
  elements.taskStatusConfirmText.textContent =
    'Укажите, почему препятствие устранено и работу можно продолжить.';
  elements.taskStatusConfirmButton.textContent = 'Продолжить работу';
  elements.taskStatusConfirmButton.disabled = false;
  elements.pauseReasonInput.value = '';
  elements.pauseReasonInput.placeholder = 'Например, материал доставили…';
  elements.pauseReasonError.textContent = 'Укажите причину продолжения';
  elements.pauseReasonError.hidden = true;
  elements.pauseReasonField.hidden = false;
  modals.taskStatusConfirm.classList.remove(
    'is-confirm-green',
    'is-confirm-gray',
    'is-confirm-orange',
    'is-confirm-yellow',
  );
  modals.taskStatusConfirm.classList.add('is-confirm-green');
  openModal('taskStatusConfirm');
}

async function confirmWorkerTaskResume() {
  if (!pendingTaskResume || taskDetailActionPending) return;
  const reason = elements.pauseReasonInput.value.trim();
  if (!reason) {
    elements.pauseReasonError.hidden = false;
    elements.pauseReasonInput.focus();
    return;
  }
  const request = pendingTaskResume;
  taskDetailActionPending = true;
  elements.taskStatusConfirmButton.disabled = true;
  try {
    const response = await apiFetch(`/api/v1/worker/tasks/${request.taskId}/resume`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: reason }),
    });
    const body = await readResponseBody(response);
    if (!response.ok) {
      showMessage(getApiMessage(body) || 'Не удалось продолжить работу.');
      return;
    }
    pendingTaskResume = null;
    closeModal();
    await Promise.all([loadWorkerObjects(), loadHistory(true)]);
    if (activeWorkerTaskId) await ensureActiveWorkerTaskOpen();
    showMessage('Работа по задаче продолжена');
  } catch {
    showMessage('Не удалось продолжить работу. Проверьте соединение и повторите попытку.');
  } finally {
    taskDetailActionPending = false;
    elements.taskStatusConfirmButton.disabled = false;
    renderSelectedTaskActionState();
  }
}

async function confirmSelectedTaskPause() {
  if (!pendingTaskPause || taskDetailActionPending) return;
  const reason = elements.pauseReasonInput.value.trim();
  if (!reason) {
    elements.pauseReasonError.hidden = false;
    elements.pauseReasonInput.focus();
    return;
  }

  const request = pendingTaskPause;
  taskDetailActionPending = true;
  elements.taskStatusConfirmButton.disabled = true;
  if (selectedTask) renderSelectedTaskControl();
  try {
    const response = await apiFetch(`/api/v1/worker/tasks/${request.taskId}/pause`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: reason }),
    });
    const body = await readResponseBody(response);
    if (!response.ok) {
      showMessage(getApiMessage(body) || 'Не удалось поставить задачу на паузу.');
      return;
    }

    if (selectedTask?.id === request.taskId) selectedTask.status = 'PAUSED';
    clearActiveWorkerTaskState({ clearSelection: true });
    closeModal();
    await Promise.all([loadWorkerObjects(), loadHistory(true)]);
    currentSection = 'tasks';
    previousWorkingSection = 'tasks';
    openView('myWork', { preserveScroll: true });
    updateBottomNavigation();
    window.scrollTo({ top: taskListScrollY, behavior: 'instant' });
    showMessage('Сообщение отправлено руководителю');
  } catch {
    showMessage('Не удалось поставить задачу на паузу. Проверьте соединение и повторите попытку.');
  } finally {
    taskDetailActionPending = false;
    elements.taskStatusConfirmButton.disabled = false;
    renderSelectedTaskActionState();
  }
}

async function runDetailAction(kind, action, id) {
  if (kind === 'task' && action === 'pause') {
    requestSelectedTaskPause();
    return;
  }
  if (kind === 'task' && action === 'resume') {
    requestWorkerTaskResume(id);
    return;
  }
  if (isTaskAccessLocked()) return notifyTaskLocked();
  if (taskDetailActionPending || !action || !id) return;
  taskDetailActionPending = true;
  renderSelectedTaskControl();
  try {
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
    renderSelectedTaskActionState();
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
    clearActiveWorkerTaskState({ clearSelection: true });
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

function openSimpleTaskCamera(completing) {
  if (
    isTaskAccessLocked() ||
    taskDetailActionPending ||
    !selectedTaskId ||
    selectedTask?.status !== 'IN_PROGRESS' ||
    selectedTask.steps.length > 0
  )
    return;
  void openShiftCamera(completing ? 'TASK_COMPLETE' : 'TASK_PHOTO');
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
              `<article class="whiteCard messageCard ${message.readAt ? '' : 'is-unread'}"><strong>${message.kind === 'TASK_UPDATED' ? 'Задача изменена' : message.kind === 'MANAGER_REPLY' ? 'Ответ руководителя' : message.kind === 'HELP_REQUEST' ? 'Запрос помощи' : 'Пауза'}</strong><p>${escapeHtml(message.body).replaceAll('\n', '<br>')}</p><small>${escapeHtml(message.task.title)}</small></article>`,
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
  if (messagesResponse.ok)
    await Promise.all(
      messages
        .filter((message) => message.kind === 'TASK_UPDATED' && !message.readAt)
        .map((message) =>
          apiFetch(`/api/v1/worker/messages/${message.id}/read`, { method: 'PATCH' }).catch(
            () => null,
          ),
        ),
    );
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
          .map((message) => {
            const title =
              message.kind === 'HELP_REQUEST'
                ? 'Нужна помощь'
                : message.kind === 'WORK_RESUMED'
                  ? 'Сотрудник самостоятельно возобновил выполнение задачи.'
                  : 'Сотрудник поставил задачу на паузу.';
            const replyActions =
              message.kind === 'WORK_RESUMED'
                ? ''
                : `<div class="stepWorkActions"><button data-manager-reply="CONTINUE" data-message-id="${message.id}">Продолжить работу</button><button data-manager-reply="STOP" data-message-id="${message.id}">Не продолжать</button></div>`;
            return `<article class="whiteCard messageCard"><strong>${title}</strong><p><b>Причина:</b> ${escapeHtml(message.body)}</p><small>${escapeHtml(message.task.object?.name ?? '')} · ${escapeHtml(message.task.title)}</small>${replyActions}</article>`;
          })
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
  await Promise.all([loadManagerMessages(), loadManagerTasks()]);
  if (selectedTaskId && views.taskDetail.classList.contains('is-active')) await reloadTaskDetails();
  showMessage('Ответ отправлен сотруднику');
}

function calculateCompletionBonus() {
  return 0;
}

async function loadAnalystWorkers({ initial = false } = {}) {
  if (!isAnalyst()) return false;
  if (analystLiveRequest) return analystLiveRequest;
  const generation = ++analystRequestGeneration;
  if (initial && !elements.analystWorkersList.children.length)
    elements.analystWorkersList.innerHTML = analystSkeletons();
  analystLiveRequest = (async () => {
    try {
      const response = await apiFetch('/api/v1/analyst/workers/live');
      const workers = await readResponseBody(response);
      if (!response.ok || !Array.isArray(workers)) throw new Error(getApiMessage(workers));
      if (generation !== analystRequestGeneration || !isAnalyst()) return false;
      renderAnalystWorkers(workers);
      return true;
    } catch {
      if (generation !== analystRequestGeneration || !isAnalyst()) return false;
      if (initial || !elements.analystWorkersList.querySelector('.analystWorkerCard'))
        elements.analystWorkersList.innerHTML =
          '<article class="analystErrorCard"><p>Не удалось получить актуальные данные сотрудников.</p><button class="secondaryButton" type="button" data-analyst-retry>Повторить</button></article>';
      return false;
    } finally {
      analystLiveRequest = null;
    }
  })();
  return analystLiveRequest;
}

function renderAnalystWorkers(workers) {
  const signature = JSON.stringify(workers);
  if (signature === analystLiveSignature) return;
  analystLiveSignature = signature;
  photoSlider.clear(elements.analystWorkersList);
  if (!workers.length) {
    elements.analystWorkersList.innerHTML =
      '<div class="emptyObject"><p>Активных сотрудников пока нет</p></div>';
    return;
  }
  elements.analystWorkersList.innerHTML = workers.map(renderAnalystWorkerCard).join('');
  photoSlider.mount(elements.analystWorkersList);
  bindAnalystTimelines(elements.analystWorkersList);
}

function renderAnalystWorkerCard(entry, options = {}) {
  const workerName = entry.worker.name?.trim() || entry.worker.email;
  const initial = workerName.slice(0, 1).toUpperCase();
  const shift = entry.activeShift ?? entry.shift ?? null;
  const frames = Array.isArray(entry.timeline) ? entry.timeline : [];
  const status = entry.status ?? (shift?.status === 'FINISHED' ? 'SHIFT_COMPLETED' : 'ON_SHIFT');
  const statusLabel = entry.statusLabel ?? analystStatusLabel(status);
  const workerKey = options.workerKey ?? entry.worker.id;
  const shiftText = shift?.startedAt
    ? `<p class="analystShiftTime">Смена с ${formatAnalystTime(shift.startedAt)}</p>`
    : '';
  const taskText = entry.activeTask?.title
    ? `<p class="analystCurrentTask">${escapeHtml(entry.activeTask.title)}</p>`
    : '';
  const timeline = shift
    ? renderAnalystTimeline(frames, shift.id, workerKey)
    : '<div class="analystNoShift"><span>Смена не начата</span></div>';
  return `<article class="analystWorkerCard is-${status.toLowerCase().replaceAll('_', '-')}"><header class="analystWorkerHeader"><span class="analystAvatar" aria-hidden="true">${escapeHtml(initial)}</span><div><h2>${escapeHtml(workerName)}</h2><span class="analystStatus">${escapeHtml(statusLabel)}</span>${shiftText}${taskText}</div></header>${timeline}</article>`;
}

function renderAnalystTimeline(frames, shiftId, workerKey) {
  if (!frames.length)
    return '<div class="analystNoShift"><span>События смены ещё не зафиксированы</span></div>';
  const photos = frames.map((frame) => ({
    id: frame.artifact?.id ?? null,
    originalFileName: frame.artifact?.originalFileName ?? frame.title,
  }));
  const selectedIndex = analystFrameIndexStore.get(
    workerKey,
    frames.map((frame) => frame.id),
  );
  const sliderMarkup = PhotoSlider.render(photos, {
    id: `analyst-shift-${shiftId}`,
    showEmpty: false,
  });
  const slider = decorateAnalystSlides(sliderMarkup, frames);
  return `<section class="analystTimeline" data-analyst-timeline data-analyst-worker-id="${escapeHtml(workerKey)}" data-initial-frame="${selectedIndex}">${slider}<div class="analystFramePosition">Кадр <span>${selectedIndex + 1}</span> из ${frames.length}</div></section>`;
}

function decorateAnalystSlides(sliderMarkup, frames) {
  const template = document.createElement('template');
  template.innerHTML = sliderMarkup;
  const slides = template.content.querySelectorAll('[data-photo-slide]');
  for (const [index, frame] of frames.entries()) {
    const slide = slides[index];
    if (!slide) continue;
    slide.dataset.analystFrameId = frame.id;
    if (isAnalystTaskSection(frame)) {
      slide.classList.remove('is-event-placeholder');
      slide.classList.add(
        'is-virtual',
        'is-analyst-task-section',
        `is-${frame.kind.toLowerCase().replaceAll('_', '-')}`,
      );
      slide.querySelector('.analystPhotoPlaceholder')?.remove();
      slide.querySelector('.photoLockOverlay')?.remove();
      slide.insertAdjacentHTML('beforeend', renderAnalystTaskSection(frame));
      continue;
    }
    slide.insertAdjacentHTML(
      'beforeend',
      renderAnalystFrameOverlay(frame, index),
    );
  }
  return template.innerHTML;
}

function renderAnalystFrameOverlay(frame, index) {
  const attributes = `class="analystFrameOverlay" data-analyst-caption="${index}" data-frame-id="${escapeHtml(frame.id)}"`;
  const occurredAt = escapeHtml(frame.occurredAt);
  const time = formatAnalystTime(frame.occurredAt);
  if (frame.kind === 'TASK_COMPLETED')
    return `<div ${attributes}><strong>Задача выполнена</strong><time datetime="${occurredAt}">Время завершения: ${time}</time></div>`;
  if (frame.kind === 'SHIFT_COMPLETED')
    return `<div ${attributes}><strong>${escapeHtml(frame.title)}</strong><time datetime="${occurredAt}">${time}</time></div>`;
  return `<div ${attributes}><strong>${escapeHtml(frame.title)}</strong>${frame.description ? `<p class="analystFrameTask">«${escapeHtml(frame.description)}»</p>` : ''}${frame.reason ? `<p class="analystFrameReason"><b>Причина:</b> ${escapeHtml(frame.reason)}</p>` : ''}${renderAnalystFrameFacts(frame)}<time datetime="${occurredAt}">${time}</time></div>`;
}

function isAnalystTaskSection(frame) {
  return [
    'TASK_SECTION_START',
    'TASK_SECTION_RETURN',
    'TASK_SECTION_SUMMARY',
    'SHIFT_SECTION_SUMMARY',
  ].includes(frame.kind);
}

function renderAnalystTaskSection(frame) {
  const metadata = frame.metadata ?? {};
  const title = frame.description || frame.task?.title || 'Задача';
  const place = [metadata.objectName, metadata.location].filter(Boolean).join(' / ');
  const responsible = metadata.responsibleName
    ? `<p class="analystSectionWide">Ответственный: ${escapeHtml(metadata.responsibleName)}</p>`
    : '';
  const placeLine = place
    ? `<p class="analystSectionPlace analystSectionWide">${escapeHtml(place)}</p>`
    : '';
  if (frame.kind === 'SHIFT_SECTION_SUMMARY') {
    const accrual = Number.isFinite(metadata.shiftCoinUnits)
      ? formatAnalystCoins(metadata.shiftCoinUnits)
      : 'ожидает расчёта';
    return `<div class="analystTaskSectionCard analystShiftSectionSummary" data-analyst-caption data-frame-id="${escapeHtml(frame.id)}"><span class="analystSectionEyebrow">Смена завершена</span><strong>${escapeHtml(metadata.workerName || frame.description || 'Сотрудник')}</strong>${metadata.shiftDate ? `<p class="analystShiftSectionDate">${formatAnalystShiftDate(metadata.shiftDate)}</p>` : ''}<div class="analystSectionFacts">${metadata.startedAt ? `<p>Начало: ${formatAnalystTime(metadata.startedAt)}</p>` : ''}${metadata.finishedAt ? `<p>Завершено: ${formatAnalystTime(metadata.finishedAt)}</p>` : ''}${Number.isFinite(metadata.shiftDurationMinutes) ? `<p>Продолжительность: ${formatAnalystDuration(metadata.shiftDurationMinutes)}</p>` : ''}${Number.isFinite(metadata.completedTaskCount) ? `<p>Выполнено задач: ${metadata.completedTaskCount}</p>` : ''}${Number.isFinite(metadata.workPhotoCount) ? `<p>Фотографий: ${metadata.workPhotoCount}</p>` : ''}${Number.isFinite(metadata.pauseCount) ? `<p>Пауз: ${metadata.pauseCount}</p>` : ''}<p>Начислено: ${escapeHtml(accrual)}</p></div></div>`;
  }
  if (frame.kind === 'TASK_SECTION_SUMMARY') {
    const cost = analystTaskCostLabel(frame);
    return `<div class="analystTaskSectionCard analystTaskSectionSummary" data-analyst-caption data-frame-id="${escapeHtml(frame.id)}"><span class="analystSectionBadge">✓ Готово</span><span class="analystSectionEyebrow">Задача выполнена</span><strong>${escapeHtml(title)}</strong><div class="analystSectionFacts analystSectionSummaryFacts">${responsible}${placeLine}${metadata.startedAt ? `<p>Начало: ${formatAnalystTime(metadata.startedAt)}</p>` : ''}${metadata.completedAt ? `<p>Завершено: ${formatAnalystTime(metadata.completedAt)}</p>` : ''}${Number.isFinite(frame.taskDurationMinutes) ? `<p>Время: ${formatAnalystDuration(frame.taskDurationMinutes)}</p>` : ''}${Number.isFinite(metadata.photoCount) ? `<p>Фотографий: ${metadata.photoCount}</p>` : ''}${Number.isFinite(metadata.pauseCount) ? `<p>Пауз: ${metadata.pauseCount}</p>` : ''}<p class="analystSectionWide">Стоимость: ${escapeHtml(cost)}</p></div></div>`;
  }
  const returned = frame.kind === 'TASK_SECTION_RETURN';
  const eventTime = returned ? metadata.resumedAt : metadata.startedAt;
  return `<div class="analystTaskSectionCard ${returned ? 'analystTaskSectionReturn' : 'analystTaskSectionStart'}" data-analyst-caption data-frame-id="${escapeHtml(frame.id)}"><span class="analystSectionEyebrow">${returned ? 'Возврат к задаче' : 'Новая задача'}</span><strong>${escapeHtml(title)}</strong>${placeLine}<div class="analystSectionFacts">${eventTime ? `<p>${returned ? 'Продолжение' : 'Начало'}: ${formatAnalystTime(eventTime)}</p>` : ''}${responsible}${returned && frame.reason ? `<p class="analystSectionWide">Причина: ${escapeHtml(frame.reason)}</p>` : ''}</div></div>`;
}

function analystTaskCostLabel(frame) {
  if (frame.costStatus === 'CALCULATED' && Number.isFinite(frame.taskCostCoins))
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(frame.taskCostCoins)} монет`;
  if (frame.costStatus === 'RATE_NOT_AVAILABLE') return 'нет данных о тарифе';
  if (frame.costStatus === 'DATA_INCOMPLETE') return 'недостаточно данных';
  return 'нет данных о тарифе';
}

function renderAnalystFrameFacts(frame) {
  const facts = [];
  if (Number.isFinite(frame.taskDurationMinutes))
    facts.push(`Время выполнения: ${formatAnalystDuration(frame.taskDurationMinutes)}`);
  return facts.map((fact) => `<p class="analystFrameFact">${escapeHtml(fact)}</p>`).join('');
}

function bindAnalystTimelines(root) {
  for (const timeline of root.querySelectorAll('[data-analyst-timeline]')) {
    const carousel = timeline.querySelector('[data-photo-carousel]');
    if (!carousel) continue;
    const update = () => updateAnalystTimeline(timeline);
    carousel.addEventListener('scroll', update, { passive: true });
    carousel.addEventListener('scrollend', update, { passive: true });
    carousel.addEventListener('pointerup', () => window.requestAnimationFrame(update), {
      passive: true,
    });
    const initialIndex = Number(timeline.dataset.initialFrame ?? 0);
    window.requestAnimationFrame(() => {
      const slide = carousel.querySelectorAll('[data-photo-slide]')[initialIndex];
      if (slide) carousel.scrollLeft = slide.offsetLeft;
      update();
    });
  }
}

function updateAnalystTimeline(timeline) {
  const carousel = timeline.querySelector('[data-photo-carousel]');
  const slides = [...carousel.querySelectorAll('[data-photo-slide]')];
  if (!slides.length) return;
  const index = AnalystTimeline.findActiveIndex(slides, carousel.scrollLeft, carousel.clientWidth);
  if (index < 0) return;
  const counter = timeline.querySelector('.analystFramePosition span');
  if (counter) counter.textContent = String(index + 1);
  const workerId = timeline.dataset.analystWorkerId;
  const frameCount = timeline.querySelectorAll('[data-analyst-caption]').length;
  analystFrameIndexStore.set(workerId, index, slides[index]?.dataset.analystFrameId ?? null);
  timeline.dataset.initialFrame = String(Math.min(index, frameCount - 1));
}

async function loadAnalystHistory() {
  if (!isAnalyst()) return false;
  elements.historyHeading.textContent = 'История смен';
  elements.historyMoreButton.hidden = true;
  elements.historyList.innerHTML = '<p>Загружаем завершённые смены…</p>';
  try {
    const response = await apiFetch('/api/v1/analyst/shifts/history');
    const shifts = await readResponseBody(response);
    if (!response.ok || !Array.isArray(shifts)) throw new Error();
    elements.historyList.innerHTML = shifts.length
      ? renderAnalystHistory(shifts)
      : '<div class="emptyObject"><p>Завершённых смен пока нет</p></div>';
    return true;
  } catch {
    elements.historyList.innerHTML =
      '<article class="analystErrorCard"><p>Не удалось загрузить историю смен.</p><button class="secondaryButton" type="button" data-section="history">Повторить</button></article>';
    return false;
  }
}

function renderAnalystHistory(shifts) {
  const groups = new Map();
  for (const shift of shifts) {
    const date = new Date(shift.finishedAt).toLocaleDateString('ru-RU');
    groups.set(date, [...(groups.get(date) ?? []), shift]);
  }
  return [...groups.entries()]
    .map(
      ([date, items]) =>
        `<section class="analystHistoryGroup"><h2>${escapeHtml(date)}</h2>${items
          .map((shift) => {
            const name = shift.worker.name?.trim() || shift.worker.email;
            const coins = Number.isFinite(shift.coinUnits)
              ? formatAnalystCoins(shift.coinUnits)
              : 'ожидается';
            return `<button class="analystHistoryShift" type="button" data-analyst-shift-id="${escapeHtml(shift.id)}"><strong>${escapeHtml(name)}</strong><span>${formatAnalystTime(shift.startedAt)}–${formatAnalystTime(shift.finishedAt)}</span><small>${shift.completedTaskCount} задач · ${escapeHtml(coins)}</small></button>`;
          })
          .join('')}</section>`,
    )
    .join('');
}

async function loadAnalystShift(shiftId) {
  elements.historyList.innerHTML = '<p>Загружаем смену…</p>';
  try {
    const response = await apiFetch(`/api/v1/analyst/shifts/${encodeURIComponent(shiftId)}`);
    const detail = await readResponseBody(response);
    if (!response.ok) throw new Error();
    const workerKey = `history:${shiftId}`;
    elements.historyHeading.textContent = detail.worker.name || detail.worker.email;
    elements.historyList.innerHTML = `<button class="textButton analystHistoryBack" type="button" data-analyst-history-back>← Все смены</button>${renderAnalystWorkerCard(detail, { workerKey })}`;
    photoSlider.mount(elements.historyList);
    bindAnalystTimelines(elements.historyList);
  } catch {
    elements.historyList.innerHTML =
      '<article class="analystErrorCard"><p>Не удалось открыть смену.</p><button class="secondaryButton" type="button" data-analyst-history-back>Вернуться</button></article>';
  }
}

function analystSkeletons() {
  return Array.from(
    { length: 3 },
    () =>
      '<article class="analystWorkerCard analystSkeleton" aria-hidden="true"><span></span><i></i><b></b></article>',
  ).join('');
}

function analystStatusLabel(status) {
  return (
    {
      RESTING: 'Отдыхает',
      ON_SHIFT: 'На смене',
      WORKING: 'Выполняет задачу',
      PAUSED: 'Пауза',
      WAITING_FOR_RESPONSE: 'Ожидает ответа',
      SHIFT_COMPLETED: 'Смена завершена',
    }[status] ?? status
  );
}

function formatAnalystTime(value) {
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
}

function formatAnalystShiftDate(value) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
    .format(new Date(value))
    .replace(/\s*г\.$/, '');
}

function formatAnalystDuration(minutes) {
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) return `${safe} мин`;
  return `${Math.floor(safe / 60)} ч${safe % 60 ? ` ${safe % 60} мин` : ''}`;
}

function formatAnalystCoins(units) {
  return `${formatCoinUnits(Math.round(units))} монет`;
}

async function loadHistory(reset) {
  if (isAnalyst()) return loadAnalystHistory();
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
  return `<article class="taskCard historyEventCard"><h3>${eventLabel(event.type)}</h3><p class="taskSummary">${escapeHtml(description)}</p>${metadata.summary ? `<p>${escapeHtml(metadata.summary)}</p>` : ''}${metadata.reason ? `<p><strong>Причина:</strong> ${escapeHtml(metadata.reason)}</p>` : ''}${photos}<time datetime="${event.createdAt}">${time}</time>${metadata.actorName ? `<p>Изменил: ${escapeHtml(metadata.actorName)}</p>` : ''}${metadata.objectName ? `<p>${escapeHtml(metadata.objectName)}</p>` : ''}${metadata.taskTitle ? `<p>«${escapeHtml(metadata.taskTitle)}»</p>` : ''}${metadata.stepTitle ? `<p>Этап: ${escapeHtml(metadata.stepTitle)}</p>` : ''}</article>`;
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
      TASK_STARTED: 'Принял задачу и начал работу',
      TASK_RESUMED: 'Работа продолжена',
      TASK_COMPLETED: 'Завершил задачу',
      STEP_STARTED: 'Начал этап',
      STEP_COMPLETED: 'Завершил этап',
      PHOTO_UPLOADED: 'Добавил фотографию',
      TASK_PAUSED: 'Поставил задачу на паузу',
      HELP_REQUEST: 'Запросил помощь',
      MANAGER_REPLY: 'Получил ответ руководителя',
      TASK_UPDATED: 'Изменил задачу',
    }[type] ?? 'Выполнил действие'
  );
}

function taskStatusLabel(status) {
  return (
    {
      ASSIGNED: 'Не начата',
      IN_PROGRESS: 'В работе',
      ACCEPTED: 'Принята',
      PAUSED: isManager() ? 'Ожидает ответа руководителя' : 'На паузе',
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
  stopAnalystPolling();
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
    filePickerFallback: false,
    fileName: null,
    mimeType: 'image/jpeg',
    taskId: mode.startsWith('TASK_') ? selectedTaskId : null,
    taskStepId,
  };

  elements.shiftCameraTitle.textContent =
    mode === 'START'
      ? 'Фото перед началом смены'
      : mode === 'TASK_STEP'
        ? 'Фото текущего этапа'
        : mode === 'TASK_PHOTO'
          ? 'Фото выполняемой задачи'
          : mode === 'TASK_COMPLETE'
            ? 'Итоговая фотофиксация'
            : 'Фото перед завершением смены';
  elements.shiftCameraText.textContent =
    mode === 'START'
      ? 'Расположите лицо в кадре и сделайте фотографию.'
      : ['TASK_STEP', 'TASK_PHOTO'].includes(mode)
        ? 'Сделайте фотографию выполняемой работы.'
        : mode === 'TASK_COMPLETE'
          ? 'После подтверждения фотографии задача будет завершена.'
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
    enableCameraFileFallback(true);
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
    enableCameraFileFallback(true);
    return false;
  }
}

function enableCameraFileFallback(openPicker = false) {
  cameraAttempt.filePickerFallback = true;
  stopCameraStream();
  elements.shiftCameraVideo.hidden = true;
  elements.shiftCameraState.hidden = false;
  elements.shiftCameraState.textContent = 'Выберите фотографию на устройстве.';
  elements.shiftCameraError.hidden = true;
  elements.shiftCameraFlipButton.hidden = true;
  elements.shiftCameraCaptureButton.hidden = false;
  elements.shiftCameraCaptureButton.disabled = false;
  elements.shiftCameraCaptureButton.textContent = 'Выбрать фото';
  if (openPicker) {
    elements.shiftCameraFileInput.value = '';
    elements.shiftCameraFileInput.click();
  }
}

async function handleCameraFileSelection() {
  const file = elements.shiftCameraFileInput.files?.[0];
  elements.shiftCameraFileInput.value = '';
  if (!file) return;
  if (
    !['image/jpeg', 'image/webp'].includes(file.type) ||
    file.size <= 0 ||
    file.size > 10_485_760
  ) {
    setCameraError('Выберите фотографию JPEG или WebP размером не более 10 МБ.');
    return;
  }
  clearCameraPreview();
  cameraAttempt.blob = file;
  cameraAttempt.fileName = file.name;
  cameraAttempt.mimeType = file.type;
  cameraAttempt.previewUrl = URL.createObjectURL(file);
  try {
    await loadPreviewImage(elements.shiftCameraPreview, cameraAttempt.previewUrl);
  } catch {
    clearCameraPreview();
    setCameraError('Не удалось отобразить фотографию. Выберите другой файл.');
    return;
  }
  elements.shiftCameraPreview.hidden = false;
  elements.shiftCameraVideo.hidden = true;
  elements.shiftCameraState.hidden = true;
  elements.shiftCameraCaptureButton.hidden = true;
  elements.shiftCameraRetakeButton.hidden = false;
  elements.shiftCameraConfirmButton.hidden = false;
  elements.shiftCameraConfirmButton.disabled = false;
  elements.shiftCameraError.hidden = true;
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
  if (cameraAttempt.filePickerFallback) {
    elements.shiftCameraFileInput.value = '';
    elements.shiftCameraFileInput.click();
    return;
  }
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
  cameraAttempt.fileName = `${cameraAttempt.mode.toLowerCase()}-photo.jpg`;
  cameraAttempt.mimeType = 'image/jpeg';
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
  if (cameraAttempt.filePickerFallback) {
    elements.shiftCameraFileInput.click();
    return;
  }
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
    new File(
      [cameraAttempt.blob],
      cameraAttempt.fileName || `${cameraAttempt.mode.toLowerCase()}-photo.jpg`,
      {
        type: cameraAttempt.mimeType || 'image/jpeg',
      },
    ),
  );
  if (['TASK_STEP', 'TASK_PHOTO'].includes(cameraAttempt.mode)) {
    formData.append('taskId', cameraAttempt.taskId);
    if (cameraAttempt.mode === 'TASK_STEP') formData.append('taskStepId', cameraAttempt.taskStepId);
    formData.append('operationId', cameraAttempt.operationId);
  } else if (cameraAttempt.mode === 'TASK_COMPLETE') {
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
          : cameraAttempt.mode === 'TASK_PHOTO'
            ? '/api/v1/artifacts/photos'
            : cameraAttempt.mode === 'TASK_COMPLETE'
              ? `/api/v1/tasks/${cameraAttempt.taskId}/complete-with-photo`
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
    if (['TASK_STEP', 'TASK_PHOTO'].includes(submittedMode))
      await Promise.all([reloadTaskDetails(), loadWorkerObjects(), loadHistory(true)]);
    else if (submittedMode === 'TASK_COMPLETE') {
      clearActiveWorkerTaskState({ clearSelection: true });
      await Promise.all([loadWorkerObjects(), loadHistory(true), loadWorkerMessages()]);
      currentSection = 'tasks';
      previousWorkingSection = 'tasks';
      openView('myWork', { preserveScroll: true });
      updateBottomNavigation();
      showMessage('Задача завершена');
    } else await restoreWorkerWorkspace();
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
  elements.shiftCameraCaptureButton.textContent = 'Сделать фото';
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
    filePickerFallback: keepOperationId ? cameraAttempt.filePickerFallback : false,
    fileName: null,
    mimeType: 'image/jpeg',
    taskId: keepOperationId ? cameraAttempt.taskId : null,
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
  cameraAttempt.fileName = null;
  cameraAttempt.mimeType = 'image/jpeg';
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
