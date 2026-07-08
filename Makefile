SHELL := /bin/sh

ENV_FILE ?= $(if $(wildcard .env),.env,.env.example)
COMPOSE_FILE := infra/docker/docker-compose.yml
COMPOSE := docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE)

.PHONY: up down logs clean reset status

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

clean:
	$(COMPOSE) down -v --remove-orphans

reset: clean up

status:
	$(COMPOSE) ps
