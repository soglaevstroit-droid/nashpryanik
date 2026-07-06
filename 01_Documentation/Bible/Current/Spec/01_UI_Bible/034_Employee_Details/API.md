# API — 34 Карточка сотрудника

## Данные экрана
- `GET /api/finance/employees/:employeeId/details`
- `GET /api/finance/employees/:employeeId/activity-calendar`
- `GET /api/finance/employees/:employeeId/history`
- `GET /api/finance/employees/:employeeId/ai-recommendations`

## Query параметры
- `periodFrom`
- `periodTo`
- `objectId`

## `GET /api/finance/employees/:employeeId/details`
Возвращает основные данные карточки сотрудника.

## Поля ответа
- `employeeId`
- `fullName`
- `photoUrl`
- `currentStatus`
- `objects`
- `totalWorkDuration`
- `earnedCoins`
- `completedTasksCount`
- `currentTask`

## Календарь активности
Элемент календаря содержит:
- `date`
- `activityCount`
- `workDuration`
- `earnedCoins`
- `hasOverdueTasks`

## История
Элемент истории содержит:
- `historyId`
- `occurredAt`
- `type`
- `objectName`
- `taskTitle`
- `coins`
- `workDuration`
- `status`

## Ошибки
- `400` — некорректный период или фильтр.
- `401` — пользователь не авторизован.
- `403` — роль не имеет доступа.
- `404` — сотрудник не найден.
- `500` — ошибка загрузки карточки.
