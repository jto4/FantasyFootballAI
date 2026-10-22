import { useEffect, useState } from 'react';
import { helpArticles } from './help-content';
import { normalizeSearch } from './search';
import type { SearchDestination } from './search-catalog';

export function HelpPage({
  articleId = '',
  onNavigate,
  onSample,
}: {
  articleId?: string;
  onNavigate: (destination: SearchDestination) => boolean;
  onSample: () => void;
}) {
  const [filter, setFilter] = useState('');
  useEffect(() => {
    setFilter('');
    const article = document.getElementById(`help-${articleId}`);
    if (article instanceof HTMLDetailsElement) {
      article.open = true;
      article.scrollIntoView({ block: 'center', behavior: 'instant' });
      article.querySelector('summary')?.focus();
    }
  }, [articleId]);
  const query = normalizeSearch(filter);
  const articles = helpArticles.filter(
    (article) =>
      !query ||
      normalizeSearch(`${article.title} ${article.aliases} ${article.answer}`).includes(query) ||
      query
        .split(' ')
        .every((word) =>
          normalizeSearch(`${article.title} ${article.aliases} ${article.answer}`).includes(word),
        ),
  );
  return (
    <>
      <div className="page-title-block">
        <div>
          <p className="section-overline">GET ANSWERS & KEEP GOING</p>
          <h1>Help & FAQ</h1>
          <p>
            Find an answer, then go straight to the place that helps. You can also find these
            answers using the app search above.
          </p>
          <p className="help-shortcuts-hint">
            Press <kbd>?</kbd> anywhere to see keyboard shortcuts.
          </p>
        </div>
      </div>
      <section className="help-start">
        <h2>New here?</h2>
        <p>Explore a fictional league and practice editing a report before connecting anything.</p>
        <button type="button" className="primary-button" onClick={onSample}>
          Try a sample league
        </button>
      </section>
      <label className="help-filter">
        Find a help answer
        <input
          type="search"
          value={filter}
          maxLength={120}
          placeholder="Try “not sending” or “private league”"
          onChange={(event) => setFilter(event.target.value)}
        />
      </label>
      <p role="status">{articles.length} answers</p>
      {/* Grouped by topic in first-seen order so a filtered list keeps its relevance order. */}
      {[...new Set(articles.map((article) => article.category))].map((category) => (
        <section
          className="help-topic"
          key={category}
          aria-labelledby={`help-topic-${category.replace(/\W+/g, '-')}`}
        >
          <h2 id={`help-topic-${category.replace(/\W+/g, '-')}`}>{category}</h2>
          <div className="help-articles">
            {articles
              .filter((article) => article.category === category)
              .map((article) => (
                <details
                  id={`help-${article.id}`}
                  key={article.id}
                  className={`help-article ${articleId === article.id ? 'search-setting-highlight' : ''}`}
                >
                  <summary>{article.title}</summary>
                  <p>{article.answer}</p>
                  {'action' in article && (
                    <button
                      type="button"
                      className="small-button"
                      onClick={() => onNavigate(article.action)}
                    >
                      {article.action.label}
                    </button>
                  )}
                  {article.id === 'private-league' && (
                    <button
                      type="button"
                      className="small-button"
                      onClick={() => onNavigate({ section: 'Settings', settingId: 'yahoo-access' })}
                    >
                      Open Yahoo access
                    </button>
                  )}
                  {article.id === 'sample' && (
                    <button type="button" className="small-button" onClick={onSample}>
                      Try a sample league
                    </button>
                  )}
                  {article.id === 'ai-billing' && (
                    <p>
                      <a
                        href="https://help.openai.com/en/articles/9039756-managing-billing-settings-on-chatgpt-web-and-platform"
                        target="_blank"
                        rel="noreferrer"
                      >
                        OpenAI’s API billing guide
                      </a>
                    </p>
                  )}
                </details>
              ))}
          </div>
        </section>
      ))}
      {!articles.length && (
        <p>
          No help answers match yet. Try the app search above to find a setting, page, or report.
        </p>
      )}
    </>
  );
}
