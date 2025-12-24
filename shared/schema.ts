// These data structures define your client-side schema.
// They must be equal to or a subset of the server-side schema.
// Note the "relationships" field, which defines first-class
// relationships between tables.
// See https://github.com/rocicorp/mono/blob/main/apps/zbugs/src/domain/schema.ts
// for more complex examples, including many-to-many.

import {
  createSchema,
  Row,
  table,
  string,
  boolean,
  relationships,
  UpdateValue,
  number,
  createBuilder,
} from "@rocicorp/zero";

const user = table("user")
  .columns({
    id: string(),
    name: string(),
    partner: boolean(),
  })
  .primaryKey("id");

const medium = table("medium")
  .columns({
    id: string(),
    name: string(),
  })
  .primaryKey("id");

const message = table("message")
  .columns({
    id: string(),
    senderID: string().from("sender_id"),
    mediumID: string().from("medium_id"),
    body: string(),
    timestamp: number(),
  })
  .primaryKey("id");

const messageRelationships = relationships(message, ({ one }) => ({
  sender: one({
    sourceField: ["senderID"],
    destField: ["id"],
    destSchema: user,
  }),
  medium: one({
    sourceField: ["mediumID"],
    destField: ["id"],
    destSchema: medium,
  }),
}));

// ============================================
// Collaborative Document Tables
// ============================================

const collaborativeDocument = table("collaborative_document")
  .columns({
    id: string(),
    title: string(),
    createdAt: number().from("created_at"),
  })
  .primaryKey("id");

const contribution = table("contribution")
  .columns({
    id: string(),
    documentId: string().from("document_id"),
    userID: string().from("user_id"),
    content: string(),
    updatedAt: number().from("updated_at"),
    joinedAt: number().from("joined_at"),
  })
  .primaryKey("id");

const contributionRelationships = relationships(contribution, ({ one }) => ({
  document: one({
    sourceField: ["documentId"],
    destField: ["id"],
    destSchema: collaborativeDocument,
  }),
  user: one({
    sourceField: ["userID"],
    destField: ["id"],
    destSchema: user,
  }),
}));

const documentRelationships = relationships(
  collaborativeDocument,
  ({ many }) => ({
    contributions: many({
      sourceField: ["id"],
      destField: ["documentId"],
      destSchema: contribution,
    }),
  })
);

// ============================================
// True Collaborative Editing Tables
// ============================================

const sharedDocument = table("shared_document")
  .columns({
    id: string(),
    content: string(),
    updatedAt: number().from("updated_at"),
  })
  .primaryKey("id");

const userCursor = table("user_cursor")
  .columns({
    id: string(),
    documentId: string().from("document_id"),
    userID: string().from("user_id"),
    position: number(),
    updatedAt: number().from("updated_at"),
  })
  .primaryKey("id");

const userCursorRelationships = relationships(userCursor, ({ one }) => ({
  document: one({
    sourceField: ["documentId"],
    destField: ["id"],
    destSchema: sharedDocument,
  }),
  user: one({
    sourceField: ["userID"],
    destField: ["id"],
    destSchema: user,
  }),
}));

const sharedDocumentRelationships = relationships(
  sharedDocument,
  ({ many }) => ({
    cursors: many({
      sourceField: ["id"],
      destField: ["documentId"],
      destSchema: userCursor,
    }),
  })
);

export const schema = createSchema({
  tables: [
    user,
    medium,
    message,
    collaborativeDocument,
    contribution,
    sharedDocument,
    userCursor,
  ],
  relationships: [
    messageRelationships,
    contributionRelationships,
    documentRelationships,
    userCursorRelationships,
    sharedDocumentRelationships,
  ],
  enableLegacyMutators: false,
  enableLegacyQueries: false,
});

export type Schema = typeof schema;
export type Message = Row<typeof schema.tables.message>;
export type MessageUpdate = UpdateValue<typeof schema.tables.message>;
export type Medium = Row<typeof schema.tables.medium>;
export type User = Row<typeof schema.tables.user>;
export type CollaborativeDocument = Row<
  typeof schema.tables.collaborativeDocument
>;
export type Contribution = Row<typeof schema.tables.contribution>;
export type SharedDocument = Row<typeof schema.tables.shared_document>;
export type UserCursor = Row<typeof schema.tables.user_cursor>;

export const zql = createBuilder(schema);

declare module "@rocicorp/zero" {
  interface DefaultTypes {
    schema: typeof schema;
  }
}
