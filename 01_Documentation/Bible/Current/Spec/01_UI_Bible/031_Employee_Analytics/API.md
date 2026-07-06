# API — 31 Аналитика сотрудника

## Данные экрана
- `GET /api/finance/employees/:employeeId/analytics`
- `GET /api/finance/employees/:employeeId/tasks`
- `GET /api/finance/employees/:employeeId/activity`
- `GET /api/finance/employees/:employeeId/work-chart`

## Query параметры
- `periodFrom`
- `periodTo`
- `objectId`

## `GET /api/finance/employees/:employeeId/analytics`
Возвращает основные показатели сотрудника.

## Поля ответа
- `employeeId`
- `fullName`
- `workStatus`
- `objectName`
- `totalCoins`
- `totalWorkDuration`
- `completedTasksCount`

## История активности
Элемент истории содержит:
- `activityId`
- `occurredAt`
- `objectName`
- `taskTitle`
- `activityType`
- `coins`
- `workDuration`

## Ошибки
- `400` — некорректный период.
- `401` — пользователь не авторизован.
- `403` — роль не имеет доступа.
- `404` — сотрудник не найден.
- `500` — ошибка загрузки аналитики.
