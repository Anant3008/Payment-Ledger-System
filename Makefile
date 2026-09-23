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


