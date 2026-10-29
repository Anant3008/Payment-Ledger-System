DB_URL=postgres://postgres:postgres@localhost:5432/payment_ledger?sslmode=disable

migration:
	migrate create -ext sql -dir migrations -seq $(name)

migrate-up:
	migrate -path migrations -database "$(DB_URL)" up

migrate-down:
	migrate -path migrations -database "$(DB_URL)" down 1

migrate-version:
	migrate -path migrations -database "$(DB_URL)" version

test:
	go test -v -count=1 ./...

ui-build:
	npm run build
	python3 -c "open('web/index.html', 'w', encoding='utf-8').write(f'<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"><title>Payment Ledger Engine Console</title><script src=\"https://cdn.tailwindcss.com\"></script><link href=\"https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap\" rel=\"stylesheet\"></head><body class=\"bg-[#0b0b0a] text-[#ece8e1]\"><div id=\"root\"></div><script>{open(\"web/bundle.js\").read()}</script></body></html>')"

app-rebuild:
	docker compose build --no-cache app
	docker compose up -d app

NAME ?= baseline
RUNS ?= 3

benchmark:
	python3 benchmarks/run_benchmarks.py --name $(NAME) --runs $(RUNS)

benchmark-list:
	python3 benchmarks/run_benchmarks.py --list

benchmark-compare:
	python3 benchmarks/run_benchmarks.py --compare $(A) $(B)

benchmark-clean:
	python3 benchmarks/run_benchmarks.py --clean


