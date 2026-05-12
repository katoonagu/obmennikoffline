const ADMIN_ACTOR_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

export function isValidAdminActorId(actorId: string): boolean {
  return ADMIN_ACTOR_ID_PATTERN.test(actorId);
}

export function readAdminActorIdHeader(
  headerValue: string | string[] | undefined,
  allowedActorIds: ReadonlySet<string> | undefined,
): string {
  if (Array.isArray(headerValue)) {
    throw new Error('admin actor id is invalid');
  }

  const actorId = headerValue?.trim();

  if (!actorId) {
    throw new Error('admin actor id is required');
  }

  if (!isValidAdminActorId(actorId)) {
    throw new Error('admin actor id is invalid');
  }

  if (allowedActorIds && !allowedActorIds.has(actorId)) {
    throw new Error('admin actor id is not allowed');
  }

  return actorId;
}
