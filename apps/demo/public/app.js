const state = {
  token: localStorage.getItem('stroit.demo.token') || '',
  user: readJson('stroit.demo.user'),
  currentTask: null,
  shift: null,
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
  startShiftButton: document.querySelector('#startShiftButton'),
  finishShiftButton: document.querySelector('#finishShiftButton'),
  refreshAllButton: document.querySelector('#refreshAllButton'),
  loadTasksButton: document.querySelector('#loadTasksButton'),
  createDemoTaskButton: document.querySelector('#createDemoTaskButton'),
  tasksList: document.querySelector('#tasksList'),
  taskScreen: document.querySelector('#taskScreen'),
  taskTitle: document.querySelector('#taskTitle'),
  taskMeta: document.querySelector('#taskMeta'),
  taskDescription: document.querySelector('#taskDescription'),
  reloadTaskButton: document.querySelector('#reloadTaskButton'),
  stepsList: document.querySelector('#stepsList'),
  loadEventsButton: document.querySelector('#loadEventsButton'),
  eventsList: document.querySelector('#eventsList'),
  messagePanel: document.querySelector('#messagePanel'),
};

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await login();
});
elements.logoutButton.addEventListener('click', logout);
elements.startShiftButton.addEventListener('click', () => mutateShift('/work-shifts/start'));
elements.finishShiftButton.addEventListener('click', () => mutateShift('/work-shifts/finish'));
elements.refreshAllButton.addEventListener('click', refreshWorkspace);
elements.loadTasksButton.addEventListener('click', loadTasks);
elements.createDemoTaskButton.addEventListener('click', createDemoTask);
elements.reloadTaskButton.addEventListener('click', () => {
  if (state.currentTask) {
    openTask(state.currentTask.id);
  }
});
elements.loadEventsButton.addEventListener('click', loadEvents);

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
  localStorage.removeItem('stroit.demo.token');
  localStorage.removeItem('stroit.demo.user');
  renderAuthState();
}

async function refreshWorkspace() {
  if (!state.token) {
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
    await loadShift();
    await loadEvents();
    showMessage('Статус смены обновлён.');
  } catch (error) {
    showError(error);
  }
}

async function loadTasks() {
  try {
    const tasks = await api('/tasks');
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
    await loadTasks();
    await openTask(task.id);
    await loadEvents();
  } catch (error) {
    showError(error);
  }
}

async function openTask(taskId) {
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
    await openTask(state.currentTask.id);
    await loadEvents();
    showMessage('Этап начат.');
  } catch (error) {
    showError(error);
  }
}

async function completeStep(stepId) {
  try {
    await api(`/task-steps/${stepId}/complete`, { method: 'PATCH' });
    await openTask(state.currentTask.id);
    await loadEvents();
    showMessage('Этап завершён. Можно загрузить фото.');
  } catch (error) {
    showError(error);
  }
}

async function uploadPhoto(stepId, input) {
  const file = input.files?.[0];

  if (!file || !state.currentTask) {
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
    await loadEvents();
    showMessage('Фото успешно загружено.');
  } catch (error) {
    showError(error);
  }
}

async function loadEvents() {
  try {
    const events = await api('/events');
    renderEvents(events);
  } catch (error) {
    renderEmpty(elements.eventsList, 'История событий недоступна для текущей роли.');
    showError(error);
  }
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
    elements.userInfo.textContent = `${state.user.name ?? state.user.email} · ${state.user.role}`;
  }
}

function renderShift() {
  elements.shiftStatus.textContent = state.shift ? state.shift.status : 'Смена не начата';
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
        <div class="itemMeta">Статус: ${escapeHtml(task.status)} · Приоритет: ${escapeHtml(task.priority)}</div>
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
  elements.taskTitle.textContent = task.title;
  elements.taskMeta.textContent = `Статус: ${task.status} · ID: ${task.id}`;
  elements.taskDescription.textContent = task.description || 'Описание не заполнено.';
}

function renderSteps(steps) {
  elements.stepsList.classList.toggle('empty', steps.length === 0);
  elements.stepsList.innerHTML = '';

  if (steps.length === 0) {
    elements.stepsList.textContent = 'Этапы пока не созданы.';
    return;
  }

  for (const step of steps) {
    const item = document.createElement('article');
    item.className = 'item';
    item.innerHTML = `
      <div>
        <div class="itemTitle">${escapeHtml(step.order)}. ${escapeHtml(step.title)}</div>
        <div class="itemMeta">Статус: ${escapeHtml(step.status)} · ID: ${escapeHtml(step.id)}</div>
      </div>
      <div class="itemActions">
        <button type="button" data-start-step="${escapeHtml(step.id)}">Начать</button>
        <button type="button" data-complete-step="${escapeHtml(step.id)}">Завершить</button>
      </div>
      <div class="uploadRow" ${step.status === 'COMPLETED' ? '' : 'hidden'}>
        <input type="file" accept="image/jpeg,image/png,image/webp" data-photo-step="${escapeHtml(step.id)}" />
      </div>
    `;

    item.querySelector('[data-start-step]').disabled = !['CREATED', 'REOPENED'].includes(step.status);
    item.querySelector('[data-complete-step]').disabled = step.status !== 'IN_PROGRESS';
    item.querySelector('[data-start-step]').addEventListener('click', () => startStep(step.id));
    item.querySelector('[data-complete-step]').addEventListener('click', () => completeStep(step.id));
    item.querySelector('[data-photo-step]')?.addEventListener('change', (event) => {
      uploadPhoto(step.id, event.currentTarget);
    });
    elements.stepsList.append(item);
  }
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
      <div class="itemTitle">${escapeHtml(event.type)}</div>
      <div class="itemMeta">${escapeHtml(event.createdAt)} · ${escapeHtml(event.entityType ?? 'no-entity')} · ${escapeHtml(event.entityId ?? 'no-id')}</div>
    `;
    elements.eventsList.append(item);
  }
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

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
