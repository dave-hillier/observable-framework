import {useCallback, useEffect, useMemo, useRef, useState} from "react";

export interface SearchResult {
  id: string;
  title: string;
  score: number;
}

interface MiniSearchIndex {
  search(query: string, options?: Record<string, unknown>): SearchResult[];
}

const _indexCache = new Map<string, Promise<MiniSearchIndex>>();

function processTerm(term: string): string {
  return term
    .slice(0, 15)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function loadSearchIndex(base: string = "/"): Promise<MiniSearchIndex> {
  const key = base;
  if (!_indexCache.has(key)) {
    const normalizedBase = base.endsWith("/") ? base : base + "/";
    _indexCache.set(
      key,
      (async () => {
        const MiniSearch = (await import("minisearch")).default;
        const response = await fetch(`${normalizedBase}_observablehq/minisearch.json`);
        if (!response.ok) throw new Error(`unable to load minisearch.json: ${response.status}`);
        const json = await response.json();
        return MiniSearch.loadJS(json, {
          ...json.options,
          searchOptions: {
            boostDocument: (id: string) => (/^\w+:/.test(id) ? 1 / 3 : 1)
          },
          processTerm
        }) as unknown as MiniSearchIndex;
      })()
    );
  }
  return _indexCache.get(key)!;
}

/**
 * React hook that provides search functionality against the minisearch index.
 * Loads the index lazily on first use.
 *
 * @param base - Base URL path for the site (defaults to "/"). Used to locate
 *               the minisearch.json index file.
 */
export function useSearch(base: string = "/") {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const indexRef = useRef<MiniSearchIndex | null>(null);

  // Load the index eagerly when the hook is first used
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadSearchIndex(base).then(
      (index) => {
        if (!cancelled) {
          indexRef.current = index;
          setLoading(false);
        }
      },
      () => {
        if (!cancelled) setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Search when query changes
  useEffect(() => {
    if (!query || !indexRef.current) {
      setResults([]);
      setActiveIndex(0);
      return;
    }
    const hits = indexRef.current.search(query, {
      boost: {title: 4, keywords: 4},
      fuzzy: 0.15,
      prefix: true
    }) as SearchResult[];
    setResults(hits);
    setActiveIndex(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, onNavigate?: (path: string) => void) => {
      if (e.key === "Escape") {
        if (query === "") {
          (e.target as HTMLElement).blur();
        } else {
          setQuery("");
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && results.length > 0) {
        e.preventDefault();
        const result = results[activeIndex];
        if (!result) return;
        const isExternal = /^\w+:/.test(result.id);
        const openInNew = e.metaKey || e.ctrlKey;
        if (isExternal || openInNew) {
          window.open(result.id, "_blank");
        } else if (onNavigate) {
          onNavigate(result.id);
          setQuery("");
        } else {
          window.location.href = result.id;
        }
        return;
      }
    },
    [query, results, activeIndex]
  );

  return useMemo(
    () => ({query, setQuery, results, activeIndex, setActiveIndex, loading, handleKeyDown}),
    [query, results, activeIndex, loading, handleKeyDown]
  );
}
