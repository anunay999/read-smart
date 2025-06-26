# Simple helper Makefile for local development

.PHONY: install lint test ci

install:
	npm install

lint:
	npm run lint

test:
	npm test

# Run the full pipeline
ci: install lint test 