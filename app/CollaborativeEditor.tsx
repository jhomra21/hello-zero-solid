import { useQuery, useZero } from "@rocicorp/zero/solid";
import {
  createSignal,
  createEffect,
  For,
  Show,
  onCleanup,
  createMemo,
} from "solid-js";
import { queries } from "../shared/queries";
import { mutators } from "../shared/mutators";

// Generate unique ID
const generateId = () => crypto.randomUUID();

interface Props {
  documentId: string;
}

export function CollaborativeEditor(props: Props) {
  const zero = useZero();

  // Local input state (instant feedback)
  const [localContent, setLocalContent] = createSignal("");

  // Track if we've initialized from server
  const [initialized, setInitialized] = createSignal(false);

  // Debounce timer ref
  let debounceTimer: number | undefined;

  // Minimum characters before syncing (in addition to debounce)
  const MIN_CHARS_TO_SYNC = 1;
  const DEBOUNCE_MS = 150;

  // Query the document with all contributions
  const [document] = useQuery(() =>
    queries.collaborativeDocument.withContributions({
      documentId: props.documentId,
    }),
  );

  // Query my own contribution
  const [myContribution] = useQuery(() =>
    queries.contribution.mine({
      documentId: props.documentId,
      userID: zero().userID,
    }),
  );

  // Initialize local content from my contribution (only once)
  createEffect(() => {
    const mine = myContribution();
    if (mine && !initialized()) {
      setLocalContent(mine.content);
      setInitialized(true);
    }
  });

  // Cleanup debounce timer
  onCleanup(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
  });

  // Sync content to server with debouncing
  const syncToServer = (content: string) => {
    if (zero().userID === "anon") return;

    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Set new timer
    debounceTimer = setTimeout(() => {
      // Only sync if we have minimum characters OR content is being cleared
      if (content.length >= MIN_CHARS_TO_SYNC || content === "") {
        zero().mutate(
          mutators.contribution.upsert({
            id: myContribution()?.id || generateId(),
            documentId: props.documentId,
            content,
          }),
        );
      }
    }, DEBOUNCE_MS) as unknown as number;
  };

  // Handle input change
  const handleInput = (e: InputEvent) => {
    const target = e.target as HTMLTextAreaElement;
    const newContent = target.value;
    setLocalContent(newContent);
    syncToServer(newContent);
  };

  // Combine all contributions into display text (with user labels)
  const combinedTextWithLabels = createMemo(() => {
    const doc = document();
    if (!doc?.contributions) return "";

    return doc.contributions
      .filter((c) => c.content.trim() !== "")
      .map((c) => `[${c.user?.name || "Unknown"}]: ${c.content}`)
      .join(" | ");
  });

  // Plain combined text without user labels
  const plainCombinedText = createMemo(() => {
    const doc = document();
    if (!doc?.contributions) return "";

    return doc.contributions
      .filter((c) => c.content.trim() !== "")
      .map((c) => c.content)
      .join("  "); // Double space separator
  });

  // Count of active contributors
  const contributorCount = createMemo(() => {
    const doc = document();
    if (!doc?.contributions) return 0;
    return doc.contributions.filter((c) => c.content.trim() !== "").length;
  });

  // Clear my contribution
  const handleClear = () => {
    setLocalContent("");
    if (zero().userID !== "anon") {
      zero().mutate(
        mutators.contribution.clear({
          documentId: props.documentId,
        }),
      );
    }
  };

  return (
    <div class="collaborative-editor">
      <div class="dev-header">
        <span class="dev-badge">DEV VIEW</span>
        <span class="dev-subtitle">Detailed debugging &amp; monitoring</span>
      </div>
      <h2>Collaborative Document</h2>
      <Show when={document()} fallback={<p>Loading document...</p>}>
        <p class="doc-title">
          <strong>{document()?.title}</strong>
        </p>

        {/* Combined output from all users */}
        <div class="combined-output">
          <h3>
            Combined Text
            <Show when={contributorCount() > 0}>
              <span class="contributor-count">
                ({contributorCount()} contributor
                {contributorCount() !== 1 ? "s" : ""})
              </span>
            </Show>
          </h3>

          {/* Toggle between labeled and plain view */}
          <div class="output-box">
            <Show
              when={combinedTextWithLabels()}
              fallback={
                <em class="no-content">
                  No content yet... Start typing below!
                </em>
              }
            >
              {combinedTextWithLabels()}
            </Show>
          </div>

          <details class="plain-text-toggle">
            <summary>Show plain text (without labels)</summary>
            <div class="output-box plain">
              {plainCombinedText() || <em>No content</em>}
            </div>
          </details>
        </div>

        {/* Current user's input */}
        <div class="my-input">
          <h3>Your Contribution</h3>
          <Show
            when={zero().userID !== "anon"}
            fallback={
              <div class="login-prompt">
                <p>Please log in to contribute to this document.</p>
              </div>
            }
          >
            <textarea
              value={localContent()}
              onInput={handleInput}
              placeholder="Type your contribution here... It will be combined with other users' text."
              rows={4}
            />
            <div class="input-footer">
              <small>Auto-saves {DEBOUNCE_MS}ms after you stop typing</small>
              <button class="clear-btn" onClick={handleClear}>
                Clear My Text
              </button>
            </div>
          </Show>
        </div>

        {/* Show all contributors */}
        <div class="contributors">
          <h3>All Contributors</h3>
          <Show
            when={document()?.contributions?.length}
            fallback={<p class="no-contributors">No contributors yet.</p>}
          >
            <For each={document()?.contributions || []}>
              {(contribution) => (
                <div
                  class="contributor"
                  classList={{
                    "is-you": contribution.userID === zero().userID,
                    "has-content": contribution.content.trim() !== "",
                  }}
                >
                  <div class="contributor-header">
                    <strong>{contribution.user?.name || "Unknown"}</strong>
                    <Show when={contribution.userID === zero().userID}>
                      <span class="you-badge">you</span>
                    </Show>
                  </div>
                  <div class="contributor-preview">
                    <Show
                      when={contribution.content.trim()}
                      fallback={<em class="empty-text">(empty)</em>}
                    >
                      "{contribution.content.slice(0, 100)}
                      {contribution.content.length > 100 ? "..." : ""}"
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
}

export default CollaborativeEditor;
