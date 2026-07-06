# 019 — Testing

## Назначение
Документ описывает стратегию тестирования backend: unit, integration, API, repository и service tests.

## Unit tests
Покрывают чистую бизнес-логику сервисов:
- одна активная задача у монтажника;
- монеты только в статусе `На работе`;
- расчет итоговой суммы выплаты;
- difference AI-рекомендации;
- validation периодов.

## Service tests
Проверяют сервисы с mock-репозиториями:
- `TaskService.takeTask`;
- `StepService.completeStep`;
- `WorkSessionService.start/finish`;
- `FinanceService.createPayment`;
- `AIService.recordHumanDecision`.

## Repository tests
Проверяют PostgreSQL-запросы:
- фильтрация по `company_id`;
- индексы и unique constraints;
- active session uniqueness;
- active task uniqueness;
- связи FK.

## Integration tests
Проверяют полный backend flow:
- login → start work → upload photo → take task → complete step → coins;
- foreman creates task → worker sees task;
- finance sees AI recommendation → creates payment;
- notification read/resolve.

## API tests
Проверяют HTTP-контракт:
- `/api/v1` prefix;
- JWT required;
- RBAC;
- error format;
- multipart upload;
- JSON examples соответствуют API Bible.

## Security tests
Проверяют:
- доступ к чужой компании запрещен;
- worker не создает выплату;
- foreman не начисляет монеты вручную;
- AI не утверждает выплату;
- недействительный JWT отклоняется.

## Test data
Тестовые данные должны отражать утвержденные роли и таблицы Database Bible. Тесты не должны вводить новые роли и бизнес-сценарии.
