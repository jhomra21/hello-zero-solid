import { useQuery, useZero } from "@rocicorp/zero/solid";
import {
  createSignal,
  createEffect,
  onCleanup,
  createMemo,
  Show,
} from "solid-js";
import { queries } from "../shared/queries";
import { mutators } from "../shared/mutators";

const generateId = () => crypto.randomUUID();

interface Props {
  documentId: string;
}

const SEPARATOR = "  |  ";

/**
 * Single unified input - user types on the left, others' text appears on the right
 * All in one textarea.
 */
export function CollaborativeInput(props: Props) {
  const zero = useZero();

  let textareaRef: HTMLTextAreaElement | undefined;

  // Local content (just MY text)
  const [myText, setMyText] = createSignal("");
  const [initialized, setInitialized] = createSignal(false);

  // Debounce config
  let debounceTimer: number | undefined;
  const DEBOUNCE_MS = 300;

  // Query document with contributions
  const [document] = useQuery(() =>
    queries.collaborativeDocument.withContributions({
      documentId: props.documentId,
    })
  );

  // Query my contribution
  const [myContribution] = useQuery(() =>
    queries.contribution.mine({
      documentId: props.documentId,
      userID: zero().userID,
    })
  );

  // Get other users' combined text (excluding mine)
  const othersText = createMemo(() => {
    const doc = document();
    if (!doc?.contributions) return "";

    return doc.contributions
      .filter((c) => c.userID !== zero().userID && c.content.trim() !== "")
      .map((c) => c.content)
      .join(SEPARATOR);
  });

  // The full display value: myText + separator + othersText
  const displayValue = createMemo(() => {
    const mine = myText();
    const others = othersText();

    if (!mine && !others) return "";
    if (!mine) return others;
    if (!others) return mine;
    return mine + SEPARATOR + others;
  });

  // Calculate where user's editable zone ends
  const myTextEndIndex = createMemo(() => {
    return myText().length;
  });

  // Initialize from server
  createEffect(() => {
    const mine = myContribution();
    if (mine && !initialized()) {
      setMyText(mine.content);
      setInitialized(true);
    }
  });

  onCleanup(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  // Sync to server with debounce
  const syncToServer = (content: string) => {
    if (zero().userID === "anon") return;

    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      zero().mutate(
        mutators.contribution.upsert({
          id: myContribution()?.id || generateId(),
          documentId: props.documentId,
          content,
        })
      );
    }, DEBOUNCE_MS) as unknown as number;
  };

  // Handle input - only allow editing in "my" zone
  const handleInput = (e: InputEvent) => {
    const target = e.target as HTMLTextAreaElement;
    const newValue = target.value;
    const cursorPos = target.selectionStart;

    const currentMyText = myText();
    const others = othersText();

    // Calculate what the old full value was
    let oldFullValue = currentMyText;
    if (others) {
      oldFullValue = currentMyText + SEPARATOR + others;
    }

    // If user is trying to edit beyond their zone, prevent it
    const myZoneEnd = currentMyText.length;

    // Figure out what changed
    const lengthDiff = newValue.length - oldFullValue.length;

    if (cursorPos <= myZoneEnd + lengthDiff + 1) {
      // User is editing in their zone - extract their new text
      // Their text is everything before the separator (if others exist)
      let newMyText: string;

      if (others && newValue.includes(SEPARATOR)) {
        const separatorIndex = newValue.indexOf(SEPARATOR);
        newMyText = newValue.substring(0, separatorIndex);
      } else if (others) {
        // Separator was deleted - restore it, only take what's likely user's text
        newMyText = newValue.substring(0, Math.max(0, myZoneEnd + lengthDiff));
      } else {
        // No others, entire value is mine
        newMyText = newValue;
      }

      setMyText(newMyText);
      syncToServer(newMyText);
    } else {
      // User tried to edit others' zone - revert
      // Reset the textarea value
      if (textareaRef) {
        textareaRef.value = displayValue();
        // Keep cursor at end of my zone
        textareaRef.selectionStart = myZoneEnd;
        textareaRef.selectionEnd = myZoneEnd;
      }
    }
  };

  // Prevent cursor from going into others' zone
  const handleSelect = () => {
    if (!textareaRef) return;

    const myZoneEnd = myTextEndIndex();
    const selStart = textareaRef.selectionStart;
    const selEnd = textareaRef.selectionEnd;

    // If cursor is beyond my zone, move it back
    if (selStart > myZoneEnd) {
      textareaRef.selectionStart = myZoneEnd;
    }
    if (selEnd > myZoneEnd) {
      textareaRef.selectionEnd = myZoneEnd;
    }
  };

  // Handle keyboard to prevent editing others' text
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!textareaRef) return;

    const myZoneEnd = myTextEndIndex();
    const cursorPos = textareaRef.selectionStart;

    // Prevent right arrow / end key from going into others' zone
    if (e.key === "ArrowRight" || e.key === "End") {
      if (cursorPos >= myZoneEnd) {
        e.preventDefault();
      }
    }

    // Prevent delete key at end of my zone
    if (e.key === "Delete" && cursorPos >= myZoneEnd) {
      e.preventDefault();
    }
  };

  // Count active contributors
  const activeCount = createMemo(() => {
    const doc = document();
    if (!doc?.contributions) return 0;
    return doc.contributions.filter((c) => c.content.trim() !== "").length;
  });

  // Get current user's display name
  const [users] = useQuery(queries.user.all);
  const currentUserName = createMemo(() => {
    return users().find((u) => u.id === zero().userID)?.name || "Anonymous";
  });

  return (
    <div class="collab-input-container">
      {/* Status bar */}
      <div class="status-bar">
        <Show when={activeCount() > 0}>
          <span class="active-count">
            {activeCount()} contributor{activeCount() !== 1 ? "s" : ""}
          </span>
        </Show>
        <Show when={zero().userID !== "anon"}>
          <span class="typing-as">typing as {currentUserName()}</span>
        </Show>
      </div>

      {/* Single unified input */}
      <Show
        when={zero().userID !== "anon"}
        fallback={
          <div class="login-message">Log in to contribute to this document</div>
        }
      >
        <textarea
          ref={textareaRef}
          class="collab-textarea unified"
          value={displayValue()}
          onInput={handleInput}
          onSelect={handleSelect}
          onKeyDown={handleKeyDown}
          onClick={handleSelect}
          placeholder="Start typing to collaborate..."
          rows={4}
        />
        <div class="input-hint">
          Your text appears on the left • Others' text appears on the right
        </div>
      </Show>
    </div>
  );
}

export default CollaborativeInput;
