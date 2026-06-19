import { useAppSelector } from "../app/hooks";

export function useAccount() {
  const account = useAppSelector((state) => state.auth.account);
  return { account, useCase: account?.useCase ?? null };
}
