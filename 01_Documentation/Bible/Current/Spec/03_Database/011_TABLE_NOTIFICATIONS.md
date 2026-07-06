# 011 — Table Notifications

## Назначение
Таблица `notifications` хранит события, требующие внимания пользователя или роли. Уведомление не выполняет финансовое действие автоматически.

## Таблица `notifications`

| Поле | Тип | Обяз. | Ограничения | Описание |
|---|---|---:|---|---|
| `id` | `uuid` | да | PK | Идентификатор уведомления. |
| `company_id` | `uuid` | да | FK `companies.id` | Компания. |
| `recipient_user_id` | `uuid` | нет | FK `users.id` | Конкретный получатель. |
| `recipient_role` | `user_role` | нет | enum | Роль-получатель. |
| `type` | `notification_type` | да | enum | Тип уведомления. |
| `status` | `notification_status` | да | enum | Новое, просмотрено, обработано, скрыто. |
| `priority` | `notification_priority` | да | enum | Приоритет. |
| `title` | `text` | да | length > 0 | Заголовок. |
| `description` | `text` | нет | nullable | Описание. |
| `object_id` | `uuid` | нет | FK `objects.id` | Связанный объект. |
| `employee_id` | `uuid` | нет | FK `users.id` | Связанный сотрудник. |
| `related_entity_type` | `text` | нет | nullable | Тип связанной сущности. |
| `related_entity_id` | `uuid` | нет | nullable | Идентификатор связанной сущности. |
| `created_at` | `timestamptz` | да | default now() | Создание. |
| `read_at` | `timestamptz` | нет | nullable | Просмотр. |
| `resolved_at` | `timestamptz` | нет | nullable | Обработка. |

## Внешние ключи
- `company_id → companies.id`.
- `recipient_user_id → users.id`.
- `object_id → objects.id`.
- `employee_id → users.id`.

## Индексы
- `idx_notifications_user_status` на `(company_id, recipient_user_id, status, created_at desc)`.
- `idx_notifications_role_status` на `(company_id, recipient_role, status, created_at desc)`.
- `idx_notifications_type` на `(company_id, type, created_at desc)`.
- `idx_notifications_object` на `(company_id, object_id)` where `object_id is not null`.

## Ограничения
- Должен быть указан `recipient_user_id` или `recipient_role`.
- Уведомление не должно менять выплату, монеты или задачу само по себе.
- Связанная сущность проверяется backend.

## Примечания
Типы уведомлений соответствуют UI Bible: новые AI-рекомендации, большие отклонения, сотрудники без активности, подозрительные действия, готовые выплаты и события внимания.
