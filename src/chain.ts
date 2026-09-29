import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import { XAN } from "./constants";
import type { VestingRow } from "./db";

export type Balances = Omit<VestingRow, "ts">;
export type VestingReader = (address: `0x${string}`) => Promise<Balances>;

const ABI = parseAbi([
  "function principalOf(address owner) view returns (uint256)",
  "function lockedBalanceOf(address owner) view returns (uint256)",
  "function unlockableBalanceOf(address owner) view returns (uint256)",
  "function unlockedBalanceOf(address owner) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
]);

export function makeVestingReader(rpcUrl: string): VestingReader {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl, { timeout: 10_000 }),
  });
  return async (address) => {
    const [principal, locked, unlockable, unlocked, balance] =
      await Promise.all([
        client.readContract({
          address: XAN,
          abi: ABI,
          functionName: "principalOf",
          args: [address],
        }),
        client.readContract({
          address: XAN,
          abi: ABI,
          functionName: "lockedBalanceOf",
          args: [address],
        }),
        client.readContract({
          address: XAN,
          abi: ABI,
          functionName: "unlockableBalanceOf",
          args: [address],
        }),
        client.readContract({
          address: XAN,
          abi: ABI,
          functionName: "unlockedBalanceOf",
          args: [address],
        }),
        client.readContract({
          address: XAN,
          abi: ABI,
          functionName: "balanceOf",
          args: [address],
        }),
      ]);
    return { principal, locked, unlockable, unlocked, balance };
  };
}
