import { OfficialSourceProvider } from './OfficialSourceProvider.js';

/**
 * Web publication provider placeholder.
 * Intentionally does not scrape arbitrary pages.
 * Enable only with a future verified structured extractor + approved URL allowlist.
 */
export class WebPublicationProvider extends OfficialSourceProvider {
  get key() {
    return 'web_publication';
  }

  async fetchUpdates(source) {
    throw new Error(
      `Web publication ingestion is not enabled for source ${source.id}. Configure an API/RSS/structured feed instead of blind scraping.`
    );
  }
}
