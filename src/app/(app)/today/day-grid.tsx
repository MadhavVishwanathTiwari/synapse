"use client";

import { Eraser } from "lucide-react";
import * as React from "react";

import { TAG_TEXT } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type {
  Category,
  DayCoverage,
  DayFidelity,
  DayGridRow,
  Goal,
  NotionColor,
  SlotKind,
} from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

import { clearSlots, fillActualFromPlan, paintSlots } from "./actions";
import { DayCloseDialog } from "./day-close-dialog";
import { clockLabel, formatHours, KIND_LABEL } from "./display";

export type CategoryOption = Pick<Category, "id" | "name" | "color">;
export type GoalOption = Pick<Goal, "id" | "title" | "horizon">;

type Range = { anchor: number; head: number };

function indicesOf(range: Range): number[] {
  const from = Math.min(range.anchor, range.head);
  const to = Math.max(range.anchor, range.head);
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/*
 * Optimistic patches, mirroring exactly what each Server Action writes. The grid
 * is used every day and a round trip per painted slot would make it unusable, so
 * the local view moves first and React reconciles it when the server answers.
 */
type Patch =
  | {
      type: "paint";
      indices: number[];
      kind: SlotKind;
      goalId: string | null;
      categoryId: string | null;
      note: string | null;
    }
  | { type: "clear"; indices: number[]; kind: SlotKind }
  | { type: "fillFromPlan" };

function applyPatch(rows: DayGridRow[], patch: Patch): DayGridRow[] {
  if (patch.type === "fillFromPlan") {
    // Gaps only. A slot that already records what happened is never overwritten
    // by what was intended — that would manufacture fidelity.
    return rows.map((row) =>
      row.has_planned && !row.has_actual
        ? {
            ...row,
            has_actual: true,
            actual_goal_id: row.planned_goal_id,
            actual_category_id: row.planned_category_id,
            actual_note: row.planned_note,
          }
        : row,
    );
  }

  const touched = new Set(patch.indices);

  return rows.map((row, index) => {
    if (!touched.has(index)) return row;

    if (patch.type === "clear") {
      return patch.kind === "planned"
        ? {
            ...row,
            has_planned: false,
            planned_goal_id: null,
            planned_category_id: null,
            planned_note: null,
          }
        : {
            ...row,
            has_actual: false,
            actual_goal_id: null,
            actual_category_id: null,
            actual_note: null,
          };
    }

    return patch.kind === "planned"
      ? {
          ...row,
          has_planned: true,
          planned_goal_id: patch.goalId,
          planned_category_id: patch.categoryId,
          planned_note: patch.note,
        }
      : {
          ...row,
          has_actual: true,
          actual_goal_id: patch.goalId,
          actual_category_id: patch.categoryId,
          actual_note: patch.note,
        };
  });
}

export function DayGrid({
  date,
  rows: serverRows,
  goals,
  categories,
  coverage,
  fidelity,
}: {
  date: string;
  timezone: string;
  rows: DayGridRow[];
  goals: GoalOption[];
  categories: CategoryOption[];
  coverage: DayCoverage | null;
  fidelity: DayFidelity | null;
}) {
  const [mode, setMode] = React.useState<SlotKind>("actual");
  const [goalId, setGoalId] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [note, setNote] = React.useState("");
  const [selection, setSelection] = React.useState<Range | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [, startTransition] = React.useTransition();
  const [rows, addOptimistic] = React.useOptimistic(serverRows, applyPatch);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<Range | null>(null);

  const categoryById = React.useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const goalById = React.useMemo(
    () => new Map(goals.map((g) => [g.id, g])),
    [goals],
  );

  const scrollTo = React.useCallback((index: number) => {
    containerRef.current
      ?.querySelector(`[data-slot="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, []);

  const paint = React.useCallback(
    (indices: number[]) => {
      if (indices.length === 0) return;
      setError(null);

      const goal = goalId || null;
      const category = categoryId || null;
      const trimmed = note.trim() || null;
      const slotStarts = indices
        .map((i) => serverRows[i]?.slot_start)
        .filter((s): s is string => Boolean(s));

      startTransition(async () => {
        addOptimistic({
          type: "paint",
          indices,
          kind: mode,
          goalId: goal,
          categoryId: category,
          note: trimmed,
        });

        const result = await paintSlots({
          date,
          kind: mode,
          slot_starts: slotStarts,
          goal_id: goal ?? undefined,
          category_id: category ?? undefined,
          note: trimmed ?? undefined,
        });

        if (result.error) setError(result.error);
      });
    },
    [addOptimistic, categoryId, date, goalId, mode, note, serverRows],
  );

  const erase = React.useCallback(
    (indices: number[]) => {
      if (indices.length === 0) return;
      setError(null);

      const slotStarts = indices
        .map((i) => serverRows[i]?.slot_start)
        .filter((s): s is string => Boolean(s));

      startTransition(async () => {
        addOptimistic({ type: "clear", indices, kind: mode });
        const result = await clearSlots({ date, kind: mode, slot_starts: slotStarts });
        if (result.error) setError(result.error);
      });
    },
    [addOptimistic, date, mode, serverRows],
  );

  const fillFromPlan = React.useCallback(() => {
    setError(null);
    startTransition(async () => {
      addOptimistic({ type: "fillFromPlan" });
      const result = await fillActualFromPlan({ date });
      if (result.error) setError(result.error);
    });
  }, [addOptimistic, date]);

  // A drag commits on release, wherever the pointer happens to be. dragRef is
  // only set by a pointerdown on a row, so a click anywhere else is inert.
  React.useEffect(() => {
    function onPointerUp() {
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag) paint(indicesOf(drag));
    }
    window.addEventListener("pointerup", onPointerUp);
    return () => window.removeEventListener("pointerup", onPointerUp);
  }, [paint]);

  /*
   * One tab stop and one keydown handler for 96 rows, rather than 96 tab stops.
   * This is the screen that gets used every evening, and it has to work without
   * the mouse.
   */
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const last = rows.length - 1;
    const current = selection?.head ?? -1;

    const move = (to: number, extend: boolean) => {
      const next = Math.max(0, Math.min(last, to));
      setSelection((prev) => ({
        anchor: extend && prev ? prev.anchor : next,
        head: next,
      }));
      scrollTo(next);
    };

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(current + 1, event.shiftKey);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(current <= 0 ? 0 : current - 1, event.shiftKey);
        break;
      case "PageDown":
        event.preventDefault();
        move(current + 4, event.shiftKey);
        break;
      case "PageUp":
        event.preventDefault();
        move(Math.max(0, current - 4), event.shiftKey);
        break;
      case "Home":
        event.preventDefault();
        move(0, event.shiftKey);
        break;
      case "End":
        event.preventDefault();
        move(last, event.shiftKey);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (selection) paint(indicesOf(selection));
        break;
      case "Backspace":
      case "Delete":
        event.preventDefault();
        if (selection) erase(indicesOf(selection));
        break;
      case "p":
      case "P":
        setMode("planned");
        break;
      case "a":
      case "A":
        setMode("actual");
        break;
      case "Escape":
        setSelection(null);
        break;
      default:
        break;
    }
  }

  const selectedIndices = selection ? indicesOf(selection) : [];
  const activeIndex = selection?.head ?? null;

  const categoryOptions = React.useMemo(
    () => [
      { value: "", label: "No category" },
      ...categories.map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories],
  );

  const goalOptions = React.useMemo(
    () => [
      { value: "", label: "No goal" },
      ...goals.map((g) => ({ value: g.id, label: `${g.horizon} · ${g.title}` })),
    ],
    [goals],
  );

  const brushCategory = categoryId ? categoryById.get(categoryId) : null;

  return (
    <div className="flex flex-col gap-3 px-8 py-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Mode</Label>
          <div className="flex rounded-sm border border-border p-0.5">
            {(["planned", "actual"] as SlotKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setMode(kind)}
                aria-pressed={mode === kind}
                className={cn(
                  "rounded-sm px-2.5 py-1 text-xs transition-colors",
                  mode === kind
                    ? "bg-bg-active text-text"
                    : "text-text-secondary hover:text-text",
                )}
              >
                {KIND_LABEL[kind]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brush-category">Category</Label>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "text-[10px] leading-none",
                brushCategory
                  ? TAG_TEXT[brushCategory.color as NotionColor]
                  : "text-text-tertiary",
              )}
              aria-hidden
            >
              ●
            </span>
            <Select
              id="brush-category"
              options={categoryOptions}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-[160px]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brush-goal">Goal</Label>
          <Select
            id="brush-goal"
            options={goalOptions}
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
            className="w-[240px]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="brush-note">Note</Label>
          <Input
            id="brush-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            placeholder="optional"
            className="w-[160px]"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={selectedIndices.length === 0}
            onClick={() => erase(selectedIndices)}
          >
            <Eraser className="size-3.5" />
            Clear
          </Button>
          <DayCloseDialog
            rows={rows}
            coverage={coverage}
            fidelity={fidelity}
            categories={categories}
            goals={goals}
            error={error}
            onFillFromPlan={fillFromPlan}
          />
        </div>
      </div>

      <p className="text-xs text-text-tertiary">
        Click or drag to fill {mode === "planned" ? "the plan" : "what happened"}.
        Arrow keys move, shift extends, <kbd>Enter</kbd> fills,{" "}
        <kbd>Delete</kbd> clears, <kbd>P</kbd> and <kbd>A</kbd> switch mode.
        {selectedIndices.length > 0 ? (
          <span className="ml-1 font-mono text-text-secondary">
            {selectedIndices.length} selected ·{" "}
            {formatHours(selectedIndices.length * 0.25)}
          </span>
        ) : null}
      </p>

      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border">
        <div className="grid grid-cols-[56px_1fr_1fr] border-b border-border bg-bg-sidebar text-xs">
          <span className="px-2 py-1.5 text-text-tertiary">Time</span>
          <span
            className={cn(
              "border-l border-border px-2 py-1.5",
              mode === "planned" ? "text-text" : "text-text-tertiary",
            )}
          >
            Plan
          </span>
          <span
            className={cn(
              "border-l border-border px-2 py-1.5",
              mode === "actual" ? "text-text" : "text-text-tertiary",
            )}
          >
            Actual
          </span>
        </div>

        <div
          ref={containerRef}
          role="listbox"
          aria-multiselectable
          aria-label="Time slots"
          aria-activedescendant={
            activeIndex === null ? undefined : `slot-${activeIndex}`
          }
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="max-h-[70vh] touch-none overflow-y-auto outline-none select-none focus-visible:outline-none"
        >
          {rows.map((row, index) => {
            const selected = selectedIndices.includes(index);
            const onTheHour = row.local_time.endsWith(":00:00");

            return (
              <div
                key={row.slot_start}
                id={`slot-${index}`}
                data-slot={index}
                role="option"
                aria-selected={selected}
                aria-label={`${clockLabel(row.local_time)}, ${row.has_actual ? "logged" : "empty"}`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  dragRef.current = { anchor: index, head: index };
                  setSelection({ anchor: index, head: index });
                  containerRef.current?.focus();
                }}
                onPointerEnter={() => {
                  if (!dragRef.current) return;
                  const next = { ...dragRef.current, head: index };
                  dragRef.current = next;
                  setSelection(next);
                }}
                className={cn(
                  "grid cursor-pointer grid-cols-[56px_1fr_1fr] border-t text-xs",
                  onTheHour ? "border-border" : "border-transparent",
                  // Outside the waking window is excluded from coverage's
                  // denominator, so it is dimmed rather than shown as a gap.
                  !row.in_waking_window && "bg-black/25",
                  selected && "bg-bg-selected",
                )}
              >
                <span
                  className={cn(
                    "px-2 py-1 font-mono",
                    onTheHour ? "text-text-secondary" : "text-text-tertiary",
                  )}
                >
                  {onTheHour
                    ? clockLabel(row.local_time)
                    : `:${row.local_time.slice(3, 5)}`}
                </span>

                <SlotCell
                  filled={row.has_planned}
                  categoryId={row.planned_category_id}
                  goalId={row.planned_goal_id}
                  note={row.planned_note}
                  categoryById={categoryById}
                  goalById={goalById}
                  active={mode === "planned"}
                />
                <SlotCell
                  filled={row.has_actual}
                  categoryId={row.actual_category_id}
                  goalId={row.actual_goal_id}
                  note={row.actual_note}
                  categoryById={categoryById}
                  goalById={goalById}
                  active={mode === "actual"}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SlotCell({
  filled,
  categoryId,
  goalId,
  note,
  categoryById,
  goalById,
  active,
}: {
  filled: boolean;
  categoryId: string | null;
  goalId: string | null;
  note: string | null;
  categoryById: Map<string, CategoryOption>;
  goalById: Map<string, GoalOption>;
  active: boolean;
}) {
  const category = categoryId ? categoryById.get(categoryId) : null;
  const goal = goalId ? goalById.get(goalId) : null;

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5 border-l border-border px-2 py-1",
        !active && "opacity-40",
      )}
    >
      {filled ? (
        <>
          <span
            className={cn(
              "text-[8px] leading-none",
              category ? TAG_TEXT[category.color as NotionColor] : "text-text-tertiary",
            )}
            aria-hidden
          >
            ●
          </span>
          <span className="truncate text-text">
            {category?.name ?? (goal ? goal.title : (note ?? "Logged"))}
          </span>
          {category && goal ? (
            <span className="truncate text-text-secondary">· {goal.title}</span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
