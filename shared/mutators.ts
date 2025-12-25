import { defineMutator, defineMutators } from "@rocicorp/zero";
import { must } from "./must";
import z from "zod";
import { Context } from "./context";
import { zql } from "./schema";

export const mutators = defineMutators({
  message: {
    create: defineMutator(
      z.object({
        id: z.string(),
        mediumID: z.string(),
        senderID: z.string(),
        body: z.string(),
        timestamp: z.number(),
      }),
      async ({ tx, args }) => {
        await tx.mutate.message.insert(args);
      }
    ),
    delete: defineMutator(
      z.object({
        id: z.string(),
      }),
      async ({ tx, args: { id }, ctx }) => {
        mustBeLoggedIn(ctx);
        await tx.mutate.message.delete({ id });
      }
    ),
    update: defineMutator(
      z.object({
        message: z.object({
          id: z.string(),
          body: z.string(),
        }),
      }),
      async ({ tx, args: { message }, ctx }) => {
        mustBeLoggedIn(ctx);
        const prev = await tx.run(zql.message.where("id", message.id).one());
        if (!prev) {
          return;
        }
        if (prev.senderID !== ctx.userID) {
          throw new Error("Must be sender of message to edit");
        }
        await tx.mutate.message.update(message);
      }
    ),
  },

  // ============================================
  // Collaborative Document Mutators
  // ============================================
  collaborativeDocument: {
    create: defineMutator(
      z.object({
        id: z.string(),
        title: z.string(),
      }),
      async ({ tx, args }) => {
        await tx.mutate.collaborative_document.insert({
          ...args,
          createdAt: Date.now(),
        });
      }
    ),
  },

  contribution: {
    // Upsert: create if not exists, update if exists
    upsert: defineMutator(
      z.object({
        id: z.string(),
        documentId: z.string(),
        content: z.string(),
      }),
      async ({ tx, args, ctx }) => {
        mustBeLoggedIn(ctx);

        const existing = await tx.run(
          zql.contribution
            .where("documentId", args.documentId)
            .where("userID", ctx.userID)
            .one()
        );

        const now = Date.now();

        if (existing) {
          // Update existing contribution
          await tx.mutate.contribution.update({
            id: existing.id,
            content: args.content,
            updatedAt: now,
          });
        } else {
          // Create new contribution (user joining for first time)
          await tx.mutate.contribution.insert({
            id: args.id,
            documentId: args.documentId,
            userID: ctx.userID,
            content: args.content,
            updatedAt: now,
            joinedAt: now,
          });
        }
      }
    ),

    // Clear a user's contribution
    clear: defineMutator(
      z.object({ documentId: z.string() }),
      async ({ tx, args, ctx }) => {
        mustBeLoggedIn(ctx);

        const existing = await tx.run(
          zql.contribution
            .where("documentId", args.documentId)
            .where("userID", ctx.userID)
            .one()
        );

        if (existing) {
          await tx.mutate.contribution.update({
            id: existing.id,
            content: "",
            updatedAt: Date.now(),
          });
        }
      }
    ),
  },

  // ============================================
  // True Collaborative Editing Mutators
  // ============================================
  sharedDocument: {
    // Update document content - simple, fast update
    updateContent: defineMutator(
      z.object({
        documentId: z.string(),
        content: z.string(),
        cursorPosition: z.number(),
      }),
      async ({ tx, args, ctx }) => {
        mustBeLoggedIn(ctx);

        // Simple update - no locking overhead
        await tx.mutate.shared_document.update({
          id: args.documentId,
          content: args.content,
          updatedAt: Date.now(),
        });
      }
    ),
  },

  userCursor: {
    // Update cursor position (creates lock)
    update: defineMutator(
      z.object({
        id: z.string(),
        documentId: z.string(),
        position: z.number(),
      }),
      async ({ tx, args, ctx }) => {
        mustBeLoggedIn(ctx);

        const existing = await tx.run(
          zql.user_cursor
            .where("documentId", args.documentId)
            .where("userID", ctx.userID)
            .one()
        );

        const now = Date.now();

        if (existing) {
          await tx.mutate.user_cursor.update({
            id: existing.id,
            position: args.position,
            updatedAt: now,
          });
        } else {
          await tx.mutate.user_cursor.insert({
            id: args.id,
            documentId: args.documentId,
            userID: ctx.userID,
            position: args.position,
            updatedAt: now,
          });
        }
      }
    ),

    // Remove cursor (user left)
    remove: defineMutator(
      z.object({ documentId: z.string() }),
      async ({ tx, args, ctx }) => {
        mustBeLoggedIn(ctx);

        const existing = await tx.run(
          zql.user_cursor
            .where("documentId", args.documentId)
            .where("userID", ctx.userID)
            .one()
        );

        if (existing) {
          await tx.mutate.user_cursor.delete({ id: existing.id });
        }
      }
    ),
  },

  // ============================================
  // Multiplayer Canvas Mutators
  // ============================================
  canvasSquare: {
    // Create a new square (owned by current user)
    create: defineMutator(
      z.object({
        id: z.string(),
        canvasId: z.string(),
        x: z.number(),
        y: z.number(),
        color: z.string(),
      }),
      async ({ tx, args, ctx }) => {
        mustBeLoggedIn(ctx);

        await tx.mutate.canvas_square.insert({
          id: args.id,
          canvasId: args.canvasId,
          ownerID: ctx.userID,
          x: args.x,
          y: args.y,
          width: 80,
          height: 80,
          color: args.color,
          draggedBy: null,
          createdAt: Date.now(),
        });
      }
    ),

    // Start dragging a square (lock it)
    startDrag: defineMutator(
      z.object({ id: z.string() }),
      async ({ tx, args, ctx }) => {
        mustBeLoggedIn(ctx);

        const square = await tx.run(
          zql.canvas_square.where("id", args.id).one()
        );

        if (!square) return;

        // If already being dragged by someone else, don't allow
        if (square.draggedBy && square.draggedBy !== ctx.userID) {
          throw new Error("Square is being dragged by another user");
        }

        await tx.mutate.canvas_square.update({
          id: args.id,
          draggedBy: ctx.userID,
        });
      }
    ),

    // Update position while dragging
    // NOTE: Currently unused - position only syncs on drag end to prevent flooding.
    // Reserved for future real-time position sync if needed.
    updatePosition: defineMutator(
      z.object({
        id: z.string(),
        x: z.number(),
        y: z.number(),
      }),
      async ({ tx, args, ctx }) => {
        mustBeLoggedIn(ctx);

        const square = await tx.run(
          zql.canvas_square.where("id", args.id).one()
        );

        if (!square) return;

        // Only allow update if this user is dragging
        if (square.draggedBy !== ctx.userID) {
          return; // Silently ignore - not our drag
        }

        await tx.mutate.canvas_square.update({
          id: args.id,
          x: args.x,
          y: args.y,
        });
      }
    ),

    // End drag (release lock and set final position)
    endDrag: defineMutator(
      z.object({
        id: z.string(),
        x: z.number(),
        y: z.number(),
      }),
      async ({ tx, args, ctx }) => {
        mustBeLoggedIn(ctx);

        const square = await tx.run(
          zql.canvas_square.where("id", args.id).one()
        );

        if (!square) return;

        // Only allow end if this user is dragging
        if (square.draggedBy !== ctx.userID) {
          return;
        }

        await tx.mutate.canvas_square.update({
          id: args.id,
          x: args.x,
          y: args.y,
          draggedBy: null,
        });
      }
    ),

    // Delete a square (only owner can delete)
    delete: defineMutator(
      z.object({ id: z.string() }),
      async ({ tx, args, ctx }) => {
        mustBeLoggedIn(ctx);

        const square = await tx.run(
          zql.canvas_square.where("id", args.id).one()
        );

        if (!square) return;

        if (square.ownerID !== ctx.userID) {
          throw new Error("Only the owner can delete a square");
        }

        await tx.mutate.canvas_square.delete({ id: args.id });
      }
    ),
  },
});

function mustBeLoggedIn(ctx: Context): asserts ctx {
  must(ctx, "Must be logged in");
}
