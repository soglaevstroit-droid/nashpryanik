# 007 — Table Task Steps

## Назначение
Таблица `task_steps` хранит этапы задач. Этап содержит название, описание и необязательное фото-пример.

## Таблица `task_steps`

| Поле | Тип | Обяз. | Ограничения | Описание |
|---|---|---:|---|---|
| `id` | `uuid` | да | PK | Идентификатор этапа. |
| `company_id` | `uuid` | да | FK `companies.id` | Компания. |
| `task_id` | `uuid` | да | FK `tasks.id` | Задача. |
| `position` | `integer` | да | `position > 0` | Порядок этапа. |
| `title` | `text` | да | length > 0 | Название этапа. |
| `description` | `text` | нет | nullable | Описание. |
| `status` | `step_status` | да | enum | Не начат, в работе, подтверждение, завершен, невозможно выполнить. |
| `example_photo_id` | `uuid` | нет | FK `photos.id` | Фото-пример от прораба. |
| `started_at` | `timestamptz` | нет | nullable | Начало выполнения. |
| `completed_at` | `timestamptz` | нет | nullable | Завершение. |
| `completed_by` | `uuid` | нет | FK `users.id` | Исполнитель этапа. |
| `cannot_do_reason` | `text` | нет | nullable | Причина невозможности выполнить. |
| `created_at` | `timestamptz` | да | default now() | Создание. |
| `updated_at` | `timestamptz` | да | default now() | Обновление. |

## Внешние ключи
- `company_id → companies.id`.
- `task_id → tasks.id`.
- `example_photo_id → photos.id`.
- `completed_by → users.id`.

## Индексы
- `idx_task_steps_task_position` на `(task_id, position)`.
- `idx_task_steps_company_status` на `(company_id, status)`.
- `idx_task_steps_completed_by` на `(company_id, completed_by)` where `completed_by is not null`.

## Ограничения
- `(task_id, position)` уникален.
- `completed_at >= started_at`, если обе даты заполнены.
- Этап не считается завершенным до успешной фиксации фото, если фото требуется сценарием.
- При статусе `cannot_do` должна быть сохранена причина, если UI требует объяснение.

## Связанные таблицы
- `photos.step_id`.
- `coin_transactions.step_id`.
- `audit_log`.

## Примечания
Этапы используются в прогрессе задач, аналитике, скорости закрытия этапов, диаграмме Ганта и расчете монет.
