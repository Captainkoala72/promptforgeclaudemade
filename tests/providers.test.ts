import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { NextRequest } from "next/server";
import { callModel, type CallModelArgs } from "../lib/callModel";
import { PROVIDERS } from "../lib/models";
import { buildSystemPrompt } from "../lib/prompts";
import { POST } from "../app/api/generate/route";
import { loadHistory } from "../lib/history";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
afterEach(() => { globalThis.fetch = originalFetch; process.env = { ...originalEnv }; });

const image = { name: "reference.png", bytes: 8, dataUrl: "data:image/png;base64,iVBORw0KGgo=" };
const argsFor = (id: string, webSearch = false): CallModelArgs => {
  const provider = PROVIDERS.find((provider) => provider.id === id)!;
  process.env[provider.envVar] = "test-key";
  process.env.ZAI_API_KEY = "search-key";
  return { provider: id, model: provider.models[0].id, effort: provider.models[0].defaultEffort,
    system: buildSystemPrompt("polisher", "general", "full-agent", true, "Keep the casual voice.", webSearch),
    user: "Write an email to {{CLIENT}}.", images: [image], webSearch };
};

function sse(events: any[], fragmented = true): Response {
  const text = events.map((event) => "data: " + (typeof event === "string" ? event : JSON.stringify(event))).join("\r\n\r\n");
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({ start(controller) {
    const size = fragmented ? 7 : bytes.length;
    for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size));
    controller.close();
  } }), { headers: { "Content-Type": "text/event-stream" } });
}

function chat(content = "Edited café prompt.", finish = "stop") {
  return sse([{ choices: [{ delta: { reasoning_content: "private thinking" } }] },
    { choices: [{ delta: { content } }] }, { choices: [{ delta: {}, finish_reason: finish }] }, "[DONE]"]);
}
function claude(content = "Edited café prompt.", stop = "end_turn") {
  return sse([
    { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "private thinking" } },
    { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "signed" } },
    { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: content } },
    { type: "message_delta", delta: { stop_reason: stop } }, { type: "message_stop" },
  ]);
}
async function collect(args: CallModelArgs) {
  const events = [];
  for await (const event of callModel(args)) events.push(event);
  return events;
}

