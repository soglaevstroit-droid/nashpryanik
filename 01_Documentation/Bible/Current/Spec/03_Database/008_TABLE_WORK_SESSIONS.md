# 008 — Table Work Sessions

## Назначение
Таблица `work_sessions` хранит рабочие смены сотрудников. Монеты начисляются только во время активной смены.

## Таблица `work_sessions`

| Поле | Тип | Обяз. | Ограничения | Описание |
|---|---|---:|---|---|
| `id` | `uuid` | да | PK | Идентификатор смены. |
| `company_id` | `uuid` | да | FK `companies.id` | Компания. |
| `user_id` | `uuid` | да | FK `users.id` | Сотрудник. |
| `object_id` | `uuid` | да | FK `objects.id` | Объект смены. |
| `status` | `work_session_status` | да | enum | Начало подтверждается, на работе, завершение подтверждается, ушел. |
| `started_at` | `timestamptz` | нет | nullable до подтверждения | Время начала. |
| `finished_at` | `timestamptz` | нет | nullable | Время завершения. |
| `start_photo_id` | `uuid` | нет | FK `photos.id` | Фото начала, если требуется. |
| `finish_photo_id` | `uuid` | нет | FK `photos.id` | Фото завершения, если требуется. |
| `created_at` | `timestamptz` | да | default now() | Создание. |
| `updated_at` | `timestamptz` | да | default now() | Обновление. |

## Внешние ключи
- `company_id → companies.id`.
- `user_id → users.id`.
- `object_id → objects.id`.
- `start_photo_id → photos.id`.
- `finish_photo_id → photos.id`.

## Индексы
- `idx_work_sessions_user_period` на `(company_id, user_id, started_at, finished_at)`.
- `idx_work_sessions_object_period` на `(company_id, object_id, started_at)`.
- Partial unique index `uq_active_work_session` на `(user_id)` where `status = 'working'`.
- `idx_work_sessions_status` на `(company_id, status)`.

## Ограничения
- У сотрудника не может быть больше одной активной смены.
- `finished_at >= started_at`, если обе даты заполнены.
- Статус пользователя `На работе` должен соответствовать активной смене.
- После завершения смены новые монеты не начисляются до следующего начала работы.

## Связанные таблицы
- `photos.work_session_id`.
- `coin_transactions.work_session_id`.
- `audit_log`.

## Примечания
Рабочее время в аналитике считается из подтвержденных смен. Неподтвержденные или ошибочные состояния не должны давать точные аналитические значения.
