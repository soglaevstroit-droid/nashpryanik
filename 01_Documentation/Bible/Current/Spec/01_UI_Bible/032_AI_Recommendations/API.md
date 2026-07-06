# API — 32 AI рекомендации

## Данные экрана
- `GET /api/finance/ai-recommendations`
- `GET /api/finance/ai-recommendations/:recommendationId`
- `POST /api/finance/ai-recommendations/:recommendationId/decision`

## Query параметры
- `periodFrom`
- `periodTo`
- `employeeId`
- `objectId`

## `GET /api/finance/ai-recommendations`
Возвращает список рекомендаций за выбранный период.

## Поля рекомендации
- `recommendationId`
- `employeeId`
- `employeeName`
- `paidCoins`
- `aiEstimatedCoins`
- `difference`
- `recommendationType`
- `explanation`
- `confidence`
- `createdAt`

## `POST /api/finance/ai-recommendations/:recommendationId/decision`
Фиксирует решение финансиста, если бизнес-процесс требует сохранения решения.

## Тело запроса решения
- `decision` — `accepted`, `rejected` или `deferred`.
- `comment` — необязательный комментарий финансиста.

## Ошибки
- `400` — некорректный период, решение или комментарий.
- `401` — пользователь не авторизован.
- `403` — роль не имеет доступа.
- `404` — рекомендация не найдена.
- `409` — рекомендация уже обработана.
- `500` — ошибка построения рекомендации.
