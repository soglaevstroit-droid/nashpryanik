# 003 — Services

## Назначение
Сервисный слой реализует бизнес-сценарии проекта и координирует репозитории, storage, AI и уведомления.

## UserService
Ответственность:
- получить профиль пользователя;
- вернуть список сотрудников;
- определить работающих сейчас;
- проверить принадлежность к компании.

Зависимости:
- `UserRepository`;
- `WorkSessionRepository`;
- `CoinRepository`;
- `TaskRepository`.

Основные методы:
- `getCurrentUser(context)`;
- `listUsers(context, filters)`;
- `getUserById(context, userId)`;
- `getWorkingNow(context, filters)`.

## TaskService
Ответственность:
- список задач;
- создание задачи прорабом;
- получение задачи;
- взятие задачи монтажником;
- завершение задачи;
- проверка одной активной задачи.

Зависимости:
- `TaskRepository`;
- `TaskStepRepository`;
- `WorkSessionRepository`;
- `AuditRepository`.

Основные методы:
- `listTasks(context, filters)`;
- `createTask(context, dto)`;
- `getTask(context, taskId)`;
- `takeTask(context, taskId, workSessionId)`;
- `completeTask(context, taskId, workSessionId)`.

## StepService
Ответственность:
- создание этапов;
- старт этапа;
- завершение этапа;
- фиксация невозможности выполнить.

Зависимости:
- `TaskStepRepository`;
- `TaskRepository`;
- `PhotoRepository`;
- `CoinService`;
- `AuditRepository`.

Основные методы:
- `listSteps(context, taskId)`;
- `createStep(context, taskId, dto)`;
- `startStep(context, stepId, dto)`;
- `completeStep(context, stepId, dto)`;
- `cannotDo(context, stepId, dto)`.

## WorkSessionService
Ответственность:
- текущая смена;
- начало смены;
- завершение смены;
- история смен.

Зависимости:
- `WorkSessionRepository`;
- `PhotoRepository`;
- `UserRepository`;
- `AuditRepository`.

Основные методы:
- `getCurrent(context)`;
- `start(context, dto)`;
- `finish(context, sessionId, dto)`;
- `listByUser(context, userId, filters)`.

## PhotoService
Ответственность:
- принять `multipart/form-data`;
- проверить тип и размер файла;
- сохранить файл в storage;
- создать запись `photos`;
- вернуть metadata и URL.

Зависимости:
- `StorageClient`;
- `PhotoRepository`;
- `AuditRepository`.

Основные методы:
- `upload(context, file, metadata)`;
- `getMetadata(context, photoId)`;
- `getViewUrl(context, photoId)`.

## CoinService
Ответственность:
- начислить монеты по подтвержденному событию;
- вернуть баланс;
- вернуть историю;
- построить агрегаты.

Зависимости:
- `CoinRepository`;
- `WorkSessionRepository`;
- `AuditRepository`.

Основные методы:
- `awardForConfirmedWork(context, source)`;
- `getBalance(context, userId)`;
- `listTransactions(context, userId, filters)`;
- `getSummary(context, filters)`.

## FinanceService
Ответственность:
- финансовая сводка;
- аналитика;
- черновик выплаты;
- создание выплаты решением финансиста;
- история выплат;
- отчеты.

Зависимости:
- `UserRepository`;
- `CoinRepository`;
- `WorkSessionRepository`;
- `AIRecommendationRepository`;
- `NotificationRepository`;
- `AuditRepository`.

Основные методы:
- `getSummary(context)`;
- `getAnalytics(context, filters)`;
- `getEmployeeDetails(context, employeeId, filters)`;
- `getPaymentDraft(context, filters)`;
- `createPayment(context, dto)`;
- `getPaymentHistory(context, filters)`;
- `getReport(context, filters)`.

## NotificationService
Ответственность:
- список уведомлений;
- отметить просмотренным;
- отметить обработанным;
- создать уведомление из события.

Зависимости:
- `NotificationRepository`;
- `AuditRepository`;
- delivery providers.

Основные методы:
- `list(context, filters)`;
- `markRead(context, notificationId)`;
- `resolve(context, notificationId, dto)`;
- `createFromEvent(event)`.

## AIService
Ответственность:
- собрать контекст для AI;
- вызвать AI Engine;
- сохранить рекомендацию;
- вернуть объяснение;
- не принимать финальные решения.

Зависимости:
- `AIClient`;
- `AIRecommendationRepository`;
- `CoinRepository`;
- `TaskRepository`;
- `WorkSessionRepository`;
- `NotificationService`;
- `AuditRepository`.

Основные методы:
- `listRecommendations(context, filters)`;
- `getRecommendation(context, id)`;
- `generateRecommendation(context, input)`;
- `markViewed(context, id)`;
- `recordHumanDecision(context, id, dto)`.

## Правила сервисов
- Сервис получает `context` с `userId`, `companyId`, `role`, `requestId`.
- Сервис не доверяет данным клиента о компании.
- Финансовые методы требуют роль `finance`.
- Сервисы пишут audit через общий механизм.
