const state = {
  token: localStorage.getItem('stroit.demo.token') || '',
  user: readJson('stroit.demo.user'),
  currentTask: null,
  shift: null,
  workspace: null,
};

const elements = {
  loginScreen: document.querySelector('#loginScreen'),
  workspaceScreen: document.querySelector('#workspaceScreen'),
  loginForm: document.querySelector('#loginForm'),
  emailInput: document.querySelector('#emailInput'),
  passwordInput: document.querySelector('#passwordInput'),
  logoutButton: document.querySelector('#logoutButton'),
  userInfo: document.querySelector('#userInfo'),
  shiftStatus: document.querySelector('#shiftStatus'),
  mainShiftButton: document.querySelector('#mainShiftButton'),
  finishShiftButton: document.querySelector('#finishShiftButton'),
  todayShift: document.querySelector('#todayShift'),
  todayTasks: document.querySelector('#todayTasks'),
  todaySteps: document.querySelector('#todaySteps'),
  todayLastAction: document.querySelector('#todayLastAction'),
  refreshAllButton: document.querySelector('#refreshAllButton'),
  loadTasksButton: document.querySelector('#loadTasksButton'),
  createDemoTaskButton: document.querySelector('#createDemoTaskButton'),
  tasksList: document.querySelector('#tasksList'),
  taskScreen: document.querySelector('#taskScreen'),
  taskObject: document.querySelector('#taskObject'),
  taskRoom: document.querySelector('#taskRoom'),
  taskTitle: document.querySelector('#taskTitle'),
  taskMeta: document.querySelector('#taskMeta'),
  taskDescription: document.querySelector('#taskDescription'),
  stepsList: document.querySelector('#stepsList'),
  photoBlock: document.querySelector('#photoBlock'),
  photoHint: document.querySelector('#photoHint'),
  photoInput: document.querySelector('#photoInput'),
  loadEventsButton: document.querySelector('#loadEventsButton'),
  eventsList: document.querySelector('#eventsList'),
  messagePanel: document.querySelector('#messagePanel'),
};

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await login();
});
elements.logoutButton.addEventListener('click', logout);
elements.mainShiftButton.addEventListener('click', handleMainShiftAction);
elements.finishShiftButton.addEventListener('click', () => mutateShift('/work-shifts/finish'));
elements.refreshAllButton.addEventListener('click', refreshWorkspace);
elements.loadTasksButton.addEventListener('click', loadTasks);
elements.createDemoTaskButton.addEventListener('click', createDemoTask);
elements.loadEventsButton.addEventListener('click', refreshWorkspace);
elements.photoInput.addEventListener('change', () => uploadPhoto(resolvePhotoStepId(), elements.photoInput));

renderAuthState();

if (state.token) {
  refreshWorkspace().catch((error) => showError(error));
}

async function login() {
  const response = await api('/auth/login', {
    method: 'POST',
    body: {
      email: elements.emailInput.value,
      password: elements.passwordInput.value,
    },
    skipAuth: true,
  });

  state.token = response.accessToken;
  state.user = response.user;
  localStorage.setItem('stroit.demo.token', state.token);
  localStorage.setItem('stroit.demo.user', JSON.stringify(state.user));
  showMessage('Вход выполнен.');
  renderAuthState();
  await refreshWorkspace();
}

function logout() {
  state.token = '';
  state.user = null;
  state.currentTask = null;
  state.shift = null;
  state.workspace = null;
  localStorage.removeItem('stroit.demo.token');
  localStorage.removeItem('stroit.demo.user');
  renderAuthState();
}

function canManageTasks() {
  return ['CREATOR', 'DIRECTOR', 'FOREMAN'].includes(state.user?.role);
}

function getTaskListPath() {
  return state.user?.role === 'WORKER' ? '/tasks/my' : '/tasks';
}

async function refreshWorkspace() {
  if (!state.token) {
    return;
  }

  if (!state.user) {
    await loadMe();
  }

  if (state.user?.role === 'WORKER') {
    const workspace = await api('/workspace');
    renderWorkspace(workspace);
    return;
  }

  await Promise.allSettled([loadMe(), loadShift(), loadTasks(), loadEvents()]);
  renderAuthState();
}

async function loadMe() {
  state.user = await api('/auth/me');
  localStorage.setItem('stroit.demo.user', JSON.stringify(state.user));
}

