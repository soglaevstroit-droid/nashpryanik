# 005 — Table Objects

## Назначение
Таблицы `companies` и `objects` обеспечивают масштабирование на множество компаний и строительных объектов. Объект является ключевым измерением задач, смен, монет, аналитики и финансовых отчетов.

## Таблица `companies`

| Поле | Тип | Обяз. | Ограничения | Описание |
|---|---|---:|---|---|
| `id` | `uuid` | да | PK | Идентификатор компании. |
| `name` | `text` | да | length > 0 | Название компании. |
| `status` | `company_status` | да | enum | Активна или архивирована. |
| `created_at` | `timestamptz` | да | default now() | Создание. |
| `updated_at` | `timestamptz` | да | default now() | Обновление. |
| `archived_at` | `timestamptz` | нет | nullable | Дата архивирования. |

## Таблица `objects`

| Поле | Тип | Обяз. | Ограничения | Описание |
|---|---|---:|---|---|
| `id` | `uuid` | да | PK | Идентификатор объекта. |
| `company_id` | `uuid` | да | FK `companies.id` | Компания-владелец. |
| `name` | `text` | да | length > 0 | Название объекта. |
| `description` | `text` | нет | nullable | Описание объекта. |
| `status` | `object_status` | да | enum | Активен или архивирован. |
| `created_at` | `timestamptz` | да | default now() | Создание. |
| `updated_at` | `timestamptz` | да | default now() | Обновление. |
| `archived_at` | `timestamptz` | нет | nullable | Дата архивирования. |

## Внешние ключи
- `objects.company_id → companies.id`.

## Индексы
- `idx_objects_company_status` на `(company_id, status)`.
- `idx_objects_company_name` на `(company_id, name)`.
- `idx_companies_status` на `(status)`.

## Ограничения
- Объект не удаляется физически после появления задач, смен, монет или выплат.
- Архивированный объект остается доступным для исторической аналитики и отчетов.
- Данные разных компаний не смешиваются.

## Связанные таблицы
- `tasks.object_id`.
- `work_sessions.object_id`.
- `photos.object_id`.
- `coin_transactions.object_id`.
- `notifications.object_id`.
- `ai_recommendations.object_id`.

## Примечания
Объект является фильтром для аналитики, диаграммы Ганта, карточки сотрудника, выплат, истории выплат и финансовых отчетов.