for (const provider of PROVIDERS) {
  for (const webSearch of [false, true]) {
    test(provider.label + " routes prompt, editing instructions, images, effort, and search=" + webSearch, async () => {
      const args = argsFor(provider.id, webSearch);
      let requests = 0;
      globalThis.fetch = async (url, init) => {
        requests++;
        assert.equal(String(url), provider.baseUrl + provider.path);
        const headers = init!.headers as Record<string, string>;
        const body = JSON.parse(init!.body as string);
        assert.equal(body.model, args.model);
        assert.equal(body.stream, true);
        if (provider.protocol === "anthropic") {
          assert.equal(headers["x-api-key"], "test-key");
          assert.equal(headers["anthropic-version"], "2023-06-01");
          assert.equal(headers.Authorization, undefined);
          assert.equal(body.system, args.system);
          assert.equal(body.messages[0].content[0].text, args.user);
          assert.deepEqual(body.messages[0].content[1].source, { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" });
          assert.deepEqual(body.thinking, { type: "adaptive" });
          assert.equal(body.output_config.effort, args.effort);
          assert.equal(body.temperature, undefined);
          assert.equal(body.reasoning_effort, undefined);
          assert.equal(body.tools?.[0]?.type, webSearch ? "web_search_20260318" : undefined);
          return claude();
        }
        assert.match(headers.Authorization, /^Bearer /);
        if (provider.protocol === "responses") {
          assert.equal(body.instructions, args.system);
          assert.equal(body.input[0].content[0].text, args.user);
          assert.equal(body.input[0].content[1].image_url, image.dataUrl);
          assert.equal(body.reasoning.effort, args.effort);
          assert.equal(body.store, false);
          assert.equal(body.tools?.[0]?.type, webSearch ? "web_search" : undefined);
          return sse([{ type: "response.output_text.delta", delta: "Edited café prompt." }, { type: "response.completed", response: { output: [] } }]);
        }
        assert.equal(body.messages[0].content, args.system);
        assert.equal(body.messages[1].content[0].text, args.user);
        assert.equal(body.messages[1].content[1].image_url.url, image.dataUrl);
        assert.equal(body.reasoning_effort, args.effort);
        assert.equal(body.tools?.[0]?.type, webSearch ? provider.id === "moonshot" ? "builtin_function" : "function" : undefined);
        return chat();
      };
      const events = await collect(args);
      assert.equal(requests, 1);
      assert.equal(events.filter((event) => event.type === "delta").map((event) => event.text).join(""), "Edited café prompt.");
    });
  }
}

for (const effort of ["medium", "high", "xhigh", "max"]) {
  test("Claude adaptive thinking supports " + effort, async () => {
    const args = { ...argsFor("anthropic"), effort };
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      assert.equal(body.output_config.effort, effort);
      assert.equal(body.thinking.type, "adaptive");
      return claude();
    };
    await collect(args);
  });
}

for (const id of ["zai", "deepseek", "moonshot"]) {
  test(id + " completes fragmented search calls and preserves reasoning across tool turns", async () => {
    const args = argsFor(id, true);
    let turns = 0;
    let searches = 0;
    const toolName = id === "moonshot" ? "$web_search" : "web_search";
    const toolArgs = id === "moonshot" ? '{ "results": [{ "title": "Reference", "url": "https://example.com/reference" }] }' : '{"query":"current reference"}';
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init!.body as string);
      if (String(url).endsWith("/web_search")) {
        searches++;
        assert.equal(body.search_query, "current reference");
        return Response.json({ search_result: [{ title: "Reference", link: "https://example.com/reference", content: "Facts" }] });
      }
      turns++;
      if (turns === 1) return sse([
        { choices: [{ delta: { content: "I'll research first.", reasoning_content: "keep this reasoning" } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, id: "call-1", type: "function", function: { name: toolName, arguments: toolArgs.slice(0, 10) } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: toolArgs.slice(10) } }] }, finish_reason: "tool_calls" }] }, "[DONE]",
      ]);
      assert.equal(body.messages[2].reasoning_content, "keep this reasoning");
      assert.equal(body.messages[2].tool_calls[0].function.arguments, toolArgs);
      assert.equal(body.messages[3].tool_call_id, "call-1");
      if (id === "moonshot") assert.equal(body.messages[3].content, toolArgs);
      else assert.equal(JSON.parse(body.messages[3].content).results[0].content, "Facts");
      assert.equal(body.tools[0].function.name, toolName);
      return chat("Researched final prompt.");
    };
    const events = await collect(args);
    assert.equal(turns, 2);
    assert.equal(searches, id === "moonshot" ? 0 : 1);
    assert.deepEqual(events, [{ type: "source", source: { title: "Reference", url: "https://example.com/reference" } }, { type: "delta", text: "Researched final prompt." }]);
  });
}

test("Claude replays signed thinking and encrypted search blocks after pause_turn", async () => {
  const args = argsFor("anthropic", true);
  let turns = 0;
  globalThis.fetch = async (_url, init) => {
    turns++;
    if (turns === 1) return sse([
      { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "private" } },
      { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "signed" } },
      { type: "content_block_start", index: 1, content_block: { type: "server_tool_use", id: "srv-1", name: "web_search", input: {} } },
      { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"query":"facts"}' } },
      { type: "content_block_start", index: 2, content_block: { type: "web_search_tool_result", tool_use_id: "srv-1", content: [{ type: "web_search_result", title: "Facts", url: "https://example.com", encrypted_content: "opaque" }] } },
      { type: "message_delta", delta: { stop_reason: "pause_turn" } }, { type: "message_stop" },
    ]);
    const body = JSON.parse(init!.body as string);
    assert.deepEqual(body.messages[1].content[0], { type: "thinking", thinking: "private", signature: "signed" });
    assert.deepEqual(body.messages[1].content[1].input, { query: "facts" });
    assert.equal(body.messages[1].content[2].content[0].encrypted_content, "opaque");
    return claude("Final prompt.");
  };
  assert.deepEqual(await collect(args), [{ type: "source", source: { title: "Facts", url: "https://example.com/" } }, { type: "delta", text: "Final prompt." }]);
});

