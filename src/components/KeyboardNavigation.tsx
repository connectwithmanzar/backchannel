"use client";
import { useState, useEffect } from "react";

export default function KeyboardNavigation() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept typing in input fields
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      // Toggle shortcuts modal with ?
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setModalOpen((prev) => !prev);
        return;
      }

      // Close modal with Escape
      if (e.key === "Escape") {
        setModalOpen(false);
        return;
      }

      // Find all job cards or review items on the current page
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>("li > article, [data-job-card], tr.align-top")
      );
      if (cards.length === 0) return;

      // J or ArrowDown: Next card
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = Math.min(cards.length - 1, prev + 1);
          highlightCard(cards, next);
          return next;
        });
        return;
      }

      // K or ArrowUp: Previous card
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = Math.max(0, prev - 1);
          highlightCard(cards, next);
          return next;
        });
        return;
      }

      // A: Auto-Apply / Prepare focused card
      if (e.key === "a" || e.key === "A") {
        if (selectedIndex >= 0 && selectedIndex < cards.length) {
          const card = cards[selectedIndex];
          const btn = card.querySelector<HTMLButtonElement | HTMLAnchorElement>(
            "button:has-text('Apply'), button:has-text('Prepare'), [title*='Auto-Apply'], button.bg-accent, .btn-primary"
          ) || card.querySelector<HTMLButtonElement>("button");
          if (btn) {
            e.preventDefault();
            btn.click();
          }
        }
        return;
      }

      // P: Download ATS PDF
      if (e.key === "p" || e.key === "P") {
        if (selectedIndex >= 0 && selectedIndex < cards.length) {
          const card = cards[selectedIndex];
          const pdfLink = card.querySelector<HTMLAnchorElement>("a[href*='/pdf']");
          if (pdfLink) {
            e.preventDefault();
            pdfLink.click();
          }
        }
        return;
      }
    }

    function highlightCard(cards: HTMLElement[], index: number) {
      cards.forEach((c, i) => {
        if (i === index) {
          c.classList.add("ring-2", "ring-accent", "ring-offset-2", "ring-offset-surface");
          c.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } else {
          c.classList.remove("ring-2", "ring-accent", "ring-offset-2", "ring-offset-surface");
        }
      });
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex]);

  return (
    <>
      {/* Keyboard Shortcuts Cheatsheet Modal */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-bold text-fg">Keyboard Navigation</h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-xs text-muted hover:text-fg"
              >
                ESC
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted">Next Job Card</span>
                <kbd className="rounded border border-line bg-sunk px-2 py-0.5 font-mono text-xs font-semibold">J</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Previous Job Card</span>
                <kbd className="rounded border border-line bg-sunk px-2 py-0.5 font-mono text-xs font-semibold">K</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">1-Click Auto-Apply / Prepare</span>
                <kbd className="rounded border border-line bg-sunk px-2 py-0.5 font-mono text-xs font-semibold">A</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Download Tailored ATS PDF</span>
                <kbd className="rounded border border-line bg-sunk px-2 py-0.5 font-mono text-xs font-semibold">P</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Open / Close this Menu</span>
                <kbd className="rounded border border-line bg-sunk px-2 py-0.5 font-mono text-xs font-semibold">?</kbd>
              </div>
            </div>

            <p className="mt-5 text-center text-xs text-muted">
              Press <kbd className="rounded bg-line/60 px-1 font-mono">?</kbd> anywhere to show this menu.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
