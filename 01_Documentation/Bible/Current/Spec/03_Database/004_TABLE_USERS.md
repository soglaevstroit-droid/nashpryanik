# 004 — Table Users

## Назначение
Таблица `users` хранит пользователей системы и их роль. Пользователь принадлежит компании, может быть монтажником, прорабом, финансистом или руководительской ролью.

## Таблица `users`

| Поле | Тип | Обяз. | Ограничения | Описание |
|---|---|---:|---|---|
| `id` | `uuid` | да | PK | Идентификатор пользователя. |
| `company_id` | `uuid` | да | FK `companies.id` | Компания пользователя. |
| `role` | `user_role` | да | enum | Роль: worker, foreman, finance, manager. |
| `full_name` | `text` | да | length > 0 | Имя пользователя для UI. |
| `phone` | `text` | нет | unique per company if used | Телефон для входа или связи. |
| `email` | `text` | нет | unique per company if used | Email, если используется авторизация по email. |
| `password_hash` | `text` | нет | backend-controlled | Хеш пароля, если используется парольная авторизация. |
| `photo_id` | `uuid` | нет | FK `photos.id` | Фото профиля. |
| `work_status` | `work_status` | да | default `left` | Текущий рабочий статус. |
| `is_active` | `boolean` | да | default true | Деактивация вместо удаления. |
| `created_at` | `timestamptz` | да | default now() | Создание записи. |
| `updated_at` | `timestamptz` | да | default now() | Последнее обновление. |
| `deleted_at` | `timestamptz` | нет | soft delete | Мягкое удаление, если требуется. |

## Внешние ключи
- `company_id → companies.id`.
- `photo_id → photos.id`.

## Индексы
- `idx_users_company_role` на `(company_id, role)`.
- `idx_users_company_active` на `(company_id, is_active)`.
- `idx_users_company_work_status` на `(company_id, work_status)`.
- `uq_users_company_phone` unique на `(company_id, phone)` where `phone is not null`.
- `uq_users_company_email` unique на `(company_id, email)` where `email is not null`.

## Ограничения
- Пользователь всегда принадлежит компании.
- Роль не должна выходить за enum `user_role`.
- Физическое удаление пользователя запрещено, если есть связанные задачи, смены, монеты, фото, выплаты или аудит.
- `work_status = working` должен соответствовать активной смене на уровне backend и контролироваться индексами в `work_sessions`.

## Связанные таблицы
- `work_sessions.user_id`.
- `tasks.created_by`.
- `task_assignees.user_id`.
- `photos.uploaded_by`.
- `coin_transactions.user_id`.
- `notifications.recipient_user_id`.
- `ai_recommendations.employee_id`.
- `audit_log.actor_user_id`.

## Примечания
Монтажник не видит тариф и лишнюю аналитику. Эти ограничения реализуются не отдельными полями пользователя, а ролевой проверкой backend и навигацией UI Bible.