test("Meta citations become safe, deduplicated links and search preambles stay out of output", async () => {
  const args = argsFor("meta", true);
  const annotation = { type: "url_citation", title: "Source", url: "https://example.com" };
  globalThis.fetch = async () => sse([
    { type: "response.output_text.delta", delta: "Let me search." },
    { type: "response.output_item.added", item: { type: "web_search_call" } },
    { type: "response.output_text.delta", delta: "Final prompt." },
    { type: "response.output_text.annotation.added", annotation },
    { type: "response.output_text.annotation.added", annotation: { title: "Bad", url: "javascript:alert(1)" } },
    { type: "response.completed", response: { output: [{ content: [{ annotations: [annotation] }] }] } },
  ]);
  assert.deepEqual(await collect(args), [{ type: "source", source: { title: "Source", url: "https://example.com/" } }, { type: "delta", text: "Final prompt." }]);
});

test("search tool errors do not become successful output", async () => {
  const args = argsFor("anthropic", true);
  globalThis.fetch = async () => sse([{ type: "content_block_start", index: 0, content_block: { type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "unavailable" } } }]);
  await assert.rejects(collect(args), /web search failed: unavailable/);
});

test("truncated, empty, and failed provider streams are rejected", async () => {
  const args = argsFor("deepseek");
  globalThis.fetch = async () => sse([{ choices: [{ delta: { content: "Incomplete" } }] }]);
  await assert.rejects(collect(args), /connection ended/);
  globalThis.fetch = async () => chat("", "stop");
  await assert.rejects(collect(args), /no prompt/);
  globalThis.fetch = async () => chat("Cut off", "length");
  await assert.rejects(collect(args), /output limit/);
  globalThis.fetch = async () => Response.json({ error: { message: "Rate limited" } }, { status: 429 });
  await assert.rejects(collect(args), /Rate limited/);
});

test("missing keys and unsupported efforts fail before calling any API", async () => {
  const args = argsFor("anthropic");
  globalThis.fetch = async () => { throw new Error("fetch must not run"); };
  await assert.rejects(collect({ ...args, effort: "low" }), /doesn't support/);
  delete process.env.ANTHROPIC_API_KEY;
  await assert.rejects(collect(args), /ANTHROPIC_API_KEY isn't set/);
  const deepseek = argsFor("deepseek", true);
  delete process.env.ZAI_API_KEY;
  await assert.rejects(collect(deepseek), /requires ZAI_API_KEY/);
});

test("both modes keep separate editor instructions out of the source prompt", async () => {
  for (const mode of ["optimizer", "polisher"] as const) {
    for (const provider of PROVIDERS) {
      const args = argsFor(provider.id);
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(init!.body as string);
        const system = body.system ?? body.instructions ?? body.messages[0].content;
        assert.match(system, /Use a friendly tone\./);
        assert.match(system, /separate editing directions, not source text/);
        assert.match(system, /WEB RESEARCH: Web search is disabled/);
        return provider.protocol === "anthropic" ? claude() : provider.protocol === "responses"
          ? sse([{ type: "response.output_text.delta", delta: "Finished prompt." }, { type: "response.completed" }]) : chat();
      };
      const request = new NextRequest("http://localhost/api/generate", { method: "POST", body: JSON.stringify({ input: args.user, instructions: "Use a friendly tone.", provider: provider.id, model: args.model, effort: args.effort, mode }) });
      const response = await POST(request);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /"type":"done"/);
    }
  }
});

test("request validation rejects invalid instructions, toggles, and JSON shapes", async () => {
  for (const [body, status] of [[null, 400], [[], 400], [{ input: "x", instructions: 123 }, 400], [{ input: "x", instructions: "x".repeat(8001) }, 413], [{ input: "x", webSearch: "true" }, 400]] as const) {
    const response = await POST(new NextRequest("http://localhost/api/generate", { method: "POST", body: JSON.stringify(body) }));
    assert.equal(response.status, status);
  }
});

test("old history entries restore with empty instructions and search off", () => {
  const entry = { id: "old", input: "Draft", output: "Result", createdAt: Date.now() };
  const previous = (globalThis as any).window;
  (globalThis as any).window = { localStorage: { getItem: () => JSON.stringify([entry]) } };
  try {
    const [run] = loadHistory();
    assert.equal(run.instructions, "");
    assert.equal(run.webSearch, false);
    assert.deepEqual(run.sources, []);
  } finally { (globalThis as any).window = previous; }
});
