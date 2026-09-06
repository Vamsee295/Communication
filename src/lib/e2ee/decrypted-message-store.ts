/** App-owned local view model. This is not protocol/session storage. */
export type DecryptedMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  outgoing: boolean;
};

const DB_PREFIX = "ghostline_e2ee_messages";
const STORE = "messages";

function openDb(userId?: string): Promise<IDBDatabase> {
  const dbName = userId ? `${DB_PREFIX}_${userId}` : DB_PREFIX;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("conversation_created", ["conversation_id", "created_at"]);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class DecryptedMessageStore {
  private activeUserId: string | null = null;
  private listeners = new Set<(conversationId: string) => void>();

  setActiveUser(userId: string | null): void {
    this.activeUserId = userId;
  }

  getActiveUser(): string | null {
    return this.activeUserId;
  }

  async upsert(message: DecryptedMessage, userId?: string): Promise<void> {
    const uid = userId ?? this.activeUserId ?? undefined;
    const db = await openDb(uid);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(message);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    for (const listener of this.listeners) listener(message.conversation_id);
  }

  async list(conversationId: string, userId?: string): Promise<DecryptedMessage[]> {
    const uid = userId ?? this.activeUserId ?? undefined;
    const db = await openDb(uid);
    const rows = await new Promise<DecryptedMessage[]>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).index("conversation_created").getAll(IDBKeyRange.bound([conversationId, ""], [conversationId, "\uffff"]));
      request.onsuccess = () => resolve(request.result as DecryptedMessage[]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return rows;
  }

  subscribe(listener: (conversationId: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const decryptedMessageStore = new DecryptedMessageStore();
