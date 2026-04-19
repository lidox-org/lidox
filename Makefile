.PHONY: start stop reset install dev test lint typecheck build infra

start: ## Start all services (infrastructure + apps)
	./run.sh

stop: ## Stop Docker infrastructure
	./run.sh stop

reset: ## Stop + wipe Docker volumes (fresh database)
	./run.sh reset

infra: ## Start only PostgreSQL + Redis
	docker compose up -d --wait

install: ## Install all dependencies
	npm ci

dev: ## Start apps in development mode (requires infrastructure running)
	npm run dev

test: ## Run all tests
	npm test

lint: ## Run linter
	npm run lint

typecheck: ## Run TypeScript type check
	npm run typecheck

build: ## Build all packages and apps
	npm run build

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'
