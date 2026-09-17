export enum AuthProvider {
  PASSWORD = 'PASSWORD',
  GOOGLE = 'GOOGLE',
}

export enum WorkspaceRole {
  OWNER = 'OWNER',
}

export class PrismaClient {
  $connect = jest.fn().mockResolvedValue(undefined);
  $disconnect = jest.fn().mockResolvedValue(undefined);
  $queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
  $executeRaw = jest.fn().mockResolvedValue(1);
  $transaction = jest.fn().mockImplementation((cbOrArr: any) => {
    if (typeof cbOrArr === 'function') {
      return cbOrArr(this);
    }
    return Promise.all(cbOrArr);
  });

  user = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  authIdentity = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  workspace = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  workspaceMember = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}
