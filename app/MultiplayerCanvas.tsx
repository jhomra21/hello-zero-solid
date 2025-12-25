import { useQuery, useZero } from "@rocicorp/zero/solid";
import { For, Show, batch, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { queries } from "../shared/queries";
import { mutators } from "../shared/mutators";
import type { User, CanvasSquare } from "../shared/schema";

const generateId = () => crypto.randomUUID();

// Square with related user data from query
type SquareWithRelations = CanvasSquare & {
  owner: Pick<User, "id" | "name"> | null;
  dragger: Pick<User, "id" | "name"> | null;
};

interface Props {
  canvasId: string;
}

// Constants
const SQUARE_SIZE = 80;

// Colors for new squares
const SQUARE_COLORS = [
  "#e74c3c", // red
  "#3498db", // blue
  "#2ecc71", // green
  "#f39c12", // orange
  "#9b59b6", // purple
  "#1abc9c", // teal
  "#e91e63", // pink
  "#00bcd4", // cyan
];

/**
 * Multiplayer Canvas - Users can add/drag squares in real-time.
 * - Each square has an owner
 * - Any user can drag any square
 * - While dragging, square is locked to that user
 * - Shows owner name and dragger name on each square
 */
export function MultiplayerCanvas(props: Props) {
  const zero = useZero();

  // Canvas ref - better than document.querySelector
  let canvasRef: HTMLDivElement | undefined;

  // Drag state - using store for related state with fine-grained updates
  const [drag, setDrag] = createStore({
    id: null as string | null,
    offset: { x: 0, y: 0 },
    position: { x: 0, y: 0 },
  });

  // Query all squares for this canvas
  const [squares] = useQuery(() =>
    queries.canvasSquare.forCanvas({
      canvasId: props.canvasId,
    })
  );

  // Get users for display and color assignment
  const [users] = useQuery(queries.user.all);

  // Derived function for user color index (cheap computation, no memo needed)
  const userColorIndex = () => {
    const allUsers = users();
    const index = allUsers.findIndex((u) => u.id === zero().userID);
    return index >= 0 ? index : 0;
  };

  // Derived function for current user's color
  const myColor = () => SQUARE_COLORS[userColorIndex() % SQUARE_COLORS.length];

  // Derived function for current user name (cheap lookup)
  const currentUserName = () =>
    users().find((u) => u.id === zero().userID)?.name || "Anonymous";

  // Cleanup: Release lock if component unmounts during drag
  onCleanup(() => {
    if (drag.id) {
      zero().mutate(
        mutators.canvasSquare.endDrag({
          id: drag.id,
          x: Math.round(drag.position.x),
          y: Math.round(drag.position.y),
        })
      );
    }
  });

  // Add a new square
  const addSquare = () => {
    if (zero().userID === "anon") return;

    // Random position in the canvas
    const x = 50 + Math.random() * 400;
    const y = 50 + Math.random() * 200;

    zero().mutate(
      mutators.canvasSquare.create({
        id: generateId(),
        canvasId: props.canvasId,
        x: Math.round(x),
        y: Math.round(y),
        color: myColor(),
      })
    );
  };

  // Start dragging a square
  const handleMouseDown = (squareId: string, square: SquareWithRelations, e: MouseEvent) => {
    if (zero().userID === "anon") return;

    // If already being dragged by someone else, don't allow
    if (square.draggedBy && square.draggedBy !== zero().userID) {
      return;
    }

    e.preventDefault();

    // Calculate offset from mouse to square corner
    const rect = (e.target as HTMLElement).getBoundingClientRect();

    // Batch related state updates together
    batch(() => {
      setDrag("offset", { x: e.clientX - rect.left, y: e.clientY - rect.top });
      setDrag("position", { x: square.x, y: square.y });
      setDrag("id", squareId);
    });

    // Lock the square
    zero().mutate(mutators.canvasSquare.startDrag({ id: squareId }));
  };

  // Handle mouse move during drag
  // LOCAL ONLY - no server sync during drag, only on release
  // This prevents flooding Zero with updates that queue up for other users
  const handleMouseMove = (e: MouseEvent) => {
    const id = drag.id;
    if (!id) return;

    if (!canvasRef) return;

    const canvasRect = canvasRef.getBoundingClientRect();
    const newX = e.clientX - canvasRect.left - drag.offset.x;
    const newY = e.clientY - canvasRect.top - drag.offset.y;

    // Clamp to canvas bounds
    const clampedX = Math.max(0, Math.min(newX, canvasRect.width - SQUARE_SIZE));
    const clampedY = Math.max(0, Math.min(newY, canvasRect.height - SQUARE_SIZE));

    // Update LOCAL position only - instant feedback for dragger
    // Server sync happens on drag END (handleMouseUp)
    setDrag("position", { x: clampedX, y: clampedY });
  };

  // End drag - release lock and set final position
  const handleMouseUp = () => {
    const id = drag.id;
    if (!id) return;

    // Send final position and release lock
    zero().mutate(
      mutators.canvasSquare.endDrag({
        id,
        x: Math.round(drag.position.x),
        y: Math.round(drag.position.y),
      })
    );

    setDrag("id", null);
  };

  // Delete a square (only owner)
  const deleteSquare = (squareId: string, e: MouseEvent) => {
    e.stopPropagation();
    zero().mutate(mutators.canvasSquare.delete({ id: squareId }));
  };

  // Helper: Get display position for a square (local if dragging, server otherwise)
  const getSquarePosition = (square: SquareWithRelations) => {
    if (drag.id === square.id) {
      return drag.position;
    }
    return { x: square.x, y: square.y };
  };

  // Helper: Check if square is being dragged (by anyone)
  const isBeingDragged = (square: SquareWithRelations) => square.draggedBy !== null;

  // Helper: Get label for a square
  const getSquareLabel = (square: SquareWithRelations) => {
    const ownerName = square.owner?.name || "Unknown";
    const draggerName = square.dragger?.name;

    if (!square.draggedBy) {
      return ownerName;
    } else if (square.draggedBy === square.ownerID) {
      return `${ownerName} ✋`;
    } else {
      return `${ownerName}\n(${draggerName} ✋)`;
    }
  };

  // Helper: Check if currently being dragged by this user
  const isDraggingSquare = (squareId: string) => drag.id === squareId;

  // Helper: Check if locked by another user
  const isLockedByOther = (square: SquareWithRelations) =>
    square.draggedBy && square.draggedBy !== zero().userID;

  // Helper: Check if current user owns the square
  const isOwner = (square: SquareWithRelations) => square.ownerID === zero().userID;

  return (
    <div class="multiplayer-canvas-container">
      {/* Header */}
      <div class="canvas-header">
        <Show
          when={zero().userID !== "anon"}
          fallback={<span class="login-hint">Log in to add squares</span>}
        >
          <button class="add-square-btn" onClick={addSquare}>
            + Add Square
          </button>
          <span class="editing-as">editing as {currentUserName()}</span>
        </Show>
        <span class="square-count">{squares().length} squares</span>
      </div>

      {/* Canvas - using ref instead of querySelector */}
      <div
        ref={canvasRef}
        class="canvas-area"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <For each={squares()}>
          {(square) => {
            // Derived functions for this square's reactive state
            const pos = () => getSquarePosition(square);
            const dragging = () => isDraggingSquare(square.id);
            const locked = () => isLockedByOther(square);
            const owned = () => isOwner(square);
            const beingDragged = () => isBeingDragged(square);
            const label = () => getSquareLabel(square);

            return (
              <div
                class="canvas-square"
                classList={{
                  dragging: dragging(),
                  "locked-by-other": locked(),
                  "is-owner": owned(),
                }}
                style={{
                  left: `${pos().x}px`,
                  top: `${pos().y}px`,
                  width: `${square.width}px`,
                  height: `${square.height}px`,
                  "background-color": square.color,
                  cursor: locked() ? "not-allowed" : "grab",
                }}
                onMouseDown={(e) => handleMouseDown(square.id, square, e)}
              >
                {/* Wrap in arrow function for reactivity */}
                <span class="square-label">{label()}</span>
                {/* Use arrow function in Show's when prop */}
                <Show when={() => owned() && !beingDragged()}>
                  <button
                    class="delete-btn"
                    onClick={(e) => deleteSquare(square.id, e)}
                  >
                    x
                  </button>
                </Show>
              </div>
            );
          }}
        </For>

        {/* Empty state */}
        <Show when={() => squares().length === 0}>
          <div class="empty-canvas">
            Click "+ Add Square" to create your first square!
          </div>
        </Show>
      </div>

      {/* Help text */}
      <div class="canvas-help">
        Drag squares to move them. While dragging, others can't interact with
        that square.
      </div>
    </div>
  );
}

export default MultiplayerCanvas;
