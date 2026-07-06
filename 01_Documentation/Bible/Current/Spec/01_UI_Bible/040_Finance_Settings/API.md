# API — 40 Настройки финансиста

## Данные экрана
- `GET /api/finance/settings`
- `PUT /api/finance/settings`
- `GET /api/finance/settings/options`

## `GET /api/finance/settings`
Возвращает текущие настройки финансиста.

## Поля настроек
- `defaultAnalyticsPeriod`
- `coinsDisplayMode`
- `deviationThresholds`
- `bonusRules`
- `notificationSettings`
- `objectFilters`
- `viewOnlyMode`

## `PUT /api/finance/settings`
Сохраняет настройки финансиста.

## Тело запроса
- `defaultAnalyticsPeriod`
- `coinsDisplayMode`
- `deviationThresholds`
- `bonusRules`
- `notificationSettings`
- `objectFilters`
- `viewOnlyMode`

## `GET /api/finance/settings/options`
Возвращает доступные варианты периодов, режимов отображения, объектов и типов уведомлений.

## Ошибки
- `400` — некорректные настройки.
- `401` — пользователь не авторизован.
- `403` — роль не имеет доступа к настройкам.
- `409` — настройки были изменены в другой сессии.
- `500` — ошибка сохранения настроек.
