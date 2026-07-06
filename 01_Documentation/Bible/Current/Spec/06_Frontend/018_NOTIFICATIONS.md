# 018 — Notifications

## Назначение
Документ описывает push, local и in-app уведомления во Flutter-приложении.

## In-app
In-app уведомления приходят из:

```http
GET /api/v1/notifications
```

UI отображает:
- тип;
- статус;
- приоритет;
- описание;
- связанную сущность;
- дату.

## Push
Push уведомление открывает приложение и передает route intent. Перед навигацией app проверяет auth, role и доступ к сущности.

## Local notifications
Local notifications используются для локальных состояний:
- завершилась загрузка фото;
- восстановлена сеть;
- pending sync требует внимания.

Они не заменяют backend notifications.

## Навигация после открытия
Mapping:
- `ai_recommendation` → AI recommendations;
- `large_deviation` → efficiency analytics;
- `employee_no_activity` → employee details;
- `payment_ready` → payments;
- `attention_required` → notification details or related screen.

## Статусы
Frontend вызывает:
- `POST /api/v1/notifications/{id}/read`;
- `POST /api/v1/notifications/{id}/resolve`.

## Ограничения
Уведомление не создает выплату и не принимает AI-рекомендацию автоматически.
