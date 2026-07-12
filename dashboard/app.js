/**
 * Static dashboard — loads local JSON only. No upstream auth. No telemetry.
 */

async function loadFeed() {
  const res = await fetch("./data/sample-feed.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load sample-feed.json (${res.status})`);
  return res.json();
}

function statusTag(status) {
  const s = status || "unknown";
  const cls =
    s === "active" ? "ok" : s === "degraded" ? "warn" : s === "discontinued" ? "bad" : "";
  return `<span class="tag ${cls}">${escapeHtml(s)}</span>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sortOfferings(list) {
  // Cost-ish sort: free first, then lower input price; sponsored does not boost.
  return [...list].sort((a, b) => {
    const af = a.free ? 0 : 1;
    const bf = b.free ? 0 : 1;
    if (af !== bf) return af - bf;
    const ap = a.inputPerMillion ?? Number.POSITIVE_INFINITY;
    const bp = b.inputPerMillion ?? Number.POSITIVE_INFINITY;
    if (ap !== bp) return ap - bp;
    return String(a.id).localeCompare(String(b.id));
  });
}

function render(feed) {
  document.getElementById("headline").textContent =
    feed.headline || "gekiyasuLLM dashboard (static demo)";
  document.getElementById("feed-meta").textContent =
    `feed ${feed.feed_version || "?"} · generated ${feed.generated_at || "?"} · ${feed.note || ""}`;

  const local = feed.local || {};
  document.getElementById("proxy-url").textContent =
    local.proxy_default || "http://127.0.0.1:16191/v1";
  document.getElementById("phase-pin").textContent =
    `${local.phase || "?"} · ${local.local_pin || "?"}`;

  const tbody = document.getElementById("offerings-body");
  const rows = sortOfferings(feed.offerings || []);
  tbody.innerHTML = rows
    .map((o) => {
      const tags = [];
      if (o.free) tags.push('<span class="tag ok">free</span>');
      if (o.tools) tags.push('<span class="tag">tools</span>');
      if (o.sponsored) tags.push('<span class="tag sponsor">sponsored</span>');
      if (o.affiliate) tags.push('<span class="tag sponsor">affiliate</span>');
      if (o.editorial_rank_influence && o.editorial_rank_influence !== "none") {
        tags.push(`<span class="tag bad">rank:${escapeHtml(o.editorial_rank_influence)}</span>`);
      }
      const ctx =
        o.contextWindow != null
          ? `${Number(o.contextWindow).toLocaleString()} tok`
          : "—";
      return `<tr>
        <td>
          <div>${escapeHtml(o.marketingName || o.id)}</div>
          <div class="muted">${escapeHtml(o.id)}</div>
          <div>${tags.join("")}</div>
        </td>
        <td>${escapeHtml(o.providerId || "—")}<div class="muted">${escapeHtml(o.trustNote || "")}</div></td>
        <td>${statusTag(o.status)}</td>
        <td class="price">${escapeHtml(o.priceLabel || "—")}</td>
        <td>${escapeHtml(ctx)}</td>
      </tr>`;
    })
    .join("");
}

async function main() {
  const root = document.getElementById("app");
  try {
    const feed = await loadFeed();
    render(feed);
  } catch (err) {
    root.innerHTML = `<p class="error">${escapeHtml(err.message)}. Open via a static server (or proxy /dashboard), not always file://.</p>`;
  }
}

main();
