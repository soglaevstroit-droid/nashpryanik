# API — 35 Выплаты

## Данные экрана
- `GET /api/finance/payments/draft`
- `POST /api/finance/payments`
- `GET /api/finance/ai-recommendations/:recommendationId`

## Query параметры черновика
- `employeeId`
- `periodFrom`
- `periodTo`
- `objectId`
- `recommendationId`

## `GET /api/finance/payments/draft`
Возвращает данные для принятия решения по выплате.

## Поля черновика
- `employeeId`
- `employeeName`
- `objectName`
- `periodFrom`
- `periodTo`
- `earnedCoins`
- `aiRecommendedBonus`
- `aiExplanation`
- `bonus`
- `comment`
- `totalAmount`

## `POST /api/finance/payments`
Создает утвержденную запись выплаты решением финансиста.

## Тело запроса
- `employeeId`
- `periodFrom`
- `periodTo`
- `objectId`
- `earnedCoins`
- `aiRecommendedBonus`
- `bonus`
- `comment`
- `totalAmount`
- `recommendationId`

## Ошибки
- `400` — некорректные суммы, период или комментарий.
- `401` — пользователь не авторизован.
- `403` — роль не имеет доступа к выплатам.
- `404` — сотрудник или рекомендация не найдены.
- `409` — выплата за период уже создана.
- `500` — ошибка создания выплаты.
