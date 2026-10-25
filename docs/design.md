# Design notes

Why `web_search` is a pi tool that sends its own Responses request, and how the search model was chosen.

## Options

OpenAI's Responses API has a hosted `web_search` tool. OpenAI runs the search on its side; the client only lists the tool in `tools`. There are two ways to give that to a pi agent.

1. **One request.** Add `{ "type": "web_search" }` to the tools of the agent's own model request, for example from a `before_provider_request` hook. The agent model searches in the middle of its turn.
2. **Two requests.** Register a pi tool named `web_search`. When the agent calls it, the tool sends a separate Responses request whose only tool is the hosted `web_search`, and returns the answer and its sources as the tool result.

## What other harnesses do

| Harness                                    | Shape                                                                                                                                                         | Search model                                                                         | Forces search                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Codex CLI (`openai/codex` at `9a8a85bc53`) | One request. `core/src/tools/hosted_spec.rs` adds `ToolSpec::WebSearch` to the main tool list, and `core/src/tools/router.rs` excludes it from local dispatch | The agent model                                                                      | No, the agent model decides                                                 |
| oh-my-pi (`can1357/oh-my-pi` at `664cb94`) | Two requests. `packages/coding-agent/src/web/search/providers/codex.ts` sends a Codex Responses request                                                       | A separate model, `gpt-5.6-luna` first, overridable with `PI_CODEX_WEB_SEARCH_MODEL` | Yes, `tool_choice: { type: "web_search" }`, except on models that reject it |
| pi-web-search 1.7.0 (npm)                  | Two requests, across many providers                                                                                                                           | The conversation model, or one set in `web-search.json`                              | No                                                                          |

## Why two requests

- **pi does not parse hosted search items.** pi's Responses stream parser (`packages/ai/src/api/openai-responses-shared.ts`) handles `message`, `reasoning`, `function_call` and `custom_tool_call` output items. A `web_search_call` item from the one-request shape would be dropped. The answer text would probably still arrive, but the search and its sources would be invisible, and the behavior would rest on how pi treats unknown items.
- **The search shows up as a tool call.** It appears in the TUI and in the session log like any other tool.
- **Failures stay inside the tool.** A rate limit or API error becomes a failed `web_search` result. The agent's turn continues.
- **It uses only the public extension API.** `registerTool` is enough. The agent's request is never rewritten.

The cost is one more round trip, and the search model sees only the query, not the conversation. The agent writes the query, so the second point matters little.

## Experiment

Each model was called through the `openai` provider with Sign in with ChatGPT, using two queries:

- a live question ("What is the latest release version of the earendil-works/pi coding agent on GitHub?")
- a question answerable without search ("What is the capital of France?")

Each pair was sent with and without `tool_choice: { type: "web_search" }`. One run per cell, all sent in parallel on 2026-10-25.

`gpt-5.4-mini` and `gpt-5.4-nano` returned 400 (`not supported when using Codex with a ChatGPT account`).

Searches per request:

| Model         | Live, forced | Live, auto | Trivial, forced | Trivial, auto |
| ------------- | ------------ | ---------- | --------------- | ------------- |
| gpt-6.1-sol   | 1            | 1          | 1               | 0             |
| gpt-6-sol     | 1            | 2          | 1               | 0             |
| gpt-6-luna    | 1            | 1          | 1               | 0             |
| gpt-6-astra   | 1            | 1          | 1               | 0             |
| gpt-5.6-luna  | 2            | 2          | 1               | 0             |
| gpt-5.6-terra | 1            | 1          | 1               | 0             |

Live question, forced:

| Model         | Time   | Input tokens | Output tokens | Reasoning tokens |
| ------------- | ------ | ------------ | ------------- | ---------------- |
| gpt-6.1-sol   | 6.0 s  | 8,510        | 98            | 36               |
| gpt-6-sol     | 7.4 s  | 8,518        | 98            | 48               |
| gpt-6-luna    | 7.6 s  | 8,612        | 74            | 33               |
| gpt-6-astra   | 10.3 s | 8,510        | 99            | 36               |
| gpt-5.6-luna  | 11.5 s | 12,806       | 179           | 137              |
| gpt-5.6-terra | 7.8 s  | 8,668        | 96            | 43               |

Findings:

- Every supported model accepted the forced `tool_choice`. None rejected it the way oh-my-pi's comment describes for GPT-5.6 Responses-Lite models.
- Without forcing, every model skipped the search for the trivial question. Once the agent has decided to call `web_search`, skipping is never wanted, so the request forces it.
- Cost and latency were close across the 6.x models. `gpt-5.6-luna` searched twice and reasoned more.

## Choices

- **Force the hosted tool** with `tool_choice: { type: "web_search" }`.
- **Search on `openai/gpt-6-luna`** regardless of the conversation model. The agent has already written the query, so a light model is enough. A fixed model also lets search work while the conversation uses another provider, as long as pi is logged in to `openai`.
- **`PI_OPENAI_WEB_SEARCH_MODEL`** overrides the model, for when the default is retired or another one is preferred.
