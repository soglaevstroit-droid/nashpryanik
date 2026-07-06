# 020 — Testing

## Назначение
Документ описывает тестирование Flutter-приложения.

## Unit tests
Покрывают:
- formatters;
- validators;
- API error mapping;
- route guards;
- state reducers;
- upload queue logic.

## Widget tests
Проверяют:
- кнопки;
- карточки;
- формы;
- empty/error/loading states;
- role-based visibility;
- disabled actions.

## Integration tests
Проверяют сценарии:
- login → worker main;
- start work → camera → upload photo;
- take task → complete step;
- foreman creates task;
- finance opens AI recommendation → payment draft;
- notification opens related screen.

## Golden tests
Golden tests нужны для Design System components и ключевых экранов. Они защищают правило сохранения референсов минимум на 95%.

## Mock API
Mock API должен соответствовать API Bible. Ошибки должны возвращаться в едином формате.

## Offline tests
Проверяют:
- очередь фото;
- восстановление сети;
- retry;
- conflict handling.

## Security tests
Проверяют, что protected route не открывается без token и что роль не видит чужие экраны.
