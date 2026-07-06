# API — 37 Аналитика эффективности

## Данные экрана
- `GET /api/finance/efficiency`
- `GET /api/finance/efficiency/deviations`
- `GET /api/finance/efficiency/ai-recommendations`

## Query параметры
- `periodFrom`
- `periodTo`
- `objectId`
- `employeeId`

## `GET /api/finance/efficiency`
Возвращает показатели эффективности сотрудников.

## Поля сотрудника
- `employeeId`
- `employeeName`
- `objectName`
- `efficiencyScore`
- `expectedScore`
- `factScore`
- `earnedCoins`
- `workDuration`
- `closedTasksCount`
- `averageStepCloseDuration`
- `deviation`

## `GET /api/finance/efficiency/deviations`
Возвращает список значимых отклонений.

## `GET /api/finance/efficiency/ai-recommendations`
Возвращает рекомендации ИИ по эффективности.

## Ошибки
- `400` — некорректный период или фильтр.
- `401` — пользователь не авторизован.
- `403` — роль не имеет доступа.
- `500` — ошибка расчета эффективности.
