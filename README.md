# pi-openai-web-search

A [pi](https://pi.dev) extension that adds a `web_search` tool backed by OpenAI's native Responses API `web_search` tool.

When the model calls `web_search`, the extension sends a separate Responses request that forces OpenAI's hosted `web_search` tool. It uses the credentials pi already holds for the `openai` provider (API key or Sign in with ChatGPT), so no extra API key is needed.

## Install

```sh
pi install npm:pi-openai-web-search
```

## Use

Log in to the `openai` provider. The model can then call `web_search` with a `query`. The result is the answer text followed by its source URLs.

Searches run on `openai/gpt-6-luna` regardless of the conversation model. Set `PI_OPENAI_WEB_SEARCH_MODEL` to use another `openai` model.

See [docs/design.md](docs/design.md) for why search runs as a separate request and how the model was chosen.

## Development

```sh
bun install
bun fmt --check
bun run lint
bun run typecheck
bun test
```

## License

MIT
