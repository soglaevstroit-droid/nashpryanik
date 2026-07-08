# EVENT TYPES

## Проект: СТРОИТ.РФ

Версия: 1.0

Статус: APPROVED

---

# Назначение

Настоящий документ определяет все типы событий системы.

Любое изменение состояния компании фиксируется событием.

---

# Структура событий

Все события делятся на категории.

---

# 001. Пользователь

- USER_CREATED
- USER_UPDATED
- USER_ROLE_CHANGED
- USER_ACTIVATED
- USER_DEACTIVATED

---

# 002. Авторизация

- USER_LOGGED_IN
- USER_LOGGED_OUT
- SESSION_STARTED
- SESSION_FINISHED

---

# 003. Рабочая смена

- WORK_SHIFT_STARTED
- WORK_SHIFT_PAUSED
- WORK_SHIFT_RESUMED
- WORK_SHIFT_FINISHED

---

# 004. Объект

- OBJECT_CREATED
- OBJECT_UPDATED
- OBJECT_ARCHIVED

---

# 005. Этаж

- FLOOR_CREATED
- FLOOR_UPDATED

---

# 006. Помещение

- ROOM_CREATED
- ROOM_UPDATED
- ROOM_COMPLETED

---

# 007. Задача

- TASK_CREATED
- TASK_UPDATED
- TASK_ASSIGNED
- TASK_ACCEPTED
- TASK_STARTED
- TASK_SENT_TO_REVIEW
- TASK_COMPLETED
- TASK_CANCELLED

---

# 008. Этап

- STEP_CREATED
- STEP_STARTED
- STEP_COMPLETED
- STEP_REOPENED

---

# 009. Фото

- PHOTO_CAPTURED
- PHOTO_UPLOADED
- PHOTO_APPROVED
- PHOTO_REJECTED
- PHOTO_DELETED

---

# 010. Проверка

- INSPECTION_STARTED
- INSPECTION_APPROVED
- INSPECTION_REJECTED

---

# 011. Монеты

- COINS_GRANTED
- COINS_REVOKED
- BONUS_GRANTED

---

# 012. Финансы

- PAYMENT_CREATED
- PAYMENT_APPROVED
- PAYMENT_COMPLETED

---

# 013. AI

- AI_ANALYSIS_CREATED
- AI_RECOMMENDATION_CREATED
- AI_WARNING_CREATED

---

# 014. Уведомления

- NOTIFICATION_SENT
- NOTIFICATION_READ

---

# 015. Система

- SYSTEM_ERROR
- SYSTEM_WARNING
- SYSTEM_UPDATED

---

# 016. Процесс

- PROCESS_CREATED
- PROCESS_STARTED
- PROCESS_PAUSED
- PROCESS_RESUMED
- PROCESS_COMPLETED
- PROCESS_CANCELLED

---

# Главное правило

Любое новое действие в системе должно использовать существующий тип события.

Если существующего типа недостаточно — создается новый стандарт события.

Произвольные события запрещены.

---

Статус документа

✅ APPROVED
