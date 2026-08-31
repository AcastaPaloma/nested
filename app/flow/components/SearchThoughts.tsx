"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, LoaderCircle, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type SearchResult = {
  type: "conversation" | "message";
  conversationId: string;
  conversationName: string;
  messageId?: string;
  content?: string;
  updatedAt: string;
};

type SearchThoughtsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (result: SearchResult) => void;
};

export function SearchThoughts({ open, onOpenChange, onSelect }: SearchThoughtsProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, {
          signal: controller.signal,
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || "Could not search your thoughts");
        setResults(data.results ?? []);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "Could not search your thoughts");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/30 p-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={() => onOpenChange(false)}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Search conversations and thoughts"
        className="w-full max-w-2xl overflow-hidden rounded-2xl border bg-background shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <Search className="size-5 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onOpenChange(false);
              if (event.key === "Enter" && results[0]) onSelect(results[0]);
            }}
            placeholder="Find a conversation or thought…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {isLoading && <LoaderCircle className="size-4 animate-spin text-muted-foreground" />}
          <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} aria-label="Close search">
            <X />
          </Button>
        </div>

        <div className="max-h-[58vh] overflow-y-auto p-2">
          {query.trim().length < 2 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Search every board by title or message text.
            </p>
          )}
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          {!error && query.trim().length >= 2 && !isLoading && results.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">No matching thoughts yet.</p>
          )}
          {results.map((result) => (
            <button
              key={`${result.type}:${result.conversationId}:${result.messageId ?? ""}`}
              onClick={() => onSelect(result)}
              className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-accent"
            >
              <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="mb-1 flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{result.conversationName}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {result.type === "message" ? "thought" : "board"}
                  </Badge>
                </span>
                {result.content && <span className="line-clamp-2 block text-sm text-muted-foreground">{result.content}</span>}
              </span>
            </button>
          ))}
        </div>

        <footer className="border-t px-4 py-2 text-[11px] text-muted-foreground">
          Enter opens the first result · Esc closes
        </footer>
      </section>
    </div>
  );
}
