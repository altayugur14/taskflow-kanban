import type { Card, Column } from "./types";

export const POSITION_STEP = 1000;
const MIN_GAP = 0.001;

export function sortByPosition<T extends { position: number; created_at?: string }>(
  rows: T[]
) {
  return [...rows].sort((a, b) => {
    if (a.position !== b.position) {
      return a.position - b.position;
    }

    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });
}

export function getColumnCards(cards: Card[], columnId: string) {
  return sortByPosition(cards.filter((card) => card.column_id === columnId));
}

export function getBetweenPosition(previous?: Card, next?: Card) {
  if (!previous && !next) {
    return POSITION_STEP;
  }

  if (!previous && next) {
    return next.position / 2;
  }

  if (previous && !next) {
    return previous.position + POSITION_STEP;
  }

  const gap = next!.position - previous!.position;
  if (gap <= MIN_GAP) {
    return null;
  }

  return previous!.position + gap / 2;
}

export function buildRenormalizedCards(cards: Card[], column: Column) {
  return cards.map((card, index) => ({
    ...card,
    board_id: column.board_id,
    column_id: column.id,
    position: (index + 1) * POSITION_STEP
  }));
}
