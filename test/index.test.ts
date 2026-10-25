import { expect, test } from "bun:test";
import { formatResult, parseSse } from "../src/index.ts";

const sse = (...events: object[]) =>
  events.map((e) => `event: x\ndata: ${JSON.stringify(e)}\n`).join("\n");

test("collects answer text and dedupes sources from search calls and citations", () => {
  const body = sse(
    { type: "response.output_text.delta", delta: "ignored" },
    {
      type: "response.completed",
      response: {
        output: [
          {
            type: "web_search_call",
            action: { sources: [{ url: "https://a.example", title: "A" }] },
          },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "answer",
                annotations: [
                  {
                    type: "url_citation",
                    url: "https://a.example",
                    title: "A cited",
                  },
                  {
                    type: "url_citation",
                    url: "https://b.example",
                    title: "B",
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  );
  const result = parseSse(body);
  expect(result).toEqual({
    text: "answer",
    sources: [
      { title: "A cited", url: "https://a.example" },
      { title: "B", url: "https://b.example" },
    ],
  });
  expect(formatResult(result)).toBe(
    "answer\n\nSources:\n- A cited: https://a.example\n- B: https://b.example",
  );
});

test("throws the provider error message", () => {
  expect(() =>
    parseSse(
      sse({
        type: "error",
        message: "subscription_sharing_usage_limit_exceeded",
      }),
    ),
  ).toThrow("subscription_sharing_usage_limit_exceeded");
});

test("throws when the stream has no final response", () => {
  expect(() => parseSse(sse({ type: "response.created" }))).toThrow(
    "no response",
  );
});

test("falls back to streamed output items when the final output is empty", () => {
  const body = sse(
    {
      type: "response.output_item.done",
      item: {
        type: "message",
        content: [{ type: "output_text", text: "streamed", annotations: [] }],
      },
    },
    { type: "response.completed", response: { output: [] } },
  );
  expect(parseSse(body)).toEqual({ text: "streamed", sources: [] });
});
