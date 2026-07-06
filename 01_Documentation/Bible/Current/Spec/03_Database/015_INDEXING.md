# 015 — Indexing

## Назначение
Документ описывает стратегию индексации PostgreSQL для быстрых экранов, аналитики, истории и финансовых запросов.

## Общие принципы
- Все доменные таблицы индексируются по `company_id`.
- Частые фильтры получают составные индексы.
- Исторические таблицы индексируются по времени.
- Для nullable FK используются partial indexes.
- Уникальность бизнес-ограничений фиксируется unique или partial unique indexes.

## Пользователи
- `(company_id, role)` — списки по ролям.
- `(company_id, is_active)` — активные пользователи.
- `(company_id, work_status)` — сотрудники на работе.
- unique `(company_id, phone)` where `phone is not null`.
- unique `(company_id, email)` where `email is not null`.

## Объекты
- `(company_id, status)` — активные и архивные объекты.
- `(company_id, name)` — поиск по названию.

## Задачи
- `(company_id, object_id, status)` — список задач объекта.
- `(company_id, current_worker_id)` where `current_worker_id is not null` — текущая задача сотрудника.
- `(company_id, deadline_at)` where `deadline_at is not null` — просрочки и Гант.
- partial unique на `(current_worker_id)` where `status = 'in_progress'` — одна задача в работе.

## Исполнители задач
- unique `(task_id, user_id)` — защита от дублей назначения.
- `(user_id, task_id)` — задачи сотрудника.

## Этапы
- `(task_id, position)` — порядок этапов.
- `(company_id, status)` — фильтры по статусу.
- `(company_id, completed_by)` where `completed_by is not null` — аналитика сотрудника.

## Рабочие смены
- `(company_id, user_id, started_at, finished_at)` — история и аналитика времени.
- `(company_id, object_id, started_at)` — аналитика объекта.
- partial unique `(user_id)` where `status = 'working'` — одна активная смена.
- `(company_id, status)` — работающие сотрудники.

## Фото
- `(company_id, created_at desc)` — история фото.
- `(company_id, uploaded_by, created_at desc)` — фото сотрудника.
- `(company_id, task_id)` where `task_id is not null`.
- `(company_id, step_id)` where `step_id is not null`.
- `(company_id, work_session_id)` where `work_session_id is not null`.
- unique `(storage_key)` — связь со storage.

## Монеты
- `(company_id, user_id, created_at desc)` — баланс и история сотрудника.
- `(company_id, object_id, created_at desc)` — аналитика объекта.
- `(company_id, task_id)` where `task_id is not null`.
- `(company_id, step_id)` where `step_id is not null`.
- `(company_id, work_session_id)` — проверка начислений в смене.

## Уведомления
- `(company_id, recipient_user_id, status, created_at desc)`.
- `(company_id, recipient_role, status, created_at desc)`.
- `(company_id, type, created_at desc)`.
- `(company_id, object_id)` where `object_id is not null`.

## AI-рекомендации
- `(company_id, employee_id, period_from, period_to)`.
- `(company_id, object_id, period_from, period_to)` where `object_id is not null`.
- `(company_id, status, created_at desc)`.
- `(company_id, recommendation_type, created_at desc)`.

## Audit log
- `(company_id, created_at desc)`.
- `(company_id, entity_type, entity_id, created_at desc)`.
- `(company_id, actor_user_id, created_at desc)` where `actor_user_id is not null`.
- `(company_id, event_type, created_at desc)`.

## Поля поиска
Основные поля поиска:
- пользователь: имя, телефон, email;
- объект: название;
- задача: название, статус, объект, исполнитель;
- уведомление: тип, статус, период;
- отчет: период, объект, сотрудник.

## Индексация аналитики
Для тяжелой аналитики допустимы materialized views или агрегатные таблицы, если они воспроизводимы из исторических таблиц и не становятся вторым источником истины.
