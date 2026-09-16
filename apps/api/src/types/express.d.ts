// Explicit TypeScript augmentation for Express Request to attach correlation requestId
declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export {};
