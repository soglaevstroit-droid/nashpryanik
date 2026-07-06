# API — 36 История выплат

## Данные экрана
- `GET /api/finance/payments/history`
- `GET /api/finance/payments/:paymentId`

## Query параметры
- `periodFrom`
- `periodTo`
- `objectId`
- `employeeId`

## `GET /api/finance/payments/history`
Возвращает список выплат с учетом фильтров.

## Поля записи
- `paymentId`
- `employeeId`
- `employeeName`
- `objectId`
- `objectName`
- `periodFrom`
- `periodTo`
- `earnedCoins`
- `aiRecommendedBonus`
- `bonus`
- `totalAmount`
- `approvedBy`
- `paidAt`

## `GET /api/finance/payments/:paymentId`
Возвращает детальную запись выплаты.

## Ошибки
- `400` — некорректный период или фильтр.
- `401` — пользователь не авторизован.
- `403` — роль не имеет доступа к истории выплат.
- `404` — запись выплаты не найдена.
- `500` — ошибка загрузки истории выплат.
