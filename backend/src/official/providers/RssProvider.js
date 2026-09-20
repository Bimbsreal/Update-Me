import { OfficialSourceProvider } from './OfficialSourceProvider.js';
import { fetchTextWithTimeout } from './utils.js';
import { env } from '../../config/env.js';

function decodeXml(text) {
  return String(text || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function tagValue(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(re);
  return match ? decodeXml(match[1]) : null;
}

function linkValue(block) {
  const atom = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (atom?.[1]) return atom[1].trim();
  return tagValue(block, 'link');
}

/**
 * RSS / Atom provider for explicitly approved feed URLs.
 * Minimal parser — no blind website crawling.
 */
export class RssProvider extends OfficialSourceProvider {
  get key() {
    return 'rss';
  }

  async fetchUpdates(source) {
    if (!source.feedUrl || !/^https?:/i.test(source.feedUrl)) {
      throw new Error(`RSS provider requires an http(s) feed_url for source ${source.id}`);
    }

    const { text } = await fetchTextWithTimeout(source.feedUrl, {
      timeoutMs: env.OFFICIAL_PROVIDER_TIMEOUT_MS || 12000,
    });

    const itemBlocks = [...text.matchAll(/<item[\s\S]*?<\/item>/gi)].map((m) => m[0]);
    const entryBlocks = [...text.matchAll(/<entry[\s\S]*?<\/entry>/gi)].map((m) => m[0]);
    const blocks = itemBlocks.length ? itemBlocks : entryBlocks;

    if (!blocks.length) {
      throw new Error('RSS/Atom feed contained no items');
    }

    const defaultCategory = source.config?.defaultCategory || 'other';

    return blocks.slice(0, 50).map((block, index) => {
      const title = tagValue(block, 'title');
      const summary =
        tagValue(block, 'description') ||
        tagValue(block, 'summary') ||
        tagValue(block, 'content') ||
        null;
      const originalUrl = linkValue(block);
      const publishedAt =
        tagValue(block, 'pubDate') ||
        tagValue(block, 'published') ||
        tagValue(block, 'updated') ||
        null;
      const externalId =
        tagValue(block, 'guid') ||
        tagValue(block, 'id') ||
        (originalUrl ? originalUrl : `rss-${index}`);

      if (!title) {
        throw new Error('RSS item missing title');
      }

      return {
        externalId,
        title,
        summary: summary ? summary.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500) : null,
        originalUrl,
        category: defaultCategory,
        publishedAt,
        sourceMetadata: { format: itemBlocks.length ? 'rss' : 'atom' },
      };
    });
  }
}

/** Alias for atom feeds — same parser */
export class FeedProvider extends RssProvider {
  get key() {
    return 'structured_feed';
  }
}
