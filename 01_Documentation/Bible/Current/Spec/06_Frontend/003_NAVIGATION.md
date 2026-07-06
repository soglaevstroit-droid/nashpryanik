# 003 — Navigation

## Назначение
Документ описывает навигацию Flutter-приложения по экранам UI Bible.

## Общие правила
- После login пользователь попадает на стартовый экран роли.
- Нижняя навигация соответствует роли.
- Контекст передается через typed route params.
- Back navigation возвращает пользователя к предыдущему рабочему контексту.
- Недоступные действия скрываются или показываются как disabled, но backend все равно проверяет права.

## Монтажник
Старт:

```text
000_Login → 001_Worker_Main
```

Смена:

```text
001_Worker_Main → 002_Start_Work_Confirm → 003_Start_Work_Camera → 001_Worker_Main
001_Worker_Main → 011_Finish_Work → 001_Worker_Main
```

Задача:

```text
001_Worker_Main → 004_Task_Detail → 005_Take_Task_Confirm → 006_Task_In_Progress
006_Task_In_Progress → 007_Step_Work → 008_Step_Confirm → 009_Step_Done
007_Step_Work → 010_Cannot_Do
```

Дополнительно:
- `012_Worker_Messages`;
- `013_Worker_Profile`;
- `014_Task_History`.

## Прораб
Старт:

```text
000_Login → 015_Foreman_Employees
```

Потоки:
- `015_Foreman_Employees → 016_Foreman_Employee_Card`;
- `015_Foreman_Employees → 017_Task_Create → 018_Task_Step_Builder`;
- `015_Foreman_Employees → 019_Foreman_Messages`;
- `015_Foreman_Employees → 020_Foreman_Drafts`.

Первый экран прораба — список сотрудников, не объектный дашборд.

## Финансист
Старт:

```text
000_Login → 029_Finance_Main
```

Потоки:
- `029_Finance_Main → 030_Total_Coins`;
- `029_Finance_Main → 031_Employee_Analytics`;
- `031_Employee_Analytics → 032_AI_Recommendations`;
- `030_Total_Coins → 033_Finance_Gantt`;
- `033_Finance_Gantt → 034_Employee_Details`;
- `032_AI_Recommendations → 035_Payments`;
- `035_Payments → 036_Payment_History`;
- `030_Total_Coins → 037_Efficiency_Analytics`;
- `038_Financial_Reports`;
- `039_Finance_Notifications`;
- `040_Finance_Settings`.

## Системные экраны
Системные экраны `021`-`028` открываются как результат состояния:
- ошибка камеры;
- загрузка фото;
- нет задач;
- доступность задачи;
- задача завершена;
- получены монеты.

## Контекст
Typed params:
- `taskId`;
- `stepId`;
- `employeeId`;
- `objectId`;
- `periodFrom`;
- `periodTo`;
- `recommendationId`;
- `paymentId`;
- `notificationId`.
