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

interface Props {
  documentId: string;
}

/**
 * True collaborative input - single shared text that everyone edits.
 * Optimized: Only syncs content after user pauses typing (debounced).
 */
export function TrueCollaborativeInput(props: Props) {
  const zero = useZero();

  let textareaRef: HTMLTextAreaElement | undefined;

  // Track content to detect external changes
  let lastKnownContent = "";

  // Local state
  const [initialized, setInitialized] = createSignal(false);
  
  // Debounce SENDING - only send after user pauses typing
  let sendContentTimer: number | undefined;
  const SEND_DEBOUNCE_MS = 150;

  // Query ONLY the document content - no cursors (lighter query)
  const [document] = useQuery(() =>
    queries.sharedDocument.content({
      documentId: props.documentId,
    })
  );

  // Get users for display
  const [users] = useQuery(queries.user.all);

  // Initialize from server
  createEffect(() => {
    const doc = document();
    if (doc && !initialized() && textareaRef) {
      textareaRef.value = doc.content;
      lastKnownContent = doc.content;
      setInitialized(true);
    }
  });

  // Sync server content to local (when others edit)
  createEffect(() => {
    const doc = document();
    if (doc && initialized() && textareaRef) {
      const serverContent = doc.content;
      const currentContent = textareaRef.value;
      
      // Only update if server content is different
      if (serverContent !== currentContent) {
        const cursorPos = textareaRef.selectionStart || 0;
        const oldLength = currentContent.length;
        const newLength = serverContent.length;
        
        // Update the textarea value directly
        textareaRef.value = serverContent;
        lastKnownContent = serverContent;

        // Try to keep cursor in a reasonable position
        const lengthDiff = newLength - oldLength;
        const newCursorPos = Math.max(0, Math.min(cursorPos + lengthDiff, newLength));
        
        textareaRef.selectionStart = newCursorPos;
        textareaRef.selectionEnd = newCursorPos;
      }
    }
  });

  onCleanup(() => {
    if (sendContentTimer) clearTimeout(sendContentTimer);
  });

  // Update content on server - DEBOUNCED, waits for user to pause typing
  const syncContent = (content: string) => {
    if (zero().userID === "anon") return;

    // Clear any pending send
    if (sendContentTimer) clearTimeout(sendContentTimer);
    
    // Wait for user to pause typing, then send entire content at once
    sendContentTimer = setTimeout(() => {
      lastKnownContent = content;
      
      zero().mutate(
        mutators.sharedDocument.updateContent({
          documentId: props.documentId,
          content,
          cursorPosition: 0, // Not used anymore
        })
      );
    }, SEND_DEBOUNCE_MS) as unknown as number;
  };

  // Handle input - uncontrolled, only syncs content (debounced)
  const handleInput = (e: InputEvent) => {
    const target = e.target as HTMLTextAreaElement;
    const newContent = target.value;

    // Update tracking and sync
    lastKnownContent = newContent;
    syncContent(newContent);
  };

  // Get current user name
  const currentUserName = createMemo(() => {
    return users().find((u) => u.id === zero().userID)?.name || "Anonymous";
  });

  return (
    <div class="true-collab-container">
      {/* Status bar */}
      <div class="status-bar">
        <Show when={zero().userID !== "anon"}>
          <span class="typing-as">editing as {currentUserName()}</span>
        </Show>
      </div>

      {/* Main input area */}
      <div class="input-wrapper">
        <Show
          when={zero().userID !== "anon"}
          fallback={
            <div class="login-message">
              Log in to edit this document
            </div>
          }
        >
          <textarea
            ref={textareaRef}
            class="true-collab-textarea"
            onInput={handleInput}
            placeholder="Start typing... Everyone edits the same text!"
            rows={6}
          />
        </Show>
      </div>

      {/* Help text */}
      <div class="help-text">
        Everyone edits the same text in real-time. Changes sync after you pause typing.
      </div>
    </div>
  );
}

export default TrueCollaborativeInput;
