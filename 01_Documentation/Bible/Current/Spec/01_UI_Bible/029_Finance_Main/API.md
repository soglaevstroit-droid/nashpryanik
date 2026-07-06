# API — 29 Главная финансиста

## Данные экрана
- `GET /api/finance/summary`
- `GET /api/finance/employees`
- `GET /api/employees/working-now`

## `GET /api/finance/summary`
Возвращает агрегированные финансовые показатели.

## Поля ответа
- `totalCoins` — сумма монет за все время.
- `workingEmployeesCount` — количество сотрудников сейчас на работе.
- `updatedAt` — время последнего пересчета.

## `GET /api/finance/employees`
Возвращает список сотрудников для главной финансиста.

## Поля сотрудника
- `employeeId`
- `fullName`
- `objectName`
- `workStatus`
- `totalCoins`
- `currentShiftDuration`

## Ошибки
- `401` — пользователь не авторизован.
- `403` — роль не имеет доступа к финансовым данным.
- `500` — ошибка расчета агрегатов.
