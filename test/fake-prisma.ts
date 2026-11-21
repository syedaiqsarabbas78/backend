interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

interface SessionRow {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

interface ModelRow {
  id: string;
  providerModelId: string;
  displayName: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ChatRow {
  id: string;
  userId: string;
  title: string;
  modelId: string | null;
  generationLockUntil: Date | null;
  generationRequestId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MessageRow {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  modelId: string | null;
  status: "pending" | "completed" | "failed";
  sequence: number;
  clientRequestId: string | null;
  errorCode: string | null;
  createdAt: Date;
}

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

function matches(row: Row, where?: Where): boolean {
  if (!where) {
    return true;
  }
  return Object.entries(where).every(([key, expected]) => {
    if (key === "OR" && Array.isArray(expected)) {
      return expected.some((entry) => matches(row, entry as Where));
    }
    if (key === "AND" && Array.isArray(expected)) {
      return expected.every((entry) => matches(row, entry as Where));
    }
    const actual = row[key];
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      const filter = expected as { lt?: Date | number };
      if ("lt" in filter && filter.lt !== undefined) {
        if (actual === null || actual === undefined) {
          return false;
        }
        return (actual as Date | number) < filter.lt;
      }
      return false;
    }
    return actual === expected;
  });
}

function sortRows<T>(rows: T[], orderBy?: Record<string, "asc" | "desc">): T[] {
  if (!orderBy) {
    return rows;
  }
  const [key, direction] = Object.entries(orderBy)[0];
  return [...rows].sort((left, right) => {
    const a = (left as Row)[key];
    const b = (right as Row)[key];
    if (a === b) {
      return 0;
    }
    const compared = (a as number | Date | string) > (b as number | Date | string) ? 1 : -1;
    return direction === "desc" ? -compared : compared;
  });
}

export class FakePrisma {
  users: UserRow[] = [];
  sessions: SessionRow[] = [];
  models: ModelRow[] = [];
  chats: ChatRow[] = [];
  messages: MessageRow[] = [];
  failCompletedUpdate = false;
  private sequence = 1;

  private id(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_${this.sequence}`;
  }

  user = {
    findUnique: async ({ where }: { where: { email: string } }) =>
      this.users.find((user) => user.email === where.email) ?? null,
    create: async ({ data }: { data: { email: string; passwordHash: string } }) => {
      const row: UserRow = {
        id: this.id("user"),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      this.users.push(row);
      return row;
    },
  };

  session = {
    create: async ({
      data,
    }: {
      data: { tokenHash: string; userId: string; expiresAt: Date };
    }) => {
      const row: SessionRow = { id: this.id("session"), createdAt: new Date(), ...data };
      this.sessions.push(row);
      return row;
    },
    findUnique: async ({
      where,
      include,
    }: {
      where: { tokenHash: string };
      include?: { user?: boolean };
    }) => {
      const session = this.sessions.find((item) => item.tokenHash === where.tokenHash) ?? null;
      if (!session || !include?.user) {
        return session;
      }
      return { ...session, user: this.users.find((user) => user.id === session.userId) ?? null };
    },
    deleteMany: async ({ where }: { where: { tokenHash: string } }) => {
      const before = this.sessions.length;
      this.sessions = this.sessions.filter((session) => session.tokenHash !== where.tokenHash);
      return { count: before - this.sessions.length };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      const session = this.sessions.find((item) => item.id === where.id);
      this.sessions = this.sessions.filter((item) => item.id !== where.id);
      return session;
    },
  };

  model = {
    findFirst: async ({ where }: { where: Where }) =>
      this.models.find((model) => matches(model as unknown as Row, where)) ?? null,
    findMany: async ({ where, orderBy }: { where?: Where; orderBy?: Record<string, "asc" | "desc"> }) =>
      sortRows(
        this.models.filter((model) => matches(model as unknown as Row, where)),
        orderBy,
      ),
  };

  chat = {
    findFirst: async ({ where }: { where: Where }) =>
      this.chats.find((chat) => matches(chat as unknown as Row, where)) ?? null,
    findMany: async ({
      where,
      orderBy,
      take,
    }: {
      where?: Where;
      orderBy?: Record<string, "asc" | "desc">;
      take?: number;
    }) => sortRows(this.chats.filter((chat) => matches(chat as unknown as Row, where)), orderBy).slice(0, take),
    create: async ({
      data,
    }: {
      data: { userId: string; title: string; modelId: string | null };
    }) => {
      const now = new Date();
      const row: ChatRow = {
        id: this.id("chat"),
        generationLockUntil: null,
        generationRequestId: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      };
      this.chats.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<ChatRow> }) => {
      const chat = this.chats.find((item) => item.id === where.id);
      if (!chat) {
        throw new Error("Chat not found");
      }
      Object.assign(chat, data);
      return chat;
    },
    updateMany: async ({ where, data }: { where: Where; data: Partial<ChatRow> }) => {
      const matchesRows = this.chats.filter((chat) => matches(chat as unknown as Row, where));
      for (const chat of matchesRows) {
        Object.assign(chat, data);
      }
      return { count: matchesRows.length };
    },
    deleteMany: async ({ where }: { where: Where }) => {
      const before = this.chats.length;
      const removed = this.chats.filter((chat) => matches(chat as unknown as Row, where));
      const removedIds = new Set(removed.map((chat) => chat.id));
      this.chats = this.chats.filter((chat) => !removedIds.has(chat.id));
      this.messages = this.messages.filter((message) => !removedIds.has(message.chatId));
      return { count: before - this.chats.length };
    },
  };

  message = {
    findFirst: async ({ where, orderBy }: { where?: Where; orderBy?: Record<string, "asc" | "desc"> }) =>
      sortRows(this.messages.filter((message) => matches(message as unknown as Row, where)), orderBy)[0] ?? null,
    findMany: async ({
      where,
      orderBy,
      take,
    }: {
      where?: Where;
      orderBy?: Record<string, "asc" | "desc">;
      take?: number;
    }) =>
      sortRows(
        this.messages.filter((message) => matches(message as unknown as Row, where)),
        orderBy,
      ).slice(0, take),
    create: async ({ data }: { data: Omit<MessageRow, "id" | "createdAt" | "modelId" | "errorCode"> & Partial<MessageRow> }) => {
      const row: MessageRow = {
        id: this.id("message"),
        modelId: null,
        errorCode: null,
        createdAt: new Date(),
        ...data,
      };
      this.messages.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<MessageRow> }) => {
      if (this.failCompletedUpdate && data.status === "completed") {
        throw new Error("persistence failed");
      }
      const message = this.messages.find((item) => item.id === where.id);
      if (!message) {
        throw new Error("Message not found");
      }
      Object.assign(message, data);
      return message;
    },
  };

  async $transaction<T>(callback: (tx: FakePrisma) => Promise<T>): Promise<T> {
    return callback(this);
  }

  async $queryRaw(): Promise<Array<{ ok: number }>> {
    return [{ ok: 1 }];
  }
}
