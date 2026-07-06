# 002 — Entities

## Назначение
Документ описывает основные сущности базы данных и их ключевые поля. Сущности соответствуют утвержденной бизнес-логике Project Bible, UI Bible и Architecture Bible.

## Company
Компания или рабочее пространство, в рамках которого существуют пользователи, объекты, задачи, фото, монеты, AI-рекомендации и уведомления.

Ключевые поля:
- `id`;
- `name`;
- `status`;
- `created_at`;
- `updated_at`.

## User
Пользователь системы: монтажник, прораб, финансист или руководительская роль.

Ключевые поля:
- `id`;
- `company_id`;
- `role`;
- `full_name`;
- `photo_id`;
- `work_status`;
- `is_active`;
- `created_at`;
- `updated_at`.

## Role
Роль пользователя. В MVP используется enum `user_role`: `worker`, `foreman`, `finance`, `manager`.

Ключевые поля:
- `role`;
- права доступа определяются backend и документацией ролей.

## Object
Строительный объект, к которому относятся сотрудники, задачи, смены, монеты, аналитика и финансовые отчеты.

Ключевые поля:
- `id`;
- `company_id`;
- `name`;
- `status`;
- `created_at`;
- `archived_at`.

## Task
Единица работы на объекте. Создается прорабом, может быть свободной или назначенной одному или нескольким исполнителям.

Ключевые поля:
- `id`;
- `company_id`;
- `object_id`;
- `created_by`;
- `title`;
- `description`;
- `status`;
- `deadline_at`;
- `started_at`;
- `finished_at`.

## TaskStep
Этап задачи с названием, описанием и необязательным фото-примером.

Ключевые поля:
- `id`;
- `company_id`;
- `task_id`;
- `title`;
- `description`;
- `status`;
- `example_photo_id`;
- `started_at`;
- `completed_at`.

## WorkSession
Рабочая смена сотрудника. Монеты начисляются только во время активной смены.

Ключевые поля:
- `id`;
- `company_id`;
- `user_id`;
- `object_id`;
- `status`;
- `started_at`;
- `finished_at`;
- `start_photo_id`;
- `finish_photo_id`.

## Photo
Метаданные фотографии, подтверждающей ключевые действия. Сам файл хранится во внешнем storage.

Ключевые поля:
- `id`;
- `company_id`;
- `uploaded_by`;
- `object_id`;
- `task_id`;
- `step_id`;
- `work_session_id`;
- `photo_type`;
- `storage_key`;
- `status`;
- `created_at`.

## CoinTransaction
Историческая транзакция монет. Отражает подтвержденную работу и используется аналитикой, финансами и AI.

Ключевые поля:
- `id`;
- `company_id`;
- `user_id`;
- `object_id`;
- `task_id`;
- `step_id`;
- `work_session_id`;
- `amount`;
- `transaction_type`;
- `source_event`;
- `created_at`.

## Notification
Уведомление для пользователя или роли о событии, требующем внимания.

Ключевые поля:
- `id`;
- `company_id`;
- `recipient_user_id`;
- `recipient_role`;
- `type`;
- `status`;
- `priority`;
- `related_entity_type`;
- `related_entity_id`;
- `created_at`.

## AIRecommendation
AI-рекомендация на основе подтвержденных данных. Она не является финальным решением.

Ключевые поля:
- `id`;
- `company_id`;
- `employee_id`;
- `object_id`;
- `period_from`;
- `period_to`;
- `paid_coins`;
- `ai_estimated_coins`;
- `difference`;
- `recommendation_type`;
- `explanation`;
- `confidence`;
- `status`;
- `created_at`.

## Payment
Историческая запись решения финансиста по выплате. В TASK 006 отдельный TABLE-файл для выплат не требуется, но сущность используется связями финансовых экранов.

Ключевые поля:
- `id`;
- `company_id`;
- `employee_id`;
- `object_id`;
- `recommendation_id`;
- `period_from`;
- `period_to`;
- `earned_coins`;
- `bonus`;
- `total_amount`;
- `approved_by`;
- `paid_at`.

## AuditLog
Журнал значимых действий системы.

Ключевые поля:
- `id`;
- `company_id`;
- `actor_user_id`;
- `actor_role`;
- `event_type`;
- `entity_type`;
- `entity_id`;
- `old_values`;
- `new_values`;
- `created_at`.
