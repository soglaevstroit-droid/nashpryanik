# 010 — Table Coins

## Назначение
Таблица `coin_transactions` хранит исторические транзакции монет. Монеты отражают подтвержденную работу и используются в аналитике, AI-рекомендациях, премиях и отчетах.

## Таблица `coin_transactions`

| Поле | Тип | Обяз. | Ограничения | Описание |
|---|---|---:|---|---|
| `id` | `uuid` | да | PK | Идентификатор транзакции. |
| `company_id` | `uuid` | да | FK `companies.id` | Компания. |
| `user_id` | `uuid` | да | FK `users.id` | Сотрудник, которому начислены монеты. |
| `object_id` | `uuid` | да | FK `objects.id` | Объект. |
| `task_id` | `uuid` | нет | FK `tasks.id` | Задача-источник. |
| `step_id` | `uuid` | нет | FK `task_steps.id` | Этап-источник. |
| `work_session_id` | `uuid` | да | FK `work_sessions.id` | Активная смена. |
| `amount` | `integer` | да | `amount >= 0` | Количество монет. |
| `transaction_type` | `coin_transaction_type` | да | enum | Тип транзакции. |
| `source_event` | `text` | да | length > 0 | Событие-источник. |
| `source_entity_type` | `text` | нет | nullable | Тип связанной сущности. |
| `source_entity_id` | `uuid` | нет | nullable | Идентификатор источника. |
| `created_at` | `timestamptz` | да | default now() | Время начисления. |

## Внешние ключи
- `company_id → companies.id`.
- `user_id → users.id`.
- `object_id → objects.id`.
- `task_id → tasks.id`.
- `step_id → task_steps.id`.
- `work_session_id → work_sessions.id`.

## Индексы
- `idx_coin_user_period` на `(company_id, user_id, created_at desc)`.
- `idx_coin_object_period` на `(company_id, object_id, created_at desc)`.
- `idx_coin_task` на `(company_id, task_id)` where `task_id is not null`.
- `idx_coin_step` на `(company_id, step_id)` where `step_id is not null`.
- `idx_coin_session` на `(company_id, work_session_id)`.

## Ограничения
- Монеты начисляются только в статусе `На работе`.
- Транзакция должна иметь источник.
- Прораб и финансист не начисляют монеты вручную.
- Исторические транзакции не удаляются физически.

## Примечания
Баланс монет вычисляется из транзакций. Для производительности допустимы агрегаты, но агрегаты должны быть воспроизводимы из `coin_transactions`.
