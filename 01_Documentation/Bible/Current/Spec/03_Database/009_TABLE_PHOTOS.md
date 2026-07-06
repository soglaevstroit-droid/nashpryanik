# 009 — Table Photos

## Назначение
Таблица `photos` хранит метаданные фотографий. Файлы хранятся во внешнем storage; PostgreSQL хранит связи и проверяемую историю.

## Таблица `photos`

| Поле | Тип | Обяз. | Ограничения | Описание |
|---|---|---:|---|---|
| `id` | `uuid` | да | PK | Идентификатор фото. |
| `company_id` | `uuid` | да | FK `companies.id` | Компания. |
| `uploaded_by` | `uuid` | да | FK `users.id` | Автор загрузки. |
| `object_id` | `uuid` | нет | FK `objects.id` | Объект. |
| `task_id` | `uuid` | нет | FK `tasks.id` | Задача. |
| `step_id` | `uuid` | нет | FK `task_steps.id` | Этап. |
| `work_session_id` | `uuid` | нет | FK `work_sessions.id` | Смена. |
| `photo_type` | `photo_type` | да | enum | Тип фото. |
| `status` | `photo_status` | да | enum | Ожидается, загружается, загружено, ошибка, отклонено. |
| `storage_key` | `text` | да | unique | Ключ файла в storage. |
| `mime_type` | `text` | нет | image/* | MIME-тип. |
| `size_bytes` | `bigint` | нет | `>= 0` | Размер файла. |
| `checksum` | `text` | нет | nullable | Контрольная сумма. |
| `created_at` | `timestamptz` | да | default now() | Создание. |

## Внешние ключи
- `company_id → companies.id`.
- `uploaded_by → users.id`.
- `object_id → objects.id`.
- `task_id → tasks.id`.
- `step_id → task_steps.id`.
- `work_session_id → work_sessions.id`.

## Индексы
- `idx_photos_company_created` на `(company_id, created_at desc)`.
- `idx_photos_uploaded_by` на `(company_id, uploaded_by, created_at desc)`.
- `idx_photos_task` на `(company_id, task_id)` where `task_id is not null`.
- `idx_photos_step` на `(company_id, step_id)` where `step_id is not null`.
- `idx_photos_session` на `(company_id, work_session_id)` where `work_session_id is not null`.
- `uq_photos_storage_key` unique на `(storage_key)`.

## Ограничения
- Фото всегда имеет автора.
- Фото всегда имеет `company_id`.
- Фото должно быть связано с бизнес-событием через задачу, этап, смену или аудит, если оно подтверждает действие.
- Бизнес-смысл фото не хранится только в имени файла.

## Примечания
Фото является доказательством, но не заменяет доменное событие. Завершение этапа, начало смены или невозможность выполнить задачу должны сохраняться отдельным событием и ссылаться на фото.
