# pi-openai-web-search

A [pi](https://pi.dev) extension that adds a `web_search` tool backed by OpenAI's native Responses API `web_search` tool.

The tool sends a separate Responses request with the current OpenAI model and the credentials pi already holds for it (API key or Sign in with ChatGPT). No extra API key is needed. Searches count against the same account as the conversation.

## Install

```sh
pi install npm:pi-openai-web-search
```

## Use

Select a model whose API is `openai-responses` (for example the `openai` provider). The model can then call `web_search` with a `query`. The result is the answer text followed by its source URLs.

With any other model the tool returns an error.

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
