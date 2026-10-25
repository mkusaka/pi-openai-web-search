import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export interface SearchResult {
  text: string;
  sources: { title: string; url: string }[];
}

// The ChatGPT-backed endpoint only streams, so read the SSE body and keep the final response.
export function parseSse(body: string): SearchResult {
  let response: any;
  const items: any[] = [];
  for (const line of body.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    const event = JSON.parse(data);
    if (event.type === "error" || event.type === "response.failed") {
      throw new Error(
        event.message ??
          event.error?.message ??
          event.response?.error?.message ??
          data,
      );
    }
    if (event.type === "response.output_item.done") items.push(event.item);
    if (
      event.type === "response.completed" ||
      event.type === "response.incomplete"
    ) {
      response = event.response;
    }
  }
  if (!response) throw new Error("OpenAI web search returned no response");

  let text = "";
  const sources = new Map<string, string>();
  // The ChatGPT-backed endpoint can finish with an empty output and only send items as events.
  const output = response.output?.length ? response.output : items;
  for (const item of output) {
    if (item.type === "web_search_call") {
      for (const s of item.action?.sources ?? []) {
        if (s?.url && !sources.has(s.url)) sources.set(s.url, s.title ?? s.url);
      }
    }
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) {
      if (c.type !== "output_text") continue;
      text += c.text ?? "";
      for (const a of c.annotations ?? []) {
        if (a.type === "url_citation" && a.url)
          sources.set(a.url, a.title ?? a.url);
      }
    }
  }
  return {
    text: text || "No answer available.",
    sources: [...sources].map(([url, title]) => ({ title, url })),
  };
}

export function formatResult({ text, sources }: SearchResult): string {
  if (sources.length === 0) return text;
  return `${text}\n\nSources:\n${sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}`;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web with OpenAI's native web_search tool, using the current OpenAI model and its credentials. Returns an answer with source URLs.",
    promptSnippet: "web_search: search the web for current information",
    parameters: Type.Object({
      query: Type.String({ description: "What to search for" }),
    }),
    async execute(_id, { query }, signal, _onUpdate, ctx) {
      const model = ctx.model as Model<Api> | undefined;
      if (model?.api !== "openai-responses") {
        throw new Error(
          `web_search needs an OpenAI Responses model; current model is ${model ? `${model.provider}/${model.id}` : "unset"}`,
        );
      }
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      if (!auth.ok) throw new Error(auth.error);

      const headers = new Headers({
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      });
      for (const [k, v] of Object.entries({
        ...model.headers,
        ...auth.headers,
      })) {
        if (typeof v === "string") headers.set(k, v);
      }
      if (auth.apiKey && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${auth.apiKey}`);
      }

      const res = await fetch(
        `${model.baseUrl.replace(/\/+$/, "")}/responses`,
        {
          method: "POST",
          headers,
          signal,
          body: JSON.stringify({
            model: model.id,
            input: [
              { role: "user", content: [{ type: "input_text", text: query }] },
            ],
            tools: [{ type: "web_search" }],
            include: ["web_search_call.action.sources"],
            stream: true,
            store: false,
          }),
        },
      );
      const body = await res.text();
      if (!res.ok) throw new Error(`OpenAI API error (${res.status}): ${body}`);

      const result = parseSse(body);
      return {
        content: [{ type: "text", text: formatResult(result) }],
        details: { sources: result.sources },
      };
    },
  });
}
