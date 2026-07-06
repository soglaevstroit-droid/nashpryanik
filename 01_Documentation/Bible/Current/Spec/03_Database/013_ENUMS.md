# 013 — Enums

## Назначение
Документ описывает PostgreSQL enum, используемые базой данных. Enum должны совпадать с утвержденными состояниями UI Bible и Architecture Bible.

## `user_role`
- `worker` — монтажник.
- `foreman` — прораб.
- `finance` — финансист.
- `manager` — руководительская роль.

## `company_status`
- `active` — активная компания.
- `archived` — архивирована.

## `object_status`
- `active` — объект используется.
- `archived` — объект архивирован, исторические данные доступны.

## `work_status`
- `working` — пользователь на работе.
- `left` — пользователь ушел.

## `work_session_status`
- `start_confirming` — начало подтверждается.
- `working` — активная смена.
- `finish_confirming` — завершение подтверждается.
- `left` — смена завершена.

## `task_status`
- `free` — свободная задача.
- `assigned` — назначенная задача.
- `in_progress` — задача в работе.
- `completed` — завершенная задача.
- `disabled` — недоступная для текущего пользователя.
- `cancelled` — отмененная, если статус используется реализацией.

## `step_status`
- `not_started` — этап не начат.
- `in_progress` — этап в работе.
- `confirming` — этап ожидает подтверждения.
- `completed` — этап завершен.
- `cannot_do` — этап невозможно выполнить.

## `photo_type`
- `work_start` — фото начала работы.
- `work_finish` — фото завершения работы.
- `task_confirmation` — фото подтверждения действия по задаче.
- `step_result` — фото результата этапа.
- `cannot_do` — фото причины невозможности выполнения.
- `step_example` — фото-пример этапа.
- `profile` — фото профиля.

## `photo_status`
- `expected` — ожидается.
- `capturing` — снимается на клиенте.
- `uploading` — загружается.
- `uploaded` — загружено.
- `upload_error` — ошибка загрузки.
- `rejected` — отклонено валидацией.

## `coin_transaction_type`
- `earned` — начисление за подтвержденную работу.

## `notification_type`
- `ai_recommendation` — новая AI-рекомендация.
- `large_deviation` — большое отклонение.
- `employee_no_activity` — сотрудник без активности.
- `suspicious_action` — подозрительное действие.
- `payment_ready` — готовая выплата.
- `attention_required` — событие, требующее внимания.

## `notification_status`
- `new` — новое.
- `viewed` — просмотрено.
- `resolved` — обработано.
- `hidden` — скрыто.
- `error` — ошибка обработки.

## `notification_priority`
- `low` — низкий приоритет.
- `normal` — обычный приоритет.
- `high` — высокий приоритет.

## `ai_recommendation_type`
- `bonus_recommended` — рекомендована премия.
- `no_bonus` — премия не рекомендована.
- `deviation_check` — требуется проверить отклонение.
- `suspicious_action_check` — требуется проверить подозрительное действие.
- `attention_required` — требуется внимание финансиста.

## `ai_recommendation_status`
- `pending` — ожидает расчета.
- `analyzing` — анализируется.
- `ready` — рекомендация готова.
- `viewed` — просмотрена.
- `human_decision_recorded` — решение человека зафиксировано.
- `error` — ошибка анализа.

## Правила enum
- Новое значение enum добавляется только после обновления Project, Architecture и UI Bible.
- Enum не должен вводить новую бизнес-логику сам по себе.
- UI-лейблы могут быть на русском языке, но значения enum остаются стабильными техническими идентификаторами.
