# API — 33 Диаграмма Ганта

## Данные экрана
- `GET /api/finance/gantt`
- `GET /api/finance/gantt/filters`

## Query параметры
- `periodFrom`
- `periodTo`
- `objectId`
- `employeeId`
- `scale`

## `GET /api/finance/gantt`
Возвращает элементы диаграммы Ганта за выбранный период.

## Поля элемента
- `employeeId`
- `employeeName`
- `objectId`
- `objectName`
- `taskId`
- `taskTitle`
- `stepId`
- `stepTitle`
- `startedAt`
- `finishedAt`
- `durationMinutes`
- `status`
- `deadlineAt`
- `isOverdue`

## `GET /api/finance/gantt/filters`
Возвращает доступные объекты и сотрудников для фильтров.

## Ошибки
- `400` — некорректный период, фильтр или масштаб.
- `401` — пользователь не авторизован.
- `403` — роль не имеет доступа.
- `500` — ошибка построения диаграммы.
