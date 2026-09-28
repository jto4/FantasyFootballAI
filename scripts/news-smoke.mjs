import { fetchFootballNewsWithStatus } from '../packages/integrations/dist/news.js';
import { supportedNewsSources } from '../packages/core/dist/index.js';

const sources = supportedNewsSources.map(({ id }) => id);
const results = await Promise.all(
  sources.map(async (source) => {
    try {
      const result = await fetchFootballNewsWithStatus([source]);
      const latest = result.items[0];
      return {
        source: latest?.source ?? source,
        status: 'ok',
        checkedAt: new Date().toISOString(),
        headlines: result.items.length,
        ...(latest ? { latestPublishedAt: latest.publishedAt, citation: latest.url } : {}),
      };
    } catch {
      return { source, status: 'failed', checkedAt: new Date().toISOString() };
    }
  }),
);

for (const result of results) console.log(JSON.stringify(result));
if (results.some((result) => result.status !== 'ok')) process.exitCode = 1;
