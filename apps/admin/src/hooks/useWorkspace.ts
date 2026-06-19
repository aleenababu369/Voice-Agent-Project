import { useAppSelector } from "../app/hooks";

export function useWorkspace() {
  const platform = useAppSelector((state) => state.platform);
  const tenant = platform.tenants.find((item) => item.id === platform.selectedTenantId) ?? platform.tenants[0] ?? null;
  const actor = platform.users.find((item) => item.id === platform.selectedActorId) ?? platform.users[0] ?? null;
  const canEdit = actor ? actor.role !== "viewer" : false;
  return { platform, tenant, actor, canEdit };
}
