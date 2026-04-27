// Aplana el shape interno de search-participants al shape público.
// Interno: result.data = { targetUrl, criteria, pagination, count, rows, evidencePath }
// Público: { matches:[...], totalFound, page? }
module.exports = function formatPublic(result) {
  if (!result || !result.data) return null;

  const d = result.data;
  const pagination = d.pagination || {};

  const out = {
    matches: Array.isArray(d.rows) ? d.rows : [],
    totalFound:
      typeof pagination.estimatedTotal === "number"
        ? pagination.estimatedTotal
        : typeof d.count === "number"
        ? d.count
        : 0,
  };

  if (pagination.pagesFetched != null) {
    out.page = {
      pagesFetched: pagination.pagesFetched,
      pageLimit: pagination.pageLimit ?? null,
      hasNextPage: pagination.hasNextPage ?? null,
    };
  }

  return out;
};
