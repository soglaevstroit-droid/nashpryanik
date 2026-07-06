# API — 38 Финансовые отчеты

## Данные экрана
- `GET /api/finance/reports`
- `GET /api/finance/reports/export`
- `GET /api/finance/reports/filters`

## Query параметры
- `periodFrom`
- `periodTo`
- `objectId`
- `employeeId`
- `format`

## `GET /api/finance/reports`
Возвращает финансовый отчет для отображения на экране.

## Поля строки отчета
- `employeeId`
- `employeeName`
- `objectId`
- `objectName`
- `periodFrom`
- `periodTo`
- `earnedCoins`
- `bonus`
- `totalAmount`
- `aiRecommendation`

## `GET /api/finance/reports/export`
Возвращает файл выгрузки отчета в поддержанном формате.

## Форматы выгрузки
- `xlsx`
- `csv`
- `pdf`

## Ошибки
- `400` — некорректный период, фильтр или формат.
- `401` — пользователь не авторизован.
- `403` — роль не имеет доступа к отчетам.
- `500` — ошибка формирования отчета.
