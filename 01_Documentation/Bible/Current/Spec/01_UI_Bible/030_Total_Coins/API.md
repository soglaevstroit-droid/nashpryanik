# API — 30 Общая аналитика

## Данные экрана
- `GET /api/finance/analytics/summary`
- `GET /api/finance/analytics/days`
- `GET /api/finance/analytics/objects`
- `GET /api/finance/analytics/employees`

## Query параметры
- `periodFrom`
- `periodTo`
- `objectId`
- `employeeId`

## `GET /api/finance/analytics/summary`
Возвращает суммарные монеты и суммарное рабочее время.

## `GET /api/finance/analytics/days`
Возвращает динамику по дням.

## `GET /api/finance/analytics/objects`
Возвращает динамику по объектам.

## `GET /api/finance/analytics/employees`
Возвращает динамику по сотрудникам.

## Ошибки
- `400` — некорректный период или фильтр.
- `401` — пользователь не авторизован.
- `403` — роль не имеет доступа к финансовой аналитике.
- `500` — ошибка построения аналитики.
