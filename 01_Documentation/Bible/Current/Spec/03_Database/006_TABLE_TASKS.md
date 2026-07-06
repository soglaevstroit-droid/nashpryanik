# 006 — Table Tasks

## Назначение
Таблицы `tasks` и `task_assignees` хранят задачи и назначенных исполнителей. Задача создается прорабом и может быть свободной или назначенной одному/нескольким сотрудникам.

## Таблица `tasks`

| Поле | Тип | Обяз. | Ограничения | Описание |
|---|---|---:|---|---|
| `id` | `uuid` | да | PK | Идентификатор задачи. |
| `company_id` | `uuid` | да | FK `companies.id` | Компания. |
| `object_id` | `uuid` | да | FK `objects.id` | Объект задачи. |
| `created_by` | `uuid` | да | FK `users.id` | Прораб, создавший задачу. |
| `title` | `text` | да | length > 0 | Название задачи. |
| `description` | `text` | нет | nullable | Описание. |
| `location_note` | `text` | нет | nullable | Помещение или уточнение места. |
| `status` | `task_status` | да | enum | Свободная, назначенная, в работе, завершенная, недоступная, отмененная. |
| `deadline_at` | `timestamptz` | нет | nullable | Срок, если задан. |
| `started_at` | `timestamptz` | нет | nullable | Фактическое начало. |
| `finished_at` | `timestamptz` | нет | nullable | Фактическое завершение. |
| `current_worker_id` | `uuid` | нет | FK `users.id` | Текущий исполнитель, если задача в работе. |
| `created_at` | `timestamptz` | да | default now() | Создание. |
| `updated_at` | `timestamptz` | да | default now() | Обновление. |
| `deleted_at` | `timestamptz` | нет | soft delete | Мягкое удаление до исторического использования. |

## Таблица `task_assignees`

| Поле | Тип | Обяз. | Ограничения | Описание |
|---|---|---:|---|---|
| `task_id` | `uuid` | да | FK `tasks.id` | Задача. |
| `user_id` | `uuid` | да | FK `users.id` | Назначенный исполнитель. |
| `assigned_by` | `uuid` | да | FK `users.id` | Прораб, назначивший исполнителя. |
| `created_at` | `timestamptz` | да | default now() | Дата назначения. |

## Внешние ключи
- `tasks.company_id → companies.id`.
- `tasks.object_id → objects.id`.
- `tasks.created_by → users.id`.
- `tasks.current_worker_id → users.id`.
- `task_assignees.task_id → tasks.id`.
- `task_assignees.user_id → users.id`.

## Индексы
- `idx_tasks_company_object_status` на `(company_id, object_id, status)`.
- `idx_tasks_current_worker` на `(company_id, current_worker_id)` where `current_worker_id is not null`.
- `idx_tasks_deadline` на `(company_id, deadline_at)` where `deadline_at is not null`.
- `uq_task_assignees` unique на `(task_id, user_id)`.
- Partial unique index на `(current_worker_id)` where `status = 'in_progress'` для ограничения одной задачи в работе.

## Ограничения
- Прораб создает задачи, но не начисляет монеты вручную.
- Монтажник может взять только доступную свободную или назначенную ему задачу.
- Одновременно у монтажника может быть только одна задача в работе.
- `finished_at >= started_at`, если обе даты заполнены.

## Примечания
Свободная задача определяется отсутствием записей в `task_assignees` и статусом, разрешающим взятие. Назначенная задача имеет одного или нескольких исполнителей.
