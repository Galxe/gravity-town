// Web search module — Tavily API integration for Oracle agent

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const TAVILY_API_URL = "https://api.tavily.com/search";

export async function searchWeb(
  query: string,
  maxResults = 5
): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "TAVILY_API_KEY not set. Set it in your environment to enable web search."
    );
  }

  const response = await fetch(TAVILY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: "basic",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Tavily API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };

  return (data.results || []).map((r) => ({
    title: r.title || "",
    url: r.url || "",
    snippet: r.content || "",
  }));
}
