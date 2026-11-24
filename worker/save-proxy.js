// Cloudflare Worker: save pick 속보 4건을 대시보드용 JSON 으로 중계 (CORS 허용, 60초 캐시)
export default {
  async fetch(req) {
    const cors = { "access-control-allow-origin": "*", "content-type": "application/json; charset=utf-8" };
    try {
      const u = "https://www.saveticker.com/api/news/list?page=1&page_size=40&sort=created_at_desc&label_group=2&label_name=1";
      const r = await fetch(u, { cf: { cacheTtl: 60, cacheEverything: true } });
      if (!r.ok) return new Response(JSON.stringify({ error: r.status, news: [] }), { headers: cors });
      const j = await r.json();
      const news = (j.news_list || [])
        .filter(x => x.channel === "save-pick" && (x.content_labels || []).some(l => l.name === "속보"))
        .slice(0, 4)
        .map(x => ({ cat: "Save", at: Math.floor(Date.parse(x.created_at) / 1000), t: (x.title || "").trim(),
                     src: x.source || "SAVE PICK", l: "https://www.saveticker.com/news?label_group=2" }));
      return new Response(JSON.stringify({ news }), { headers: { ...cors, "cache-control": "public, max-age=60" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e), news: [] }), { headers: cors });
    }
  }
};
