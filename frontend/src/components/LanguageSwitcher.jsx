import React from "react";
import { Globe } from "lucide-react";
import { LANGUAGES } from "@/lib/i18n";
import { useApp } from "@/context/AppContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function LanguageSwitcher({ compact = false }) {
  const { lang, setLang } = useApp();
  const current = LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="lang-switcher-btn"
        className="inline-flex items-center gap-2 rounded-full border border-brand-line bg-white px-3 py-1.5 text-sm font-medium text-brand-ink hover:bg-brand-bg transition"
      >
        <Globe size={16} />
        {compact ? current.code.toUpperCase() : current.native}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {LANGUAGES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            data-testid={`lang-option-${l.code}`}
            onClick={() => setLang(l.code)}
            className={l.code === lang ? "font-semibold" : ""}
          >
            {l.native} <span className="ml-auto text-xs text-brand-mute">{l.code.toUpperCase()}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
