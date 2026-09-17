// Explicit TypeScript augmentation for Express Request to attach correlation requestId, user, and workspace context
export interface RequestUser {
  id: string;
  email: string;
  name?: string | null;
}

export interface RequestWorkspace {
  id: string;
  name: string;
  ownerId: string;
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: User;
      workspace?: RequestWorkspace;
    }
  }
}

export {};
