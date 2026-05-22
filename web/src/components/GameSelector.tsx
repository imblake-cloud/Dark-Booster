import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { searchGames } from "../services/api";
import type { GameOption } from "../types";

interface Props {
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  presets?: GameOption[];
  disabled?: boolean;
  onNamesResolved?: (entries: Array<[number, string]>) => void;
}

// Small gamepad icon for chips
function GameIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.6 }}>
      <rect x="1" y="3" width="10" height="6" rx="2" stroke="currentColor" strokeWidth="1"/>
      <path d="M4 5.5v2M3 6.5h2" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <circle cx="8.5" cy="5.8" r="0.6" fill="currentColor"/>
      <circle cx="9.5" cy="6.8" r="0.6" fill="currentColor"/>
    </svg>
  );
}

export function GameSelector({
  selectedIds,
  onChange,
  presets = [],
  disabled = false,
  onNamesResolved,
}: Props) {
  const [query,     setQuery]     = useState("");
  const [results,   setResults]   = useState<Array<{ appid: number; name: string }>>([]);
  const [isOpen,    setIsOpen]    = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [nameCache, setNameCache] = useState<Map<number, string>>(new Map());
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); setLoading(false); return; }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchGames(q, 20);
        setResults(data);
        const entries: Array<[number, string]> = data.map((r) => [r.appid, r.name]);
        setNameCache((prev) => {
          const next = new Map(prev);
          entries.forEach(([id, name]) => next.set(id, name));
          return next;
        });
        onNamesResolved?.(entries);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const getChipName = (id: number): string => {
    if (nameCache.has(id)) return nameCache.get(id)!;
    for (const p of presets) {
      if (p.appIds.length === 1 && p.appIds[0] === id) return p.label;
      if (p.appIds.includes(id)) return `${p.label} (${id})`;
    }
    return `App ${id}`;
  };

  const addId = (id: number, name?: string) => {
    if (selectedIds.includes(id)) return;
    if (name) {
      setNameCache((prev) => new Map(prev).set(id, name));
      onNamesResolved?.([[id, name]]);
    }
    onChange([...selectedIds, id]);
    setQuery("");
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const removeId = (id: number) => onChange(selectedIds.filter((x) => x !== id));

  const togglePreset = (appIds: number[], label: string) => {
    const allIn = appIds.every((id) => selectedIds.includes(id));
    if (allIn) {
      onChange(selectedIds.filter((id) => !appIds.includes(id)));
    } else {
      const entries: Array<[number, string]> = [];
      appIds.forEach((id) => {
        if (!nameCache.has(id)) entries.push([id, label]);
      });
      if (entries.length) {
        setNameCache((prev) => {
          const next = new Map(prev);
          entries.forEach(([id, name]) => next.set(id, name));
          return next;
        });
        onNamesResolved?.(entries);
      }
      onChange([...new Set([...selectedIds, ...appIds])]);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !query && selectedIds.length > 0) {
      removeId(selectedIds[selectedIds.length - 1]!);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const q = query.trim();
      const num = Number(q);
      if (Number.isInteger(num) && num > 0 && !selectedIds.includes(num)) {
        addId(num);
        return;
      }
      if (results.length > 0) addId(results[0]!.appid, results[0]!.name);
    }
    if (e.key === "Escape") setIsOpen(false);
  };

  const showDropdown = isOpen && query.trim().length >= 2;
  const showPresets  = presets.length > 0 && !disabled;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>

      {/* ── Preset quick-select buttons ─────────────────────── */}
      {showPresets && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
          {presets.map((opt) => {
            const active = opt.appIds.every((id) => selectedIds.includes(id));
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => togglePreset(opt.appIds, opt.label)}
                disabled={disabled}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "5px 10px",
                  borderRadius: 8,
                  fontSize: 11, fontWeight: 600,
                  fontFamily: "var(--font-sans)",
                  cursor: "pointer",
                  transition: "all 0.15s var(--spring)",
                  border: `1px solid ${active ? "rgba(201,168,76,0.35)" : "rgba(255,255,255,0.09)"}`,
                  background: active ? "rgba(201,168,76,0.12)" : "rgba(255,255,255,0.04)",
                  color: active ? "var(--db-accent)" : "rgba(255,255,255,0.5)",
                }}
              >
                {opt.label}
                {active && (
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ opacity: 0.8 }}>
                    <path d="M1.5 4.5l2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Chips + input ────────────────────────────────────── */}
      <div
        className="db-card-inset"
        style={{
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: 5,
          padding: "8px 10px", minHeight: 44,
          cursor: disabled ? "not-allowed" : "text",
          opacity: disabled ? 0.5 : 1,
          borderColor: isOpen ? "rgba(201,168,76,0.4)" : undefined,
          transition: "border-color 0.15s var(--spring)",
        }}
        onClick={() => { if (!disabled) { setIsOpen(true); inputRef.current?.focus(); } }}
      >
        {/* Selected game chips */}
        {selectedIds.map((id) => (
          <span
            key={id}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: "rgba(201,168,76,0.1)",
              border: "1px solid rgba(201,168,76,0.22)",
              borderRadius: 7, padding: "3px 7px 3px 6px",
              fontSize: 11, fontWeight: 600,
              color: "var(--db-accent)", whiteSpace: "nowrap",
              animation: "chip-in 0.18s var(--spring) both",
              letterSpacing: "-0.01em",
            }}
          >
            <GameIcon />
            {getChipName(id)}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeId(id); }}
              disabled={disabled}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "inherit", padding: "0 0 0 1px",
                lineHeight: 1, fontSize: 14, opacity: 0.45,
                display: "flex", alignItems: "center",
              }}
            >×</button>
          </span>
        ))}

        {/* Search input */}
        <input
          ref={inputRef}
          type="text"
          placeholder={selectedIds.length ? "" : "Search 150,000+ Steam games or enter App ID…"}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          disabled={disabled}
          style={{
            flex: "1 1 120px", minWidth: 80,
            background: "none", border: "none", outline: "none",
            color: "#fff", fontSize: 12, fontWeight: 500,
            fontFamily: "var(--font-sans)",
            padding: "1px 2px",
          }}
        />

        {/* Loading spinner */}
        {loading && (
          <div style={{
            width: 12, height: 12, borderRadius: "50%",
            border: "1.5px solid rgba(255,255,255,0.12)",
            borderTopColor: "var(--db-accent)",
            animation: "spin 0.6s linear infinite",
            flexShrink: 0,
          }} />
        )}
      </div>

      {/* ── Dropdown results ─────────────────────────────────── */}
      {showDropdown && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 5px)", left: 0, right: 0,
            zIndex: 200,
            background: "var(--db-bg2)",
            border: "1px solid var(--db-border-2)",
            borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)",
            maxHeight: 220, overflowY: "auto",
            padding: "4px",
          }}
        >
          {results.length === 0 && !loading && (
            <div style={{
              padding: "12px 14px",
              color: "rgba(255,255,255,0.28)",
              fontSize: 12, fontWeight: 500, textAlign: "center",
            }}>
              No results found
            </div>
          )}
          {results.map((r) => {
            const already = selectedIds.includes(r.appid);
            return (
              <button
                key={r.appid}
                type="button"
                onClick={() => addId(r.appid, r.name)}
                disabled={already}
                style={{
                  display: "flex", width: "100%", alignItems: "center", gap: 10,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: !already && hoveredId === r.appid ? "rgba(255,255,255,0.05)" : "none",
                  border: "none",
                  cursor: already ? "default" : "pointer",
                  color: already ? "rgba(210,190,155,0.28)" : "rgba(228,215,185,0.88)",
                  fontSize: 12, fontWeight: 500,
                  fontFamily: "var(--font-sans)",
                  textAlign: "left",
                  transition: "background 0.1s",
                  letterSpacing: "-0.01em",
                }}
                onMouseEnter={() => { if (!already) setHoveredId(r.appid); }}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Game thumbnail */}
                <div style={{
                  width: 56, height: 21, borderRadius: 5, flexShrink: 0,
                  background: "rgba(0,0,0,0.4)",
                  border: `1px solid ${already ? "rgba(255,255,255,0.07)" : "rgba(201,168,76,0.18)"}`,
                  overflow: "hidden",
                  opacity: already ? 0.3 : 1,
                }}>
                  <img
                    src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${r.appid}/capsule_sm_120.jpg`}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.style.display = "none";
                      img.parentElement!.style.background = "rgba(201,168,76,0.06)";
                    }}
                  />
                </div>

                {/* Game name */}
                <span style={{
                  flex: 1,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {r.name}
                </span>

                {/* App ID */}
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  color: "rgba(255,255,255,0.22)",
                  fontFamily: "var(--font-mono)",
                  flexShrink: 0,
                }}>
                  {r.appid}
                </span>

                {already && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: "var(--db-green)", flexShrink: 0 }}>
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
