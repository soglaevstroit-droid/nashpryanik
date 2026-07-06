# 012 — Table AI Recommendations

## Назначение
Таблица `ai_recommendations` хранит рекомендации ИИ. Рекомендация является объяснимой подсказкой и не является финальным решением.

## Таблица `ai_recommendations`

| Поле | Тип | Обяз. | Ограничения | Описание |
|---|---|---:|---|---|
| `id` | `uuid` | да | PK | Идентификатор рекомендации. |
| `company_id` | `uuid` | да | FK `companies.id` | Компания. |
| `employee_id` | `uuid` | да | FK `users.id` | Сотрудник. |
| `object_id` | `uuid` | нет | FK `objects.id` | Объект, если применимо. |
| `period_from` | `date` | да | `period_from <= period_to` | Начало периода. |
| `period_to` | `date` | да |  | Конец периода. |
| `paid_coins` | `integer` | да | `>= 0` | Начисленные монеты. |
| `ai_estimated_coins` | `integer` | да | `>= 0` | Оценка ИИ. |
| `difference` | `integer` | да | generated or checked | `ai_estimated_coins - paid_coins`. |
| `recommendation_type` | `ai_recommendation_type` | да | enum | Тип рекомендации. |
| `status` | `ai_recommendation_status` | да | enum | Готова, просмотрена, решение принято, ошибка. |
| `confidence` | `numeric(4,3)` | нет | `0 <= confidence <= 1` | Уверенность, если используется. |
| `explanation` | `jsonb` | да | object | Объяснение использованных данных. |
| `created_at` | `timestamptz` | да | default now() | Создание. |
| `viewed_at` | `timestamptz` | нет | nullable | Просмотр финансистом. |

## Внешние ключи
- `company_id → companies.id`.
- `employee_id → users.id`.
- `object_id → objects.id`.

## Индексы
- `idx_ai_rec_employee_period` на `(company_id, employee_id, period_from, period_to)`.
- `idx_ai_rec_object_period` на `(company_id, object_id, period_from, period_to)` where `object_id is not null`.
- `idx_ai_rec_status` на `(company_id, status, created_at desc)`.
- `idx_ai_rec_type` на `(company_id, recommendation_type, created_at desc)`.

## Ограничения
- `difference` должен равняться `ai_estimated_coins - paid_coins`.
- AI-рекомендация не утверждает выплату.
- AI-рекомендация не меняет начисленные монеты.
- Объяснение обязательно, чтобы рекомендация была проверяемой.

## Примечания
Если `difference > 0`, UI может показать рекомендацию выплатить премию. Финальное решение сохраняется человеком в финансовом процессе.
