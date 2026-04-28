"use client";

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Session } from "@supabase/supabase-js";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  LayoutDashboard,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Sparkles
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  buildRenormalizedCards,
  getBetweenPosition,
  getColumnCards,
  POSITION_STEP,
  sortByPosition
} from "@/lib/positions";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import type { Board, Card, Column } from "@/lib/types";

type AuthMode = "signin" | "signup";

type PersistedMove = {
  cardId: string;
  boardId: string;
  columnId: string;
  position: number;
  renormalizedCards?: Card[];
};

export function TaskFlowApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState("");

  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoard, setActiveBoard] = useState<Board | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const [loadingBoards, setLoadingBoards] = useState(false);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [newCardTitles, setNewCardTitles] = useState<Record<string, string>>({});
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const sortedBoards = useMemo(
    () => [...boards].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [boards]
  );
  const sortedColumns = useMemo(() => sortByPosition(columns), [columns]);
  const activeCard = useMemo(
    () => cards.find((card) => card.id === activeCardId) ?? null,
    [activeCardId, cards]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
      }
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 160,
        tolerance: 8
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthMessage("");
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setBoards([]);
      setActiveBoard(null);
      setColumns([]);
      setCards([]);
      return;
    }

    void loadBoards();
    // Board loading should run when the authenticated user changes; later board
    // refreshes are explicit actions that should not retrigger this session effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function runRequest<T>(request: () => Promise<T>, fallbackMessage: string) {
    setError("");
    try {
      return await request();
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : fallbackMessage;
      setError(message);
      throw requestError;
    }
  }

  async function loadBoards(selectFirst = true) {
    if (!supabase || !session) return;

    const client = supabase;
    setLoadingBoards(true);
    await runRequest(async () => {
      const { data, error: boardsError } = await client
        .from("boards")
        .select("*")
        .order("created_at", { ascending: true });

      if (boardsError) throw boardsError;

      const nextBoards = (data ?? []) as Board[];
      setBoards(nextBoards);

      if (selectFirst && !activeBoard && nextBoards.length > 0) {
        await loadBoard(nextBoards[0]);
      }
    }, "Boards could not be loaded.").finally(() => setLoadingBoards(false));
  }

  async function loadBoard(board: Board) {
    if (!supabase) return;

    const client = supabase;
    setLoadingBoard(true);
    await runRequest(async () => {
      const [{ data: columnRows, error: columnsError }, { data: cardRows, error: cardsError }] =
        await Promise.all([
          client
            .from("columns")
            .select("*")
            .eq("board_id", board.id)
            .order("position", { ascending: true }),
          client
            .from("cards")
            .select("*")
            .eq("board_id", board.id)
            .order("position", { ascending: true })
        ]);

      if (columnsError) throw columnsError;
      if (cardsError) throw cardsError;

      setActiveBoard(board);
      setColumns((columnRows ?? []) as Column[]);
      setCards((cardRows ?? []) as Card[]);
    }, "Board could not be loaded.").finally(() => setLoadingBoard(false));
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setSaving(true);
    setAuthMessage("");
    setError("");

    const credentials = {
      email: authEmail.trim(),
      password: authPassword
    };

    const { data, error: authError } =
      authMode === "signin"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);

    setSaving(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (authMode === "signup" && !data.session) {
      setAuthMessage(
        "Account created. If this demo still asks for email confirmation, use the README demo-account path or disable confirmation in Supabase Auth settings."
      );
      return;
    }

    setAuthEmail("");
    setAuthPassword("");
  }

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  async function createBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session || !newBoardTitle.trim()) return;

    const client = supabase;
    setSaving(true);
    await runRequest(async () => {
      const { data, error: createError } = await client
        .from("boards")
        .insert({
          owner_id: session.user.id,
          title: newBoardTitle.trim()
        })
        .select()
        .single();

      if (createError) throw createError;

      const board = data as Board;
      setNewBoardTitle("");
      setBoards((current) => [...current, board]);
      await loadBoard(board);
    }, "Board could not be created.").finally(() => setSaving(false));
  }

  async function createSampleBoard() {
    if (!supabase || !session) return;

    const client = supabase;
    setSaving(true);
    await runRequest(async () => {
      const { data: boardData, error: boardError } = await client
        .from("boards")
        .insert({
          owner_id: session.user.id,
          title: "TaskFlow Demo Board"
        })
        .select()
        .single();

      if (boardError) throw boardError;

      const board = boardData as Board;
      const { data: columnRows, error: columnsError } = await client
        .from("columns")
        .insert([
          { board_id: board.id, title: "Todo", position: POSITION_STEP },
          { board_id: board.id, title: "In Progress", position: POSITION_STEP * 2 },
          { board_id: board.id, title: "Done", position: POSITION_STEP * 3 }
        ])
        .select();

      if (columnsError) throw columnsError;

      const demoColumns = (columnRows ?? []) as Column[];
      const byTitle = new Map(demoColumns.map((column) => [column.title, column]));
      const todo = byTitle.get("Todo");
      const progress = byTitle.get("In Progress");
      const done = byTitle.get("Done");

      const demoCards = [
        todo && {
          board_id: board.id,
          column_id: todo.id,
          title: "Create Supabase project",
          description: "Set Auth URL settings and run the schema.sql file.",
          position: POSITION_STEP
        },
        todo && {
          board_id: board.id,
          column_id: todo.id,
          title: "Test empty-column drop",
          description: "Move a card into any empty column and refresh.",
          position: POSITION_STEP * 2
        },
        progress && {
          board_id: board.id,
          column_id: progress.id,
          title: "Polish mobile board layout",
          description: "Use horizontal scroll and touch drag activation.",
          position: POSITION_STEP
        },
        done && {
          board_id: board.id,
          column_id: done.id,
          title: "Choose dnd-kit",
          description: "Modern, maintained, pointer/touch friendly drag-and-drop.",
          position: POSITION_STEP
        }
      ].filter(Boolean);

      if (demoCards.length > 0) {
        const { error: cardsError } = await client.from("cards").insert(demoCards);
        if (cardsError) throw cardsError;
      }

      setBoards((current) => [...current, board]);
      await loadBoard(board);
      setNotice("Sample board created.");
    }, "Sample board could not be created.").finally(() => setSaving(false));
  }

  async function createColumn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !activeBoard || !newColumnTitle.trim()) return;

    const client = supabase;
    const nextPosition =
      sortedColumns.length > 0
        ? sortedColumns[sortedColumns.length - 1].position + POSITION_STEP
        : POSITION_STEP;

    setSaving(true);
    await runRequest(async () => {
      const { data, error: createError } = await client
        .from("columns")
        .insert({
          board_id: activeBoard.id,
          title: newColumnTitle.trim(),
          position: nextPosition
        })
        .select()
        .single();

      if (createError) throw createError;

      setColumns((current) => [...current, data as Column]);
      setNewColumnTitle("");
    }, "Column could not be created.").finally(() => setSaving(false));
  }

  async function createCard(column: Column, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !activeBoard) return;

    const client = supabase;
    const title = newCardTitles[column.id]?.trim();
    if (!title) return;

    const columnCards = getColumnCards(cards, column.id);
    const nextPosition =
      columnCards.length > 0
        ? columnCards[columnCards.length - 1].position + POSITION_STEP
        : POSITION_STEP;

    setSaving(true);
    await runRequest(async () => {
      const { data, error: createError } = await client
        .from("cards")
        .insert({
          board_id: activeBoard.id,
          column_id: column.id,
          title,
          description: "",
          position: nextPosition
        })
        .select()
        .single();

      if (createError) throw createError;

      setCards((current) => [...current, data as Card]);
      setNewCardTitles((current) => ({ ...current, [column.id]: "" }));
    }, "Card could not be created.").finally(() => setSaving(false));
  }

  function openEditCard(card: Card) {
    setEditingCard(card);
    setEditTitle(card.title);
    setEditDescription(card.description ?? "");
  }

  async function saveCardEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !editingCard || !editTitle.trim()) return;

    const client = supabase;
    setSaving(true);
    await runRequest(async () => {
      const { data, error: updateError } = await client
        .from("cards")
        .update({
          title: editTitle.trim(),
          description: editDescription.trim()
        })
        .eq("id", editingCard.id)
        .eq("board_id", editingCard.board_id)
        .select()
        .single();

      if (updateError) throw updateError;

      const updatedCard = data as Card;
      setCards((current) =>
        current.map((card) => (card.id === updatedCard.id ? updatedCard : card))
      );
      setEditingCard(null);
    }, "Card could not be updated.").finally(() => setSaving(false));
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveCardId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveCardId(null);

    if (!activeBoard || !event.over) return;

    const cardId = String(event.active.id);
    const movingCard = cards.find((card) => card.id === cardId);
    if (!movingCard || movingCard.board_id !== activeBoard.id) return;

    const overId = String(event.over.id);
    if (overId === cardId) return;

    const overCard = cards.find((card) => card.id === overId);
    const targetColumnId = overId.startsWith("column:")
      ? overId.replace("column:", "")
      : overCard?.column_id;
    const targetColumn = columns.find((column) => column.id === targetColumnId);

    if (!targetColumn || targetColumn.board_id !== activeBoard.id) {
      setError("Cards can only be moved within the current board.");
      return;
    }

    const previousCards = cards;
    const move = buildMove(movingCard, targetColumn, overCard);

    if (!move) return;

    const optimisticCards = applyMove(previousCards, move);
    setCards(optimisticCards);
    setSaving(true);
    setError("");

    try {
      await persistMove(move);
    } catch (moveError) {
      setCards(previousCards);
      setError(
        moveError instanceof Error
          ? `Move was not saved: ${moveError.message}`
          : "Move was not saved. The board was restored to its previous state."
      );
      if (activeBoard) {
        await loadBoard(activeBoard);
      }
    } finally {
      setSaving(false);
    }
  }

  function buildMove(movingCard: Card, targetColumn: Column, overCard?: Card) {
    if (overCard && overCard.board_id !== targetColumn.board_id) {
      return null;
    }

    const targetCards = getColumnCards(cards, targetColumn.id).filter(
      (card) => card.id !== movingCard.id
    );
    const overIndex = overCard
      ? Math.max(
          0,
          targetCards.findIndex((card) => card.id === overCard.id)
        )
      : targetCards.length;
    const insertIndex = overCard ? overIndex : targetCards.length;
    const nextTargetCards = [...targetCards];
    nextTargetCards.splice(insertIndex, 0, {
      ...movingCard,
      board_id: targetColumn.board_id,
      column_id: targetColumn.id
    });

    const previous = nextTargetCards[insertIndex - 1];
    const next = nextTargetCards[insertIndex + 1];
    const nextPosition = getBetweenPosition(previous, next);

    if (nextPosition === null) {
      const renormalizedCards = buildRenormalizedCards(nextTargetCards, targetColumn);
      const renormalizedMovingCard = renormalizedCards.find(
        (card) => card.id === movingCard.id
      );

      if (!renormalizedMovingCard) return null;

      return {
        cardId: movingCard.id,
        boardId: targetColumn.board_id,
        columnId: targetColumn.id,
        position: renormalizedMovingCard.position,
        renormalizedCards
      };
    }

    if (
      movingCard.column_id === targetColumn.id &&
      Math.abs(movingCard.position - nextPosition) < 0.0001
    ) {
      return null;
    }

    return {
      cardId: movingCard.id,
      boardId: targetColumn.board_id,
      columnId: targetColumn.id,
      position: nextPosition
    };
  }

  function applyMove(currentCards: Card[], move: PersistedMove) {
    if (move.renormalizedCards) {
      const renormalizedById = new Map(
        move.renormalizedCards.map((card) => [card.id, card])
      );
      return currentCards.map((card) => {
        const updatedCard = renormalizedById.get(card.id);
        if (updatedCard) return updatedCard;
        if (card.id === move.cardId) {
          return {
            ...card,
            board_id: move.boardId,
            column_id: move.columnId,
            position: move.position
          };
        }
        return card;
      });
    }

    return currentCards.map((card) =>
      card.id === move.cardId
        ? {
            ...card,
            board_id: move.boardId,
            column_id: move.columnId,
            position: move.position
          }
        : card
    );
  }

  async function persistMove(move: PersistedMove) {
    if (!supabase) return;

    const client = supabase;
    if (move.renormalizedCards) {
      const updates = move.renormalizedCards.map((card) =>
        client
          .from("cards")
          .update({
            board_id: card.board_id,
            column_id: card.column_id,
            position: card.position
          })
          .eq("id", card.id)
          .eq("board_id", move.boardId)
      );

      const results = await Promise.all(updates);
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
      return;
    }

    const { error: updateError } = await client
      .from("cards")
      .update({
        board_id: move.boardId,
        column_id: move.columnId,
        position: move.position
      })
      .eq("id", move.cardId)
      .eq("board_id", move.boardId);

    if (updateError) throw updateError;
  }

  async function moveCardWithSelect(card: Card, columnId: string) {
    const targetColumn = columns.find((column) => column.id === columnId);
    if (!targetColumn || targetColumn.id === card.column_id) return;

    const previousCards = cards;
    const targetCards = getColumnCards(cards, targetColumn.id).filter(
      (candidate) => candidate.id !== card.id
    );
    const previous = targetCards[targetCards.length - 1];
    const position = getBetweenPosition(previous, undefined) ?? POSITION_STEP;
    const move = {
      cardId: card.id,
      boardId: targetColumn.board_id,
      columnId: targetColumn.id,
      position
    };

    setCards(applyMove(cards, move));
    setSaving(true);
    try {
      await persistMove(move);
    } catch (moveError) {
      setCards(previousCards);
      setError(
        moveError instanceof Error
          ? `Move was not saved: ${moveError.message}`
          : "Move was not saved."
      );
      if (activeBoard) await loadBoard(activeBoard);
    } finally {
      setSaving(false);
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="shell centered-shell">
        <section className="setup-card">
          <AlertCircle aria-hidden="true" />
          <h1>TaskFlow needs Supabase environment variables</h1>
          <p>
            Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then restart the app.
            The README includes the schema, RLS policies, and Vercel settings.
          </p>
        </section>
      </main>
    );
  }

  if (authLoading) {
    return (
      <main className="shell centered-shell">
        <Loader2 className="spin" aria-hidden="true" />
      </main>
    );
  }

  if (!session) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div>
            <p className="eyebrow">TaskFlow</p>
            <h1>TaskFlow Kanban</h1>
            <p className="muted">
              Create boards, organize cards, and keep every move saved.
            </p>
          </div>

          <form className="auth-form" onSubmit={handleAuth}>
            <div className="segmented-control" aria-label="Auth mode">
              <button
                type="button"
                className={authMode === "signin" ? "active" : ""}
                onClick={() => setAuthMode("signin")}
              >
                Log in
              </button>
              <button
                type="button"
                className={authMode === "signup" ? "active" : ""}
                onClick={() => setAuthMode("signup")}
              >
                Register
              </button>
            </div>
            <label>
              Email
              <input
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                autoComplete={
                  authMode === "signin" ? "current-password" : "new-password"
                }
                minLength={6}
                required
              />
            </label>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? <Loader2 className="spin" aria-hidden="true" /> : <ArrowRight />}
              {authMode === "signin" ? "Log in" : "Create account"}
            </button>
            {authMessage ? <p className="notice">{authMessage}</p> : null}
            {error ? <p className="error-text">{error}</p> : null}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">
            <LayoutDashboard size={20} aria-hidden="true" />
          </div>
          <div>
            <strong>TaskFlow</strong>
            <span>{session.user.email}</span>
          </div>
        </div>

        <form className="compact-form" onSubmit={createBoard}>
          <input
            value={newBoardTitle}
            onChange={(event) => setNewBoardTitle(event.target.value)}
            placeholder="New board"
            aria-label="New board title"
          />
          <button type="submit" aria-label="Create board" disabled={saving}>
            <Plus size={18} />
          </button>
        </form>

        <button
          className="sample-button"
          type="button"
          onClick={createSampleBoard}
          disabled={saving}
        >
          <Sparkles size={18} aria-hidden="true" />
          Create sample board
        </button>

        <section className="board-list-panel">
          <div className="panel-label">Your boards</div>
          <nav className="board-list" aria-label="Boards">
            {loadingBoards ? <p className="muted small">Loading boards...</p> : null}
            {!loadingBoards && sortedBoards.length === 0 ? (
              <p className="empty-copy">
                No boards yet. Create one or start with the sample board.
              </p>
            ) : null}
            {sortedBoards.map((board) => (
              <button
                key={board.id}
                type="button"
                className={activeBoard?.id === board.id ? "selected" : ""}
                onClick={() => loadBoard(board)}
              >
                {board.title}
              </button>
            ))}
          </nav>
        </section>

        <button className="ghost-button" type="button" onClick={handleSignOut}>
          <LogOut size={18} aria-hidden="true" />
          Log out
        </button>
      </aside>

      <section className="board-panel">
        <header className="board-header">
          <div>
            <p className="eyebrow">Kanban board</p>
            <h1>{activeBoard?.title ?? "Select or create a board"}</h1>
          </div>
          <div className="status-row">
            {saving ? (
              <span className="saving-pill">
                <Loader2 className="spin" size={16} aria-hidden="true" />
                Saving
              </span>
            ) : notice ? (
              <span className="success-pill">
                <CheckCircle2 size={16} aria-hidden="true" />
                {notice}
              </span>
            ) : null}
            {activeBoard ? (
              <button
                className="icon-button"
                type="button"
                onClick={() => loadBoard(activeBoard)}
                aria-label="Refresh board"
              >
                <RefreshCw size={18} />
              </button>
            ) : null}
          </div>
        </header>

        {error ? (
          <div className="error-banner" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            {error}
          </div>
        ) : null}

        {!activeBoard ? (
          <section className="empty-board">
            <h2>No board selected</h2>
            <p>Create a board from the sidebar or generate the sample board.</p>
          </section>
        ) : loadingBoard ? (
          <section className="empty-board">
            <Loader2 className="spin" aria-hidden="true" />
            <p>Loading board...</p>
          </section>
        ) : (
          <>
            <form className="column-form" onSubmit={createColumn}>
              <input
                value={newColumnTitle}
                onChange={(event) => setNewColumnTitle(event.target.value)}
                placeholder="Add column"
                aria-label="New column title"
              />
              <button className="primary-button" type="submit" disabled={saving}>
                <Plus size={18} aria-hidden="true" />
                Add column
              </button>
            </form>

            {sortedColumns.length === 0 ? (
              <section className="empty-board">
                <h2>This board is empty</h2>
                <p>Add columns like Todo, In Progress, and Done to start moving cards.</p>
              </section>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <div className="kanban-scroll" aria-label="Kanban columns">
                  {sortedColumns.map((column) => (
                    <KanbanColumn
                      key={column.id}
                      column={column}
                      cards={getColumnCards(cards, column.id)}
                      columns={sortedColumns}
                      newCardTitle={newCardTitles[column.id] ?? ""}
                      onNewCardTitleChange={(value) =>
                        setNewCardTitles((current) => ({
                          ...current,
                          [column.id]: value
                        }))
                      }
                      onCreateCard={(event) => createCard(column, event)}
                      onEditCard={openEditCard}
                      onMoveCard={moveCardWithSelect}
                    />
                  ))}
                </div>
                <DragOverlay>
                  {activeCard ? <CardPreview card={activeCard} isOverlay /> : null}
                </DragOverlay>
              </DndContext>
            )}
          </>
        )}
      </section>

      {editingCard ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={saveCardEdit}>
            <h2>Edit card</h2>
            <label>
              Title
              <input
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                required
              />
            </label>
            <label>
              Description
              <textarea
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                rows={6}
              />
            </label>
            <div className="modal-actions">
              <button
                className="ghost-button"
                type="button"
                onClick={() => setEditingCard(null)}
              >
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={saving}>
                Save card
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function KanbanColumn({
  column,
  cards,
  columns,
  newCardTitle,
  onNewCardTitleChange,
  onCreateCard,
  onEditCard,
  onMoveCard
}: {
  column: Column;
  cards: Card[];
  columns: Column[];
  newCardTitle: string;
  onNewCardTitleChange: (value: string) => void;
  onCreateCard: (event: FormEvent<HTMLFormElement>) => void;
  onEditCard: (card: Card) => void;
  onMoveCard: (card: Card, columnId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${column.id}`,
    data: {
      type: "column",
      column
    }
  });

  return (
    <section className={`kanban-column ${isOver ? "is-over" : ""}`} ref={setNodeRef}>
      <header className="column-header">
        <h2>{column.title}</h2>
        <span>{cards.length}</span>
      </header>

      <SortableContext
        items={cards.map((card) => card.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="card-list">
          {cards.length === 0 ? (
            <div className="empty-column">Drop cards here or create a new one.</div>
          ) : null}
          {cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              columns={columns}
              onEditCard={onEditCard}
              onMoveCard={onMoveCard}
            />
          ))}
        </div>
      </SortableContext>

      <form className="card-form" onSubmit={onCreateCard}>
        <input
          value={newCardTitle}
          onChange={(event) => onNewCardTitleChange(event.target.value)}
          placeholder="Add card"
          aria-label={`Add card to ${column.title}`}
        />
        <button type="submit" aria-label={`Create card in ${column.title}`}>
          <Plus size={18} />
        </button>
      </form>
    </section>
  );
}

function SortableCard({
  card,
  columns,
  onEditCard,
  onMoveCard
}: {
  card: Card;
  columns: Column[];
  onEditCard: (card: Card) => void;
  onMoveCard: (card: Card, columnId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: card.id,
    data: {
      type: "card",
      card
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <article
      ref={setNodeRef}
      className={`task-card ${isDragging ? "is-dragging" : ""}`}
      style={style}
    >
      <button
        className="drag-handle"
        type="button"
        aria-label={`Drag ${card.title}`}
        {...attributes}
        {...listeners}
      >
        <span />
        <span />
        <span />
      </button>
      <button
        className="card-body"
        type="button"
        onClick={() => onEditCard(card)}
        {...attributes}
        {...listeners}
      >
        <strong>{card.title}</strong>
        {card.description ? <p>{card.description}</p> : null}
      </button>
      <select
        className="move-select"
        value={card.column_id}
        onChange={(event) => onMoveCard(card, event.target.value)}
        aria-label={`Move ${card.title} to column`}
      >
        {columns.map((column) => (
          <option key={column.id} value={column.id}>
            {column.title}
          </option>
        ))}
      </select>
    </article>
  );
}

function CardPreview({ card, isOverlay = false }: { card: Card; isOverlay?: boolean }) {
  return (
    <article className={`task-card preview ${isOverlay ? "overlay" : ""}`}>
      <strong>{card.title}</strong>
      {card.description ? <p>{card.description}</p> : null}
    </article>
  );
}
