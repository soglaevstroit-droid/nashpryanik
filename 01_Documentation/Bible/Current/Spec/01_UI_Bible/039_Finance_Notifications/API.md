# API — 39 Уведомления финансиста

## Данные экрана
- `GET /api/finance/notifications`
- `POST /api/finance/notifications/:notificationId/read`
- `POST /api/finance/notifications/:notificationId/resolve`

## Query параметры
- `periodFrom`
- `periodTo`
- `objectId`
- `type`
- `status`

## `GET /api/finance/notifications`
Возвращает список уведомлений финансиста.

## Поля уведомления
- `notificationId`
- `type`
- `status`
- `priority`
- `title`
- `description`
- `employeeId`
- `employeeName`
- `objectId`
- `objectName`
- `relatedEntityType`
- `relatedEntityId`
- `createdAt`

## Действия
- `POST /api/finance/notifications/:notificationId/read` отмечает уведомление просмотренным.
- `POST /api/finance/notifications/:notificationId/resolve` отмечает уведомление обработанным.

## Ошибки
- `400` — некорректный фильтр или статус.
- `401` — пользователь не авторизован.
- `403` — роль не имеет доступа.
- `404` — уведомление не найдено.
- `500` — ошибка загрузки уведомлений.
