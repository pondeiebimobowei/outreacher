import { routeTree } from '../routeTree.gen';

describe('TanStack Router Generated Route Hierarchy', () => {
  it('should export a valid routeTree instance', () => {
    expect(routeTree).toBeDefined();
  });

  it('should contain pathless layout routes _authed and _guest as children of root', () => {
    const rawChildren =
      routeTree.children ??
      (routeTree as unknown as { options?: { children?: unknown } }).options?.children;
    expect(rawChildren).toBeDefined();

    const childrenList = Array.isArray(rawChildren)
      ? rawChildren
      : Object.values(rawChildren as Record<string, unknown>);
    const childIds = childrenList.map(
      (c: unknown) => (c as { id?: string }).id || (c as { options?: { id?: string } }).options?.id,
    );

    expect(childIds).toContain('/_authed');
    expect(childIds).toContain('/_guest');
  });

  it('should nest authenticated child routes under _authed layout boundary', () => {
    const rawChildren =
      routeTree.children ??
      (routeTree as unknown as { options?: { children?: unknown } }).options?.children;
    const childrenList = Array.isArray(rawChildren)
      ? rawChildren
      : Object.values(rawChildren as Record<string, unknown>);

    const authedRoute = childrenList.find(
      (c: unknown) =>
        ((c as { id?: string }).id || (c as { options?: { id?: string } }).options?.id) ===
        '/_authed',
    ) as { children?: unknown; options?: { children?: unknown } } | undefined;
    expect(authedRoute).toBeDefined();

    const rawAuthedChildren = authedRoute?.children ?? authedRoute?.options?.children;
    expect(rawAuthedChildren).toBeDefined();

    const authedChildrenList = Array.isArray(rawAuthedChildren)
      ? rawAuthedChildren
      : Object.values(rawAuthedChildren as Record<string, unknown>);
    const authedPaths = authedChildrenList.map(
      (c: unknown) =>
        (c as { path?: string; id?: string }).path ||
        (c as { id?: string }).id ||
        (c as { options?: { path?: string } }).options?.path,
    );

    expect(authedPaths).toContain('/');
    expect(authedPaths).toContain('/companies');
    expect(authedPaths).toContain('/campaigns');
    expect(authedPaths).toContain('/templates');
    expect(authedPaths).toContain('/settings');
  });

  it('should nest login child route under _guest layout boundary', () => {
    const rawChildren =
      routeTree.children ??
      (routeTree as unknown as { options?: { children?: unknown } }).options?.children;
    const childrenList = Array.isArray(rawChildren)
      ? rawChildren
      : Object.values(rawChildren as Record<string, unknown>);

    const guestRoute = childrenList.find(
      (c: unknown) =>
        ((c as { id?: string }).id || (c as { options?: { id?: string } }).options?.id) ===
        '/_guest',
    ) as { children?: unknown; options?: { children?: unknown } } | undefined;
    expect(guestRoute).toBeDefined();

    const rawGuestChildren = guestRoute?.children ?? guestRoute?.options?.children;
    expect(rawGuestChildren).toBeDefined();

    const guestChildrenList = Array.isArray(rawGuestChildren)
      ? rawGuestChildren
      : Object.values(rawGuestChildren as Record<string, unknown>);
    const guestPaths = guestChildrenList.map(
      (c: unknown) =>
        (c as { path?: string; id?: string }).path ||
        (c as { id?: string }).id ||
        (c as { options?: { path?: string } }).options?.path,
    );

    expect(guestPaths).toContain('/login');
  });
});
