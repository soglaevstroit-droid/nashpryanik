# 005 — Repositories

## Назначение
Repository Layer отвечает за доступ к PostgreSQL. Репозитории инкапсулируют SQL, транзакции и маппинг строк в доменные объекты.

## Общие правила
- Каждый запрос фильтруется по `company_id`.
- Репозитории не принимают HTTP request.
- Репозитории не решают, разрешено ли действие роли.
- Транзакции открываются сервисом или transaction manager.
- Ошибки БД преобразуются в доменные ошибки.

## UserRepository
Таблицы:
- `users`;
- `work_sessions`;
- `coin_transactions`.

Методы:
- `findById(companyId, userId)`;
- `findByPhone(phone)`;
- `list(companyId, filters)`;
- `listWorkingNow(companyId, filters)`;
- `updateWorkStatus(tx, userId, status)`.

## ObjectRepository
Таблицы:
- `companies`;
- `objects`.

Методы:
- `list(companyId, filters)`;
- `findById(companyId, objectId)`;
- `listFinanceFilters(companyId)`.

## TaskRepository
Таблицы:
- `tasks`;
- `task_assignees`.

Методы:
- `list(companyId, filters)`;
- `findById(companyId, taskId)`;
- `create(tx, dto)`;
- `assignUsers(tx, taskId, userIds)`;
- `setInProgress(tx, taskId, workerId)`;
- `setCompleted(tx, taskId)`;
- `findActiveTask(companyId, workerId)`.

## TaskStepRepository
Таблицы:
- `task_steps`;
- `photos`.

Методы:
- `listByTask(companyId, taskId)`;
- `create(tx, taskId, dto)`;
- `setStatus(tx, stepId, status)`;
- `complete(tx, stepId, userId, completedAt)`;
- `setCannotDo(tx, stepId, reason)`.

## WorkSessionRepository
Таблицы:
- `work_sessions`;
- `users`.

Методы:
- `findCurrent(companyId, userId)`;
- `start(tx, dto)`;
- `finish(tx, sessionId, dto)`;
- `listByUser(companyId, userId, filters)`;
- `assertActive(companyId, userId, sessionId)`.

## PhotoRepository
Таблицы:
- `photos`.

Методы:
- `create(tx, metadata)`;
- `findById(companyId, photoId)`;
- `setStatus(tx, photoId, status)`;
- `findForEntity(companyId, entity)`.

## CoinRepository
Таблицы:
- `coin_transactions`.

Методы:
- `create(tx, dto)`;
- `getBalance(companyId, userId)`;
- `listByUser(companyId, userId, filters)`;
- `summary(companyId, filters)`;
- `sumByPeriod(companyId, filters)`.

## FinanceRepository
Таблицы:
- `users`;
- `objects`;
- `work_sessions`;
- `coin_transactions`;
- `ai_recommendations`;
- финансовые записи выплат, если реализованы отдельной таблицей.

Методы:
- `getSummary(companyId)`;
- `getAnalytics(companyId, filters)`;
- `getEmployeeDetails(companyId, employeeId, filters)`;
- `createPayment(tx, dto)`;
- `findPaymentConflict(companyId, dto)`;
- `listPaymentHistory(companyId, filters)`.

## AIRecommendationRepository
Таблицы:
- `ai_recommendations`.

Методы:
- `list(companyId, filters)`;
- `findById(companyId, id)`;
- `create(tx, dto)`;
- `markViewed(tx, id)`;
- `recordHumanDecision(tx, id, dto)`.

## NotificationRepository
Таблицы:
- `notifications`.

Методы:
- `listForUserOrRole(companyId, userId, role, filters)`;
- `create(tx, dto)`;
- `markRead(tx, notificationId)`;
- `resolve(tx, notificationId)`.

## AuditRepository
Таблицы:
- `audit_log`.

Методы:
- `write(tx, auditEvent)`;
- `listByEntity(companyId, entityType, entityId)`.

## Транзакции
Транзакция обязательна для:
- смены статуса задачи;
- завершения этапа и начисления монет;
- сохранения фото-метаданных после storage;
- создания выплаты;
- записи audit-события вместе с доменным изменением.