async function loadShift() {
  state.shift = await api('/work-shifts/current');
  renderShift();
}

async function mutateShift(path) {
  try {
    await api(path, { method: 'POST' });
    await refreshWorkspace();
    showMessage('Статус смены обновлён.');
  } catch (error) {
    showError(error);
  }
}

async function handleMainShiftAction() {
  if (!state.shift) {
    await mutateShift('/work-shifts/start');
    return;
  }

  if (state.currentTask) {
    elements.taskScreen.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  await mutateShift('/work-shifts/finish');
}

async function loadTasks() {
  if (state.user?.role === 'WORKER') {
    await refreshWorkspace();
    return;
  }

  try {
    const tasks = await api(getTaskListPath());
    renderTasks(tasks);
  } catch (error) {
    renderEmpty(elements.tasksList, 'Список задач недоступен для текущей роли.');
    showError(error);
  }
}

async function createDemoTask() {
  try {
    const task = await api('/tasks', {
      method: 'POST',
      body: {
        title: `Демо-задача ${new Date().toLocaleTimeString('ru-RU')}`,
        description: 'Задача создана demo panel через существующий API.',
        priority: 'NORMAL',
      },
    });

    await api(`/tasks/${task.id}/steps`, {
      method: 'POST',
      body: {
        title: 'Сделать фотофиксацию результата',
        description: 'Этап создан demo panel через существующий API.',
        order: 1,
      },
    });

    showMessage('Демо-задача и этап созданы.');
    await refreshWorkspace();
    await openTask(task.id);
  } catch (error) {
    showError(error);
  }
}

async function openTask(taskId) {
  if (state.workspace) {
    const task = state.workspace.myTasks.find((item) => item.id === taskId);

    if (!task) {
      showError(new Error('Задача не найдена в рабочем месте.'));
      return;
    }

    state.currentTask = task;
    renderTask(task);
    renderSteps(task.id === state.workspace.currentTask?.id ? state.workspace.currentSteps : []);
    return;
  }

  try {
    const task = await api(`/tasks/${taskId}`);
    state.currentTask = task;
    renderTask(task);
    await loadSteps(task.id);
  } catch (error) {
    showError(error);
  }
}

async function loadSteps(taskId) {
  try {
    const steps = await api(`/tasks/${taskId}/steps`);
    renderSteps(steps);
  } catch (error) {
    renderEmpty(elements.stepsList, 'Этапы недоступны для текущей роли.');
    showError(error);
  }
}

async function startStep(stepId) {
  try {
    await api(`/task-steps/${stepId}/start`, { method: 'PATCH' });
    await refreshWorkspace();
    showMessage('Этап начат.');
  } catch (error) {
    showError(error);
  }
}

async function completeStep(stepId) {
  try {
    await api(`/task-steps/${stepId}/complete`, { method: 'PATCH' });
    await refreshWorkspace();
    showMessage('Этап завершён. Можно загрузить фото.');
  } catch (error) {
    showError(error);
  }
}

async function uploadPhoto(stepId, input) {
  const file = input.files?.[0];

  if (!file || !state.currentTask || !stepId) {
    showError(new Error('Выберите файл фотографии.'));
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('taskId', state.currentTask.id);
  formData.append('taskStepId', stepId);

  try {
    await api('/artifacts/photos', {
      method: 'POST',
      formData,
    });
    input.value = '';
    await refreshWorkspace();
    showMessage('Фото успешно загружено.');
  } catch (error) {
    showError(error);
  }
}

async function loadEvents() {
  if (state.user?.role === 'WORKER') {
    await refreshWorkspace();
    return;
  }

  try {
    const events = await api('/events');
    renderEvents(events);
  } catch (error) {
    renderEmpty(elements.eventsList, 'История событий недоступна для текущей роли.');
    showError(error);
  }
}

function renderWorkspace(workspace) {
  state.workspace = workspace;
  state.user = workspace.user;
  state.shift = workspace.currentShift;
  state.currentTask = workspace.currentTask;
  localStorage.setItem('stroit.demo.user', JSON.stringify(state.user));
  renderAuthState();
  renderShift();
  renderToday(workspace.today);
  renderTasks(workspace.myTasks);

  if (workspace.currentTask) {
    renderTask(workspace.currentTask);
    renderSteps(workspace.currentSteps);
  } else {
    elements.taskScreen.hidden = true;
    renderEmpty(elements.stepsList, 'Текущей задачи нет.');
    renderPhotoBlock([]);
  }

  renderEvents(workspace.myEvents);
}

async function api(path, options = {}) {
  const headers = {};

  if (!options.skipAuth && state.token) {
    headers.authorization = `Bearer ${state.token}`;
  }

  if (options.body) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(`/api/v1${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.formData ? options.formData : options.body ? JSON.stringify(options.body) : null,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(`${response.status} ${errorBody.error ?? response.statusText}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function renderAuthState() {
  const isLoggedIn = Boolean(state.token);
  elements.loginScreen.hidden = isLoggedIn;
  elements.workspaceScreen.hidden = !isLoggedIn;
  elements.logoutButton.hidden = !isLoggedIn;

  if (state.user) {
    elements.userInfo.textContent = state.user.name ?? state.user.email;
  }

  elements.createDemoTaskButton.hidden = !canManageTasks();
}

function renderShift() {
  const isActive = state.shift?.status === 'ACTIVE';

  elements.shiftStatus.textContent = isActive ? 'Смена активна' : 'Смена не начата';
  elements.shiftStatus.classList.toggle('active', isActive);
  elements.mainShiftButton.textContent = !isActive
    ? 'Начать смену'
    : state.currentTask
      ? 'Продолжить работу'
      : 'Завершить смену';
  elements.finishShiftButton.hidden = !isActive;
}

function renderToday(today) {
  elements.todayShift.textContent = today.shiftStatus === 'ACTIVE' ? 'Активна' : 'Не начата';
  elements.todayTasks.textContent = String(today.tasksCount);
  elements.todaySteps.textContent = `${today.activeStepsCount} активных`;
  elements.todayLastAction.textContent = today.lastAction
    ? `${formatEventType(today.lastAction.type)} · ${formatRelativeTime(today.lastAction.createdAt)}`
    : 'Нет событий';
}

function renderTasks(tasks) {
  elements.tasksList.classList.toggle('empty', tasks.length === 0);
  elements.tasksList.innerHTML = '';

  if (tasks.length === 0) {
    elements.tasksList.textContent = 'Задач пока нет.';
    return;
  }

  for (const task of tasks) {
    const item = document.createElement('article');
    item.className = 'item';
    item.innerHTML = `
      <div>
        <div class="itemTitle">${escapeHtml(task.title)}</div>
        <div class="itemMeta">${escapeHtml(formatStatus(task.status))}</div>
      </div>
      <div class="itemActions">
        <button type="button" data-open-task="${escapeHtml(task.id)}">Открыть</button>
      </div>
    `;
    item.querySelector('[data-open-task]').addEventListener('click', () => openTask(task.id));
    elements.tasksList.append(item);
  }
}

function renderTask(task) {
  elements.taskScreen.hidden = false;
  const location = parseTaskLocation(task);

  elements.taskObject.textContent = location.object;
  elements.taskRoom.textContent = location.room;
  elements.taskTitle.textContent = task.title;
  elements.taskMeta.textContent = formatStatus(task.status);
  elements.taskMeta.classList.toggle('active', task.status === 'IN_PROGRESS');
  elements.taskDescription.textContent = task.description || 'Описание не заполнено.';
}

function renderSteps(steps) {
  elements.stepsList.classList.toggle('empty', steps.length === 0);
  elements.stepsList.innerHTML = '';

  if (steps.length === 0) {
    elements.stepsList.textContent = 'Этапы пока не созданы.';
    renderPhotoBlock([]);
    return;
  }

  for (const step of steps) {
    const status = formatStepStatus(step.status);
    const item = document.createElement('article');
    item.className = 'item';
    item.innerHTML = `
      <div class="stepStatus ${step.status === 'IN_PROGRESS' ? 'active' : ''} ${step.status === 'COMPLETED' ? 'done' : ''}">
        <div class="itemTitle">${escapeHtml(step.order)}. ${escapeHtml(step.title)}</div>
        <div class="itemMeta">${escapeHtml(status)}</div>
      </div>
      <div class="itemActions">
        <button type="button" data-start-step="${escapeHtml(step.id)}">Начать</button>
        <button type="button" data-complete-step="${escapeHtml(step.id)}">Завершить</button>
      </div>
    `;

    item.querySelector('[data-start-step]').disabled = !['CREATED', 'REOPENED'].includes(step.status);
    item.querySelector('[data-complete-step]').disabled = step.status !== 'IN_PROGRESS';
    item.querySelector('[data-start-step]').addEventListener('click', () => startStep(step.id));
    item.querySelector('[data-complete-step]').addEventListener('click', () => completeStep(step.id));
    elements.stepsList.append(item);
  }

  renderPhotoBlock(steps);
}

function renderEvents(events) {
  elements.eventsList.classList.toggle('empty', events.length === 0);
  elements.eventsList.innerHTML = '';

  if (events.length === 0) {
    elements.eventsList.textContent = 'Событий пока нет.';
    return;
  }

  for (const event of events) {
    const item = document.createElement('article');
    item.className = 'item';
    item.innerHTML = `
      <div class="itemMeta">${escapeHtml(formatEventTime(event.createdAt))}</div>
      <div class="itemTitle">${escapeHtml(formatEventType(event.type))}</div>
    `;
    elements.eventsList.append(item);
  }
}

function renderPhotoBlock(steps) {
  const stepId = resolvePhotoStepId(steps);
  const hasCompletedStep = Boolean(stepId);

  elements.photoInput.disabled = !hasCompletedStep;
  elements.photoHint.textContent = hasCompletedStep
    ? 'Добавьте фото результата по завершённому этапу.'
    : 'Завершите этап, чтобы добавить фото.';
}

function resolvePhotoStepId(steps = state.workspace?.currentSteps ?? []) {
  return [...steps].reverse().find((step) => step.status === 'COMPLETED')?.id ?? null;
}

function renderEmpty(target, message) {
  target.classList.add('empty');
  target.innerHTML = '';
  target.textContent = message;
}

function showMessage(message) {
  elements.messagePanel.hidden = false;
  elements.messagePanel.classList.remove('error');
  elements.messagePanel.textContent = message;
  window.setTimeout(() => {
    elements.messagePanel.hidden = true;
  }, 3600);
}

function showError(error) {
  elements.messagePanel.hidden = false;
  elements.messagePanel.classList.add('error');
  elements.messagePanel.textContent = error.message;
}

function readJson(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function formatEventType(type) {
  const labels = {
    WORK_SHIFT_STARTED: 'Начал смену',
    WORK_SHIFT_FINISHED: 'Завершил смену',
    TASK_ASSIGNED: 'Получил задачу',
    TASK_ACCEPTED: 'Принял задачу',
    TASK_STARTED: 'Начал задачу',
    TASK_SENT_TO_REVIEW: 'Отправил задачу на ревью',
    TASK_COMPLETED: 'Завершил задачу',
    STEP_STARTED: 'Начал этап',
    STEP_COMPLETED: 'Завершил этап',
    STEP_REOPENED: 'Переоткрыл этап',
    STEP_CANCELLED: 'Отменил этап',
    PHOTO_UPLOADED: 'Загрузил фото',
  };

  return labels[type] ?? type;
}

function formatStatus(status) {
  const labels = {
    CREATED: 'Не начато',
    ASSIGNED: 'Назначено',
    ACCEPTED: 'Принято',
    IN_PROGRESS: 'В работе',
    ON_REVIEW: 'На проверке',
    COMPLETED: 'Выполнено',
    CANCELLED: 'Отменено',
  };

  return labels[status] ?? status;
}

function formatStepStatus(status) {
  const labels = {
    CREATED: 'Не начато',
    IN_PROGRESS: 'В работе',
    COMPLETED: 'Выполнено',
    REOPENED: 'Открыто повторно',
    CANCELLED: 'Отменено',
  };

  return labels[status] ?? status;
}

function parseTaskLocation(task) {
  const description = task.description ?? '';
  const objectMatch = description.match(/объект[:\s]+([^\n.;]+)/i);
  const roomMatch = description.match(/помещение[:\s]+([^\n.;]+)/i);

  return {
    object: objectMatch?.[1]?.trim() || 'Объект не указан',
    room: roomMatch?.[1]?.trim() || 'Помещение не указано',
  };
}

function formatEventTime(value) {
  return new Date(value).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(value) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  if (diffMinutes < 1) {
    return 'только что';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} мин назад`;
  }

  return formatEventTime(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
