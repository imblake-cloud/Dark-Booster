.PHONY: setup start stop restart logs update help

help:
	@echo ""
	@echo "  Dark Booster — available commands"
	@echo ""
	@echo "  make setup     create config files from templates (run once before first start)"
	@echo "  make start     build image and start the service"
	@echo "  make stop      stop the service"
	@echo "  make restart   restart the service"
	@echo "  make logs      follow live logs"
	@echo "  make update    pull latest code and rebuild"
	@echo ""

setup:
	@[ -f .env ] \
		&& echo "  .env already exists — skipping" \
		|| (cp .env.example .env && echo "  .env created — open it and set API_HOST, API_TOKEN, etc.")
	@[ -f accounts.json ] \
		&& echo "  accounts.json already exists — skipping" \
		|| (cp accounts.json.example accounts.json && echo "  accounts.json created")
	@echo ""
	@echo "  Done. Edit .env, then run: make start"
	@echo ""

start:
	docker compose up -d --build

stop:
	docker compose down

restart:
	docker compose restart

logs:
	docker compose logs -f

update:
	git pull && docker compose up -d --build
