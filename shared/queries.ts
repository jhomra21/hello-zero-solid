import { escapeLike, defineQueries, defineQuery } from "@rocicorp/zero";
import z from "zod";
import { zql } from "./schema";

export const queries = defineQueries({
  user: {
    all: defineQuery(() => zql.user),
  },
  medium: {
    all: defineQuery(() => zql.medium),
  },
  message: {
    all: defineQuery(() => zql.message.orderBy("timestamp", "desc")),
    filtered: defineQuery(
      z.object({
        senderID: z.string(),
        mediumID: z.string(),
        body: z.string(),
        timestamp: z.string(),
      }),
      ({ args: { senderID, mediumID, body, timestamp } }) => {
        let q = zql.message
          .related("medium", (q) => q.one())
          .related("sender", (q) => q.one())
          .orderBy("timestamp", "desc");

        if (senderID) {
          q = q.where("senderID", senderID);
        }
        if (mediumID) {
          q = q.where("mediumID", mediumID);
        }
        if (body) {
          q = q.where("body", "LIKE", `%${escapeLike(body)}%`);
        }
        if (timestamp) {
          q = q.where(
            "timestamp",
            ">=",
            timestamp ? new Date(timestamp).getTime() : 0
          );
        }

        return q;
      }
    ),
  },

  // ============================================
  // Collaborative Document Queries
  // ============================================
  collaborativeDocument: {
    // Get all documents
    all: defineQuery(() =>
      zql.collaborative_document.orderBy("createdAt", "desc")
    ),

    // Get a single document by ID with all contributions
    withContributions: defineQuery(
      z.object({ documentId: z.string() }),
      ({ args: { documentId } }) =>
        zql.collaborative_document
          .where("id", documentId)
          .related("contributions", (q) =>
            q.related("user", (q) => q.one()).orderBy("joinedAt", "asc")
          )
          .one()
    ),
  },

  contribution: {
    // Get current user's contribution for a document
    mine: defineQuery(
      z.object({ documentId: z.string(), userID: z.string() }),
      ({ args: { documentId, userID } }) =>
        zql.contribution
          .where("documentId", documentId)
          .where("userID", userID)
          .one()
    ),

    // Get all contributions for a document
    forDocument: defineQuery(
      z.object({ documentId: z.string() }),
      ({ args: { documentId } }) =>
        zql.contribution
          .where("documentId", documentId)
          .related("user", (q) => q.one())
          .orderBy("joinedAt", "asc")
    ),
  },

  // ============================================
  // True Collaborative Editing Queries
  // ============================================
  sharedDocument: {
    // Get a shared document by ID with all cursors
    withCursors: defineQuery(
      z.object({ documentId: z.string() }),
      ({ args: { documentId } }) =>
        zql.shared_document
          .where("id", documentId)
          .related("cursors", (q) => q.related("user", (q) => q.one()))
          .one()
    ),

    // Get just the document content
    content: defineQuery(
      z.object({ documentId: z.string() }),
      ({ args: { documentId } }) =>
        zql.shared_document.where("id", documentId).one()
    ),
  },

  userCursor: {
    // Get all cursors for a document (with user info)
    forDocument: defineQuery(
      z.object({ documentId: z.string() }),
      ({ args: { documentId } }) =>
        zql.user_cursor
          .where("documentId", documentId)
          .related("user", (q) => q.one())
    ),

    // Get my cursor
    mine: defineQuery(
      z.object({ documentId: z.string(), userID: z.string() }),
      ({ args: { documentId, userID } }) =>
        zql.user_cursor
          .where("documentId", documentId)
          .where("userID", userID)
          .one()
    ),
  },

  // ============================================
  // Multiplayer Canvas Queries
  // ============================================
  canvasSquare: {
    // Get all squares for a canvas with owner and dragger info
    forCanvas: defineQuery(
      z.object({ canvasId: z.string() }),
      ({ args: { canvasId } }) =>
        zql.canvas_square
          .where("canvasId", canvasId)
          .related("owner", (q) => q.one())
          .related("dragger", (q) => q.one())
          .orderBy("createdAt", "asc")
    ),
  },
});
