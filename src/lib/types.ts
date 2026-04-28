export type Board = {
  id: string;
  owner_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type Column = {
  id: string;
  board_id: string;
  title: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type Card = {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string | null;
  label: string | null;
  due_date: string | null;
  responsible: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type ActivityLog = {
  id: string;
  board_id: string;
  card_id: string;
  card_title: string;
  from_column_id: string | null;
  from_column_title: string | null;
  to_column_id: string;
  to_column_title: string;
  created_at: string;
};

export type BoardBundle = {
  board: Board;
  columns: Column[];
  cards: Card[];
  activity: ActivityLog[];
};
